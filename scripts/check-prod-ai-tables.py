#!/usr/bin/env python3
"""Confere SOMENTE LEITURA quais tabelas de IA/conhecimento existem em produção.

Existe por causa de um caso real: `applyAiSchema()` cria as tabelas de IA à mão
no boot e MARCA as migrations correspondentes como executadas. Se esse script
deixar de criar alguma tabela que a migration criaria, a tabela nunca é criada
e a migration nunca roda — o buraco fica permanente e invisível para
`db:migrate:status`. Foi assim que `AiKnowledgeSuggestions` sumiu e o botão
"Ensinar IA" passou a devolver 500.
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

CHECK_JS = r"""
require('./dist/bootstrap');
const sequelize = require('./dist/database').default;
const { QueryTypes } = require('sequelize');
const schema = process.env.DB_SCHEMA || 'ticketz';

(async () => {
  const rows = await sequelize.query(
    `SELECT table_name AS n FROM information_schema.tables WHERE table_schema = :schema`,
    { replacements: { schema }, type: QueryTypes.SELECT }
  );
  const existentes = new Set(rows.map(r => r.n));

  const esperadas = [
    'AiKnowledgeSuggestions', 'AiCopilotSuggestions', 'AiReplayLogs',
    'AiConversationLogs', 'AiRoutingLogs', 'AiTicketTimelineEvents',
    'AiAgentKnowledgeBases', 'AiAgentQueues', 'AiAgentTools',
    'AiToolExecutionLogs', 'AiEscalationEmails',
    'KnowledgeBases', 'KnowledgeDomains', 'KnowledgeDocuments',
    'KnowledgeChunks', 'KnowledgeAssets', 'KnowledgeAssetVersions',
    'KnowledgeCategories', 'KnowledgeIngestionJobs',
    'ContactAiMemories', 'ContactAiMemoryJobs', 'ContactAiMemoryLogs',
    'ContentRepositoryItems', 'ContentRepositoryItemVersions',
    'ContentRepositoryPermissions', 'ContentRepositoryUsageLogs',
    'ContentRepositoryFavorites',
    'Brands', 'UserBrands'
  ];

  console.log(JSON.stringify({
    totalTabelas: existentes.size,
    faltando: esperadas.filter(n => !existentes.has(n)),
    presentes: esperadas.filter(n => existentes.has(n)).length
  }, null, 2));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
"""


def main() -> int:
    ps = (
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"Set-Content -Path '.\\__ai_tables.js' -Value @'\n{CHECK_JS}\n'@ -Encoding UTF8; "
        "node .\\__ai_tables.js; "
        "Remove-Item '.\\__ai_tables.js' -Force -EA SilentlyContinue"
    )
    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=120,
        read_timeout_sec=150,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
