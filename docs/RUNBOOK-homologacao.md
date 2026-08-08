# Runbook — Homologação Ticketz

Ambiente de homologação isolado de produção. Compartilha apenas a VPS física e
a conta/zona Cloudflare.

| | Produção | Homologação |
|---|---|---|
| Branch | `main` | `homolog` |
| Workflow | `deploy-prod.yml` | `deploy-homolog.yml` |
| Banco | Supabase atual | **Postgres próprio** |
| Schema | `ticketz` | `ticketz` (isolamento vem do banco) |
| Redis | `127.0.0.1:6379` | **`127.0.0.1:6380`** |
| Bucket B2 | atual | **próprio** |
| Diretório | `C:\ticketz\backend` | `C:\ticketz-homolog\backend` |
| Serviço | `TicketzBackend` | `TicketzBackendHomolog` |
| Porta | 8080 | 8090 |
| API | `api.fortmax.com.br` | `api-homolog.fortmax.com.br` |
| Frontend | `suporte.fortmax.com.br` | `homolog.fortmax.com.br` |

---

## Passo 1 — Criar os recursos externos

### Supabase (ou qualquer Postgres)

Crie um **projeto novo**. Não use o de produção, nem um schema dentro dele: três
migrations e um service hardcodam `ticketz.` em SQL cru, então um segundo schema
escreveria no schema de produção.

Copie de *Settings → Database*: host, porta, database, user, senha.

### Backblaze B2

- **Bucket:** novo, privado, ex. `ticketz-homolog`
- **Chave:** *Add a New Application Key* com acesso **somente a esse bucket**
  (campo *Allow access to Bucket*), permissão Read and Write
- Copie: `keyID`, `applicationKey`, o nome do bucket e o endpoint S3
  (`s3.<região>.backblazeb2.com`)

### Cloudflare Pages

- Projeto novo, ex. `fortmax-ticketz-homolog`
- Domínio customizado: `homolog.fortmax.com.br`
- O DNS de `api-homolog.fortmax.com.br` o workflow cria sozinho

### GitHub → Settings → Secrets and variables → Actions

| Secret | Valor |
|---|---|
| `HOMOLOG_VPS_IP` | IP da VPS Contabo |
| `HOMOLOG_VPS_PASSWORD` | senha do administrator |
| `HOMOLOG_DB_HOST` | host do Postgres de homologação |
| `HOMOLOG_DB_PORT` | `5432` |
| `HOMOLOG_DB_NAME` | database |
| `HOMOLOG_DB_USER` | usuário |
| `HOMOLOG_DB_PASS` | senha |
| `HOMOLOG_JWT_SECRET` | string aleatória **diferente** da de produção |
| `HOMOLOG_JWT_REFRESH_SECRET` | outra string aleatória |
| `HOMOLOG_REDIS_URI` | `redis://127.0.0.1:6380` |
| `HOMOLOG_B2_BUCKET` | nome do bucket |
| `HOMOLOG_B2_KEY_ID` | keyID |
| `HOMOLOG_B2_APPLICATION_KEY` | applicationKey |
| `HOMOLOG_B2_ENDPOINT` | endpoint S3 |
| `HOMOLOG_CF_PROJECT_NAME` | nome do projeto Pages |
| `PROD_DB_HOST_FRAGMENT` | trecho do host de produção (guard) |
| `PROD_B2_BUCKET` | nome do bucket de produção (guard) |

Opcionais — vazio significa desligado:
`HOMOLOG_OPENAI_API_KEY`, `HOMOLOG_RESEND_API_KEY`, `HOMOLOG_ESCALATION_EMAIL_TO`

> Gerar os JWT: `openssl rand -hex 32`

---

## Passo 2 — Provisionar a VPS (uma vez)

```bash
HOMOLOG_VPS_IP=<ip> HOMOLOG_VPS_PASSWORD=<senha> \
  python3 scripts/provision-vps-homolog.py --dry-run   # confira
HOMOLOG_VPS_IP=<ip> HOMOLOG_VPS_PASSWORD=<senha> \
  python3 scripts/provision-vps-homolog.py
```

Cria `C:\ticketz-homolog\`, `start-backend-homolog.cmd`, as tarefas
`TicketzBackendHomolog` e `TicketzRedisHomolog` (Redis 6380, dump próprio) e o
site IIS `ticketz-homolog` fazendo proxy de `api-homolog.fortmax.com.br` para
`127.0.0.1:8090`.

O script **aborta** se qualquer valor coincidir com produção, e ao final imprime
o estado de `TicketzBackend` e dos sites para conferência.

---

## Passo 3 — Deploy

```bash
git push origin homolog
```

Ou *Actions → Deploy Ticketz — HOMOLOGAÇÃO → Run workflow*.

O job `guard` roda antes de tudo e aborta se: a ref não for `homolog`; algum
destino coincidir com produção; algum secret obrigatório faltar; o banco, o
bucket ou o Redis apontarem para produção.

---

## Passo 4 — Migration, backfill e auditoria

O workflow já roda `db:migrate`. Os dois seguintes são manuais e conscientes:

```powershell
cd C:\ticketz-homolog\backend
$env:COMPANY_ID=1; npm run backfill:brands
$env:COMPANY_ID=1; npm run audit:brands
```

`audit:brands` sai com código 1 enquanto houver pendência bloqueante:
conexão sem marca ou funcionário comum sem marca.

**Resolva pela interface**, não por SQL:
- conexão sem marca → Administração → Conexões → campo *Marca*
- fila/agente/domínio → mesma coisa nas respectivas telas
- base → herda a marca do domínio
- funcionário → cadastro do usuário → *Empresas/Marcas que pode atender*

Rode de novo até sair limpo.

---

## Passo 5 — Ativar o isolamento

Só depois do audit limpo:

```powershell
$env:COMPANY_ID=1; npm run brand:isolation -- status
$env:COMPANY_ID=1; npm run brand:isolation -- enable
```

O comando **recusa** ligar se houver pendência. Para voltar, a qualquer momento:

```powershell
$env:COMPANY_ID=1; npm run brand:isolation -- disable
```

Ligado, funcionário comum sem marca perde todo o acesso. Admin e super não são
afetados.

---

## Passo 6 — Testes

| O que | Como |
|---|---|
| Marca no ticket | Mensagem na conexão Nível nasce com a marca Nível |
| Nome não manda | Renomeie a conexão; a marca não muda |
| Permissão | Funcionário só-Nível não vê Fortmax, na lista e por URL |
| Supervisor | `canAttend=false` abre mas não assume nem envia |
| Filtro | `Todas` mostra só as marcas permitidas |
| Marca nova | Crie uma marca sem relação com Nível/Fortmax pela UI |
| Storage | Anexe mídia num ticket e confirme no bucket de homologação |
| Redis | `redis-cli -p 6380 keys 'bull:*'` mostra as filas; a 6379 não muda |

---

## Rollback

```bash
HOMOLOG_VPS_IP=<ip> HOMOLOG_VPS_PASSWORD=<senha> \
  python3 scripts/homolog-rollback.py --dry-run
HOMOLOG_VPS_IP=<ip> HOMOLOG_VPS_PASSWORD=<senha> \
  python3 scripts/homolog-rollback.py
```

Troca `dist` por `dist-previous` (preservada a cada deploy) e reinicia. Segundos,
sem rede e sem build.

**Não desfaz migration**, de propósito: todas as colunas desta entrega são
`allowNull`, então o código anterior roda sobre o schema novo. Reverter schema com
dado gravado é mais arriscado do que conviver com colunas a mais.

---

## Quando algo falha

O workflow tem um passo `Diagnóstico em caso de falha` que traz para o próprio
run: SHA implantado, estado do serviço, porta escutando, variáveis não-secretas
do `.env` e as últimas 60 linhas de log.

| Sintoma | Causa provável |
|---|---|
| Guard aborta em secret | Secret não cadastrado |
| Guard aborta em Redis | `HOMOLOG_REDIS_URI` na 6379 |
| Migration falha em `uuid_generate_v4()` | Banco não é próprio — schema compartilhado |
| Backend não sobe, log cita `BaileysKeys` | Dump de produção importado; veja abaixo |
| `/health` não responde | Serviço parado ou IIS sem proxy para a 8090 |

### Importar dump de produção

O backend **recusa iniciar** se encontrar credenciais WhatsApp importadas —
senão a homologação reconectaria números reais. Antes de subir:

```sql
DELETE FROM "BaileysKeys";
UPDATE "Whatsapps" SET session = NULL, status = 'DISCONNECTED';
```

`ALLOW_IMPORTED_WHATSAPP=1` libera, e é liberação manual e temporária — não
coloque no `.env` permanente.
