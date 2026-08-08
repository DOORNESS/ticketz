#!/usr/bin/env python3
"""Vincula funcionários a marcas em produção, sem adivinhar.

Recebe pares `email=slug[:supervisor]` explícitos na linha de comando — nunca
infere marca por domínio de e-mail ou por nome. `:supervisor` grava
`canAttend=false` (enxerga a marca, não assume nem responde).

Idempotente: vínculo que já existe é mantido; só o que falta é criado.

Uso:
    python3 scripts/assign-prod-user-brands.py \\
        thiago@fortmax.com.br=fortmax cristiane@fortmax.com.br=fortmax
"""

import os
import sys

import winrm

HOST = os.environ.get("CONTABO_HOST", "31.220.103.226")
PASSWORD = (os.environ.get("CONTABO_PASSWORD") or "").strip() or "74h9UFeGPbGni0"
ROOT = os.environ.get("DEPLOY_ROOT", r"C:\ticketz")
COMPANY_ID = os.environ.get("COMPANY_ID", "1")

JS_TEMPLATE = r"""
require('./dist/bootstrap');
const sequelize = require('./dist/database').default;
const User = require('./dist/models/User').default;
const Brand = require('./dist/models/Brand').default;
const UserBrand = require('./dist/models/UserBrand').default;

const companyId = %(companyId)s;
const pedidos = %(pedidos)s;

(async () => {
  await sequelize.authenticate();
  const resultado = [];

  for (const p of pedidos) {
    const user = await User.findOne({ where: { companyId, email: p.email } });
    if (!user) { resultado.push({ ...p, status: 'USUARIO NAO ENCONTRADO' }); continue; }

    const brand = await Brand.findOne({ where: { companyId, slug: p.slug } });
    if (!brand) { resultado.push({ ...p, status: 'MARCA NAO ENCONTRADA' }); continue; }

    const [link, criado] = await UserBrand.findOrCreate({
      where: { companyId, userId: user.id, brandId: brand.id },
      defaults: { companyId, userId: user.id, brandId: brand.id, canAttend: p.canAttend }
    });

    if (!criado && link.canAttend !== p.canAttend) {
      await link.update({ canAttend: p.canAttend });
      resultado.push({ ...p, usuario: user.name, status: 'canAttend ajustado' });
    } else {
      resultado.push({
        ...p, usuario: user.name,
        status: criado ? 'vinculo criado' : 'ja existia (preservado)'
      });
    }
  }

  console.log(JSON.stringify(resultado, null, 2));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
"""


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    pedidos = []
    for arg in sys.argv[1:]:
        if "=" not in arg:
            print(f"Par inválido: {arg}", file=sys.stderr)
            return 2
        email, rest = arg.split("=", 1)
        slug, _, modo = rest.partition(":")
        pedidos.append(
            {
                "email": email.strip(),
                "slug": slug.strip(),
                "canAttend": modo.strip().lower() != "supervisor",
            }
        )

    import json

    js = JS_TEMPLATE % {
        "companyId": COMPANY_ID,
        "pedidos": json.dumps(pedidos),
    }

    ps = (
        f"$ErrorActionPreference='Continue'; Set-Location '{ROOT}\\backend'; "
        f"Set-Content -Path '.\\__assign.js' -Value @'\n{js}\n'@ -Encoding UTF8; "
        "node .\\__assign.js; "
        "Remove-Item '.\\__assign.js' -Force -EA SilentlyContinue"
    )

    session = winrm.Session(
        f"https://{HOST}:5986/wsman",
        auth=("administrator", PASSWORD),
        transport="basic",
        server_cert_validation="ignore",
        operation_timeout_sec=180,
        read_timeout_sec=210,
    )
    result = session.run_ps(ps)
    print((result.std_out or b"").decode("utf-8", errors="replace").strip())
    err = (result.std_err or b"").decode("utf-8", errors="replace").strip()
    if err:
        print(err[-2000:], file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
