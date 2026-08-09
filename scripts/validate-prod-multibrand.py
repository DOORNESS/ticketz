#!/usr/bin/env python3
"""Validação SOMENTE LEITURA do multimarcas em produção, com isolamento ligado.

Exercita as REGRAS REAIS do código (`BrandAccessService`, `canViewTicket`,
`socketBrandScope`, `BrandAiConfigService`), não consultas equivalentes escritas
aqui — um teste que reimplementa a regra não prova nada sobre a regra.
"""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip()
if not PASSWORD:
    raise SystemExit(
        "CONTABO_PASSWORD nao definido. A senha da VPS ficava hardcoded aqui "
        "como fallback, num repositorio publico. Defina a variavel de ambiente."
    )
ROOT = os.environ.get("DEPLOY_ROOT", r"C:\ticketz")

VALIDATE_JS = r"""
require('./dist/bootstrap');
const sequelize = require('./dist/database').default;
const { QueryTypes } = require('sequelize');
const sc = process.env.DB_SCHEMA || 'ticketz';
const q = x => sequelize.query(x, { type: QueryTypes.SELECT });

const User = require('./dist/models/User').default;
const Ticket = require('./dist/models/Ticket').default;
const Brand = require('./dist/models/Brand').default;
const Queue = require('./dist/models/Queue').default;

const access = require('./dist/services/BrandServices/BrandAccessService');
const aiCfg = require('./dist/services/BrandServices/BrandAiConfigService');
const canView = require('./dist/helpers/canViewTicket');

const linha = (nome, ok, detalhe) =>
  `${ok ? 'OK  ' : 'FALHA'}  ${nome}${detalhe ? '  — ' + detalhe : ''}`;

(async () => {
  const saida = [];
  const companyId = 1;

  const brands = await Brand.findAll({ where: { companyId }, order: [['id','ASC']] });
  saida.push(linha('marcas ativas', brands.length === 2,
    brands.map(b => `${b.slug}(#${b.id})`).join(', ')));

  const enforced = await access.isBrandIsolationEnforced(companyId);
  saida.push(linha('brandIsolationEnforced ligado', enforced === true, String(enforced)));

  const usuarios = await User.findAll({
    where: { companyId }, include: [Brand], order: [['id','ASC']]
  });

  for (const u of usuarios) {
    const acesso = await access.getBrandAccessForUser(u.id);
    // A funcao recebe o objeto de acesso, nao o userId. Passar o id fazia
    // `isUnrestricted` virar undefined e o filtro sair [] para todo mundo.
    const filtroPadrao = access.resolveBrandFilterForQuery(acesso, undefined);
    const filtroTentandoNivel = access.resolveBrandFilterForQuery(acesso, [1]);
    saida.push(linha(
      `acesso de ${u.name} (${u.profile}${u.super ? '/super' : ''})`,
      true,
      `visiveis=${JSON.stringify(acesso.visibleBrandIds)} ` +
      `filtro(Todas)=${JSON.stringify(filtroPadrao)} ` +
      `filtro(pedindo Nivel)=${JSON.stringify(filtroTentandoNivel)}`
    ));
  }

  const tickets = await Ticket.findAll({ where: { companyId }, order: [['id','ASC']] });
  saida.push(linha('tickets com marca',
    tickets.every(t => t.brandId), tickets.map(t => `#${t.id}:brand${t.brandId}`).join(' ')));

  for (const u of usuarios) {
    const full = await User.findByPk(u.id, { include: [Brand, Queue] });
    full.brandIsolationEnforced = enforced;
    const vis = tickets.map(t => `#${t.id}:${canView.default(t, full) ? 've' : 'NAO ve'}`);
    saida.push(linha(`visibilidade de ${u.name}`, true, vis.join(' ')));
  }

  const todasBases = (await q(
    `SELECT id FROM "${sc}"."KnowledgeBases" WHERE "companyId"=1 AND active=true`
  )).map(r => r.id);

  for (const b of brands) {
    const permitidas = await aiCfg.restrictKnowledgeBasesToBrand(companyId, b.id, todasBases);
    const negadas = todasBases.filter(i => !permitidas.includes(i));
    const nomes = await q(
      `SELECT id,name FROM "${sc}"."KnowledgeBases" WHERE id IN (${permitidas.join(',') || 0})`
    );
    const agente = await aiCfg.getAgentForBrand(companyId, b.id);
    saida.push(linha(`RAG ${b.slug}`, negadas.length > 0,
      `agente=${agente ? agente.name : 'nenhum'} bases=[${nomes.map(n=>n.name).join(' | ')}] negadas=${negadas.length}`));
  }


  // Dashboard, busca, relatorios e socket: mesmas regras, caminhos distintos.
  const socketScope = require('./dist/helpers/socketBrandScope');
  const dash = require('./dist/services/ReportService/DashboardService');

  for (const u of usuarios) {
    const full = await User.findByPk(u.id, { include: [Brand, Queue] });
    const acesso = await access.getBrandAccessForUser(u.id);

    // busca / listagem: filtro aplicado na consulta
    const filtro = access.resolveBrandFilterForQuery(acesso, undefined);
    const visiveis = filtro === null
      ? tickets
      : tickets.filter(t => filtro.includes(Number(t.brandId)));
    saida.push(linha(`busca/listagem de ${u.name}`, true,
      `${visiveis.length} de ${tickets.length} ticket(s)`));

    // dashboard: conta so o que o usuario pode ver
    let resumo = 'n/d';
    try {
      const escopo = await dash.resolveDashboardBrandScope(u.id);
      const st = await dash.statusSummaryService(companyId, u.id);
      resumo = `escopoMarcas=${JSON.stringify(escopo)} tickets=${JSON.stringify(st.ticketsStatusSummary)}`;
    } catch (e) { resumo = 'erro: ' + e.message; }
    saida.push(linha(`dashboard de ${u.name}`, true, resumo.slice(0, 160)));

    // socket: salas de fila que o usuario pode ouvir
    try {
      const salas = await socketScope.socketQueuesForUser(full);
      saida.push(linha(`socket de ${u.name}`, true, `filas=${JSON.stringify(salas)}`));
    } catch (e) {
      saida.push(linha(`socket de ${u.name}`, false, e.message));
    }
  }

  const conexoes = await q(
    `SELECT w.name, w.status, b.slug FROM "${sc}"."Whatsapps" w
      LEFT JOIN "${sc}"."Brands" b ON b.id=w."brandId" WHERE w."companyId"=1 ORDER BY w.id`
  );
  saida.push(linha('conexões WhatsApp',
    conexoes.every(c => c.status === 'CONNECTED' && c.slug),
    conexoes.map(c => `${c.name}=${c.status}/${c.slug}`).join(', ')));

  console.log(saida.join('\n'));
  process.exit(0);
})().catch(e => { console.log('ERRO: ' + e.message + '\n' + e.stack); process.exit(1); });
"""


def write_remote_file(session, remote_path: str, content: str) -> None:
    """Escreve um arquivo na VPS em blocos.

    WinRM tem limite de tamanho na linha de comando do Windows; mandar o
    script inteiro numa chamada só devolve "The command line is too long".
    Mesma solução do deploy: base64 em pedaços, concatenados no destino.
    """
    import base64

    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    chunk = 1200
    session.run_ps(f"Remove-Item '{remote_path}.b64' -Force -EA SilentlyContinue")
    for i in range(0, len(encoded), chunk):
        part = encoded[i : i + chunk]
        session.run_ps(f"Add-Content -Path '{remote_path}.b64' -Value '{part}' -NoNewline")
    session.run_ps(
        f"$b=Get-Content '{remote_path}.b64' -Raw; "
        f"[IO.File]::WriteAllBytes('{remote_path}', [Convert]::FromBase64String($b)); "
        f"Remove-Item '{remote_path}.b64' -Force"
    )


def main() -> int:
    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=240,
        read_timeout_sec=270,
    )

    remote = f"{ROOT}\\backend\\__validate.js"
    write_remote_file(session, remote, VALIDATE_JS)

    result = session.run_ps(
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"node '{remote}'; Remove-Item '{remote}' -Force -EA SilentlyContinue"
    )
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
