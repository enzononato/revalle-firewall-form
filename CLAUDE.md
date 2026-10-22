# CLAUDE.md — Formulários Revalle

Portal de formulários públicos internos da **Revalle** (distribuidora) + painel administrativo `/dashboard`.
Começou como formulário de desbloqueio de sites no firewall e hoje reúne vários módulos (ver abaixo).
Repositório: `github.com/enzononato/revalle-firewall-form` — branch principal `main`.
Produção: EasyPanel (Docker) em `https://agente-revalle-firewall-form.tj0vdr.easypanel.host`.

> O `README.md` está desatualizado (descreve só o formulário de firewall). Este arquivo é a referência atual.

## Stack

- **Backend:** Node.js ≥ 20 + Express 4 (CommonJS, sem framework extra, sem TypeScript, sem build).
- **Frontend:** HTML/CSS/JS puro em `public/` (sem bundler). Chart.js via CDN no dashboard; fontes Google.
- **Banco:** PostgreSQL via `pg` (SQL escrito à mão, sem ORM). As tabelas próprias são criadas/migradas no boot por `initDb()` em `db.js` (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Não há pasta de migrations.
- **E-mail:** `nodemailer` via SMTP do cPanel da Revalle.
- **Uploads:** `multer` em memória; PDFs de contratos ficam **dentro do Postgres** (`contract_files`, bytea).
- **ZIP:** `archiver` (export de contratos em streaming).
- **Deploy:** `Dockerfile` (node:20-alpine) → EasyPanel faz build a partir do push no GitHub.

## Instalar / rodar / testar

```bash
npm install
cp .env.example .env      # preencher valores (ver seção de variáveis)
npm run dev               # node --env-file=.env --watch server.js  → http://localhost:3000
npm start                 # produção (lê env do ambiente, não do .env)
```

- O servidor **sai com erro** se `DATABASE_URL` não estiver definida ou se o Postgres não responder no boot.
- **Não há testes automatizados nem lint.** Verificação mínima: `node --check server.js db.js mailer.js security.js` e testar as rotas manualmente (curl ou navegador). `GET /api/health` → `{ ok: true }`.
- Dashboard: `/dashboard/login`. No primeiro boot com banco vazio é criado o usuário `admin@revalle.com.br` com a senha = `DASHBOARD_PASSWORD`.

### Rodando na nuvem (Claude Code web / celular)

O banco de produção **não é acessível** de fora da VPS. Para rodar, suba um Postgres descartável no sandbox:

```bash
# opção 1 (apt)
sudo apt-get update && sudo apt-get install -y postgresql && sudo service postgresql start
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE revalle;"
# opção 2 (docker, se disponível)
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=revalle -p 5432:5432 postgres:16

# .env mínimo para dev local
DATABASE_URL=postgres://postgres:postgres@localhost:5432/revalle
PGSSL=false
DASHBOARD_PASSWORD=dev123
APP_URL=http://localhost:3000
# deixe SMTP_PASS vazio → e-mails são só logados no console, não enviados
```

Os formulários que validam CPF (Sólides, Treinamento IA, Pesquisa de Cultura, Ideias, Atualização Cadastral) dependem da tabela externa `"colaboradores-revalle"`. Para testá-los, crie uma versão fake:

```sql
CREATE TABLE "colaboradores-revalle" (cpf text, nome text, cargo text, setor text, unidade text, status text);
INSERT INTO "colaboradores-revalle" VALUES ('12345678909','Fulano de Tal','Analista','TI','Revalle Juazeiro','ativo');
```

## Estrutura

```
server.js        # TUDO de HTTP: rotas públicas, APIs, auth/RBAC do dashboard, validações, CSV/ZIP (~2.1k linhas)
db.js            # pool pg, initDb() (schema + migrações), todas as queries, detecção dinâmica da tabela de colaboradores
mailer.js        # templates HTML e envio de e-mails (TI, aprovação/reprovação, contratos)
security.js      # anti-bot: tokens HMAC, desafio PoW, honeypot, rate limit por IP, biometria comportamental
views/           # dashboard.html, login.html (servidos por rota, protegidos)
public/          # páginas públicas + JS/CSS de cada módulo (index = firewall)
  dashboard.js / dashboard.css   # SPA do painel (todas as abas)
Dockerfile, .dockerignore
```

### Módulos (página pública → tabela)

| Módulo | Rota pública | Tabelas |
|---|---|---|
| Desbloqueio de sites (firewall) | `/` | `firewall_requests` (aprovar/reprovar por link de e-mail `/api/approve|reject/:token` ou pelo painel) |
| Contratos | `/contratos` | `contract_requests`, `contract_files` (PDFs) |
| Imersão TESS | `/imersao-tess-form` | `imersao_tess_requests` |
| Treinamento Sólides (ponto) | `/treinamento-solides` | `solides_treinamento_assinaturas`, `solides_treinamento_permissoes` |
| Treinamento IA / LGPD / Intranet | `/treinamento-ia` (`/termo-ia`, `/treinamento-ia-intranet`) | `treinamento_ia_assinaturas`, `treinamento_ia_permissoes` |
| Treinamento Passivo Trabalhista (só lideranças habilitadas) | `/passivo-trabalhista` | `passivo_trabalhista_assinaturas`, `passivo_trabalhista_permissoes` (via `createTermoComHabilitados` em `db.js`, reutilizável para novos termos; CPFs liberados colando a lista no painel — **nunca commitar CPFs, o repo é público**) |
| Pesquisa de Cultura (anônima) | `/pesquisa-cultura` | `pesquisa_cultura_participantes` (adesão), `pesquisa_cultura_respostas` (sem vínculo com CPF) |
| Ideias e Melhorias | `/ideias-melhorias` (`/ideias`, `/melhorias`) | `ideias_melhorias` |
| Atualização Cadastral (e-mail profissional, celular, superior direto) | `/atualizacao-cadastral` (`/dados-colaborador`) | `atualizacao_cadastral` (1 registro por CPF; reenviar atualiza. CPF precisa estar ativo em `"colaboradores-revalle"`) |
| Usuários do painel | — | `dashboard_usuarios` (perfis `admin` e `mkt_cultura`) |

## Convenções

- Idioma: código, comentários, mensagens e commits em **português sem acentos** na maior parte (alguns arquivos têm acentos; siga o arquivo).
- Commits: Conventional Commits em português — `feat(contratos): ...`, `fix(dashboard): ...`, `security: ...`, `perf: ...`.
- Novo módulo = página em `public/<modulo>.html` + `public/<modulo>.js`, rota `app.get` em `server.js`, `CREATE TABLE IF NOT EXISTS` em `initDb()`, funções de query em `db.js` exportadas, aba no `views/dashboard.html` + `public/dashboard.js`, export CSV em `/api/dashboard/export/<modulo>.csv`.
- **Validação sempre no back** (o front também valida, mas o servidor nunca confia nele). CPF com dígitos verificadores.
- Respostas JSON: `{ ok: true, ... }` / `{ ok: false, errors: [...] }` (dashboard usa `error`).
- Rotas do painel protegidas com `requireAuth` / `requireRole(['admin'])` / `requireRole(['admin','mkt_cultura'])`.
- Formulários públicos sensíveis usam `antiBotRateLimiter` + token de `/api/security/challenge` (ver `security.js`).
- **Pesquisa de Cultura é anônima por design:** não registrar data/hora nem qualquer dado que permita correlacionar resposta com participante.
- Schema muda só por `ADD COLUMN IF NOT EXISTS` em `initDb()` — nunca dropar/alterar colunas existentes (produção tem dados reais).
- E-mails corporativos aceitos: `@revalle.com.br`, `@revallepe…`, `@revallenordeste…` (ver commit d48fbf3).

## Variáveis de ambiente

Nomes em `.env.example`. `.env` é ignorado pelo git — nunca commitar.

| Variável | Obrigatória | Uso | Funciona na nuvem? |
|---|---|---|---|
| `DATABASE_URL` | **sim** | Postgres. Em produção aponta para `agente_revalle_postgres` (hostname **interno** do EasyPanel) | ❌ produção não; use Postgres local no sandbox |
| `PGSSL` | não (`false`) | SSL no Postgres | ✅ |
| `PG_MAX_POOL` | não (`25`) | Tamanho do pool | ✅ |
| `PORT` | não (`3000`) | Porta HTTP | ✅ |
| `NODE_ENV` | não | `production` no Docker | ✅ |
| `APP_URL` | sim p/ e-mail | URL pública; monta links Aprovar/Reprovar | ✅ (use `http://localhost:3000`) |
| `DASHBOARD_PASSWORD` | sim p/ painel | Senha do admin padrão / login legado | ✅ (qualquer valor em dev) |
| `DASHBOARD_SESSION_SECRET` | não | Assina cookie de sessão (default: derivado da senha) | ✅ |
| `ANTI_BOT_SECRET` | não | Assina tokens anti-bot (default: aleatório a cada boot) | ✅ |
| `PESQUISA_CULTURA_ENCERRADA` | não | **Default = encerrada** (`!== 'false'`). Use `false` para reabrir a pesquisa | ✅ |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | não | SMTP cPanel `mail.revalle.com.br:465`. Sem `SMTP_PASS` só loga | ⚠️ não usar credenciais reais na nuvem; deixe `SMTP_PASS` vazio |
| `SMTP_TO`, `SMTP_TO_CONTRATOS` | não | Destinatários (firewall / contratos) | ✅ |

## Serviços externos e o que NÃO funciona na nuvem

- ❌ **Postgres de produção** (container `agente_revalle_postgres` na VPS/EasyPanel, rede interna). Sem acesso remoto → sem dados reais.
- ❌ **Tabela `"colaboradores-revalle"`** — base de colaboradores alimentada por **outro sistema** (RH/Sólides) no mesmo banco; o app só lê e detecta colunas dinamicamente (`db.js` ~linha 730+). Na nuvem, use a tabela fake acima.
- ⚠️ **SMTP cPanel** (`mail.revalle.com.br`) — exige senha real e a porta 465 pode estar bloqueada no sandbox. Deixe desativado.
- ❌ **EasyPanel / deploy** — o painel e os logs de produção só são acessíveis pelo navegador com login; o deploy acontece no push para `main` (confirme no EasyPanel se o auto-deploy está ligado antes de dar push direto).
- ✅ CDNs (Google Fonts, jsDelivr/Chart.js) — só afetam o navegador.

## Estado atual (2026-10-16)

- `main` limpo e sincronizado com `origin/main`; nenhum trabalho em andamento não commitado.
- Último trabalho (set–out/2026) foi no **módulo de Contratos** e e-mail:
  - 2026-10-07 `1cd9824` — download de todos os contratos em ZIP (botão na aba Contratos, respeita filtros, streaming com `archiver`).
  - 2026-09-25 — aceitar e-mails `@revallepe` e `@revallenordeste`.
  - 2026-09-22 — status cancelado/reativar contrato; setor FROTA em contratos.
  - 2026-09-11 — Ideias e Melhorias (fix de token de segurança e layout).
- Pesquisa de Cultura está **encerrada** por padrão (`PESQUISA_CULTURA_ENCERRADA`).
- Não há TODO/FIXME no código.

## Próximos passos (sugeridos — confirmar com o Enzo)

1. Validar em produção o ZIP de contratos com volume grande (memória/timeout do proxy do EasyPanel).
2. Atualizar o `README.md` para refletir todos os módulos (hoje só fala do firewall).
3. Criar pelo menos testes de fumaça (ex.: `node:test` + Postgres local) para validação de CPF e rotas de submit.
4. `server.js` e `db.js` estão com ~2k linhas cada — considerar dividir por módulo (`routes/<modulo>.js`) se for mexer muito.
