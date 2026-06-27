# Revalle - Formulario de Desbloqueio de Sites

Formulario web publico para colaboradores da **Revalle** solicitarem o desbloqueio de sites no firewall corporativo. As solicitacoes sao armazenadas em PostgreSQL.

Stack: **Node.js + Express** no backend, **HTML/CSS/JS puro** no front, **PostgreSQL** para persistencia. Deploy via **EasyPanel** (Dockerfile).

---

## Estrutura

```
.
├── Dockerfile
├── package.json
├── server.js              # Express + rotas + validacao
├── db.js                  # pool Postgres + criacao da tabela
├── .env.example
├── .dockerignore
├── .gitignore
└── public/
    ├── index.html
    ├── styles.css
    └── script.js
```

---

## Rodando localmente

Pre-requisitos: Node 20+ e um Postgres acessivel.

```bash
cp .env.example .env
# edite .env com as credenciais do seu Postgres

npm install
npm start
```

A aplicacao sobe em `http://localhost:3000`.

Na primeira inicializacao o app cria a tabela `firewall_requests` automaticamente (via `CREATE TABLE IF NOT EXISTS`) — nenhuma outra tabela do banco e tocada.

---

## Variaveis de ambiente

| Variavel       | Obrigatoria | Default | Descricao |
|----------------|-------------|---------|-----------|
| `DATABASE_URL` | sim         | —       | Connection string do Postgres: `postgres://user:pass@host:5432/db` |
| `PGSSL`        | nao         | `false` | `true` para conectar com SSL (geralmente nao precisa quando o Postgres esta na mesma rede interna do EasyPanel) |
| `PORT`         | nao         | `3000`  | Porta interna do container |
| `DASHBOARD_PASSWORD`       | sim (p/ painel) | — | Senha unica de acesso ao painel `/dashboard`. Sem ela o painel fica inacessivel. |
| `DASHBOARD_SESSION_SECRET` | nao         | derivado da senha | Segredo para assinar o cookie de sessao. Defina um valor aleatorio longo para manter sessoes validas mesmo trocando a senha. |
| `SMTP_*` / `SMTP_TO*`      | nao         | —       | Config de e-mail (veja `.env.example`). Sem `SMTP_PASS` os e-mails sao apenas logados, nao enviados. |

---

## Dashboard de controle (`/dashboard`)

Painel administrativo protegido por senha (`DASHBOARD_PASSWORD`) para a TI acompanhar **solicitacoes de firewall** e **contratos** em um so lugar.

- **Login:** `/dashboard/login` — senha unica do `.env`. A sessao usa cookie HttpOnly assinado (HMAC), valido por 8h.
- **Visao Geral:** KPIs + graficos (volume mensal, status, por unidade/setor, sites mais pedidos, contratos por revenda) e um radar de vencimentos dos proximos 90 dias.
- **Solicitacoes:** lista filtravel (status, unidade, setor, busca) com **aprovar/reprovar direto no painel** — dispara o mesmo e-mail ao colaborador que o fluxo dos links do e-mail.
- **Contratos:** carteira com destaque de vigencia (vigente / a vencer / vencido), download dos PDFs anexados.
- **Exportacao CSV** das duas listagens, respeitando os filtros aplicados.

O painel usa **apenas consultas de leitura** sobre as tabelas existentes — nenhum schema e alterado.

---

## Tabela criada

```sql
CREATE TABLE IF NOT EXISTS firewall_requests (
  id            SERIAL PRIMARY KEY,
  unidade       VARCHAR(50)  NOT NULL,
  nome_completo VARCHAR(200) NOT NULL,
  cpf           VARCHAR(11)  NOT NULL,
  cargo         VARCHAR(150) NOT NULL,
  funcao        VARCHAR(150) NOT NULL,
  urls          TEXT[]       NOT NULL,
  justificativa TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

Consulta util pra TI listar as ultimas solicitacoes:

```sql
SELECT id, created_at, unidade, nome_completo, cpf, cargo, funcao, urls, justificativa
FROM firewall_requests
ORDER BY created_at DESC
LIMIT 50;
```

---

## Deploy no EasyPanel

1. **Crie um projeto no Git** (GitHub/GitLab) com esse codigo e faca push.
2. No EasyPanel, crie um novo **App** do tipo **App** (nao Postgres) apontando para esse repositorio. O EasyPanel vai detectar o `Dockerfile` automaticamente.
3. Em **Environment**, configure as variaveis:
   - `DATABASE_URL` — connection string do Postgres que ja roda na sua VPS. Se o Postgres estiver criado como um servico do proprio EasyPanel, voce pode usar o host interno (ex.: `postgres://user:pass@<nome-do-servico>:5432/<db>`).
   - `PGSSL=false` (geralmente)
   - `PORT=3000` (opcional — ja e o default)
4. Em **Domains**, adicione o dominio/subdominio que vai apontar para o app (ex.: `firewall.seudominio.com.br`). O EasyPanel cuida do reverse proxy e do certificado SSL.
5. Deploy. Apos subir, acesse o dominio configurado.

> **Sobre porta:** cada app no EasyPanel roda em seu proprio container com rede isolada, entao a porta `3000` interna nao entra em conflito com outros apps. O acesso externo e sempre via o dominio configurado.

---

## Endpoints da API

| Metodo | Rota             | Descricao |
|--------|------------------|-----------|
| GET    | `/`              | Pagina do formulario |
| GET    | `/api/unidades`  | Lista as unidades validas |
| GET    | `/api/health`    | Healthcheck (retorna `{ ok: true }`) |
| POST   | `/api/submit`    | Recebe a solicitacao e persiste no banco |

### Payload do `POST /api/submit`

```json
{
  "unidade": "Revalle Juazeiro",
  "nome_completo": "Fulano de Tal",
  "cpf": "12345678909",
  "cargo": "Analista",
  "funcao": "Vendas",
  "urls": ["https://exemplo.com", "https://outro.com.br"],
  "justificativa": "Necessario para acessar portal do fornecedor X."
}
```

### Resposta

- `201 Created` → `{ "ok": true, "id": 123, "created_at": "..." }`
- `400 Bad Request` → `{ "ok": false, "errors": ["..."] }`
- `500 Internal Server Error` → `{ "ok": false, "errors": ["..."] }`

---

## Validacoes

- **Unidade**: precisa ser uma das 7 unidades cadastradas
- **Nome completo**: minimo 3 caracteres, exige nome + sobrenome
- **CPF**: validacao completa com digitos verificadores (algoritmo BR)
- **Cargo / Funcao**: obrigatorios, texto livre
- **URLs**: 1 a 20 URLs, cada uma com hostname valido. URLs sem `http://`/`https://` recebem `http://` automaticamente.
- **Justificativa**: minimo 10 caracteres

Validacao acontece **no front e no back** — o servidor nunca confia no cliente.

---

## Proximos passos (sugestoes)

- Notificacao por e-mail para a TI a cada nova solicitacao (estrutura ja pronta pra plugar em `server.js` no handler do `/api/submit`).
- reCAPTCHA / Cloudflare Turnstile para evitar spam, ja que o formulario e publico.
- Tela administrativa simples (com login) caso a TI nao queira consultar o banco direto.
