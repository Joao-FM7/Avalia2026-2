# Projeto #13 — Temporizador Pomodoro com Métricas de Estudo

**Chave Única de Auditoria:** `P26-2A-63CE-527A-2990-8D25`
**Deploy público (Cloudflare Pages):** `https://pomodoro-p26-2a.pages.dev`

| | |
|---|---|
| Estudante | João Fidalgo Marinho |
| Turma | 2A |
| RA (Matrícula) | 2026109268 |
| E-mail | joao.f.m1206@gmail.com |
| Licença | MIT (`LICENSE`) |

Gerenciador de tempo baseado na técnica Pomodoro: ciclos configuráveis de foco e pausa, relógio regressivo controlado por `setInterval` + deltas de `Date.now()`, alerta visual ao fim de cada ciclo e registro do tempo estudado por disciplina no Cloudflare D1, com login exclusivo via Discord OAuth2.

---

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Interface | HTML5 semântico, CSS3 e **JavaScript puro** (módulos ES) — nenhum framework de UI, nenhum build step |
| Backend | Cloudflare **Pages Functions** (`functions/`) |
| Banco | Cloudflare **D1** (SQLite relacional) |
| Autenticação | **Discord OAuth2** (`scope=identify`) com sessão assinada por HMAC-SHA256 |
| Deploy | Cloudflare Pages conectado ao repositório (root directory = esta pasta) |

---

## 2. Como o relógio funciona (requisito da disciplina)

O tempo restante **não** é decrementado a cada tick. O estado guarda `endsAt`, e cada tick recalcula:

```js
remaining = Math.max(0, endsAt - Date.now());
```

Consequências diretas:

- aba em segundo plano: o navegador estrangula o `setInterval`, mas o delta continua exato;
- ao voltar para a aba, `visibilitychange` / `focus` / `pageshow` disparam um `tick()` imediato;
- pausa guarda `remainingMs` e zera `endsAt`; retomar reancora `endsAt = now + remainingMs`;
- se o relógio do sistema voltar no tempo, o timer reancora em vez de "ganhar" tempo.

Fim de ciclo dispara **uma única vez**: faixa de alerta (`role="status"`, `aria-live="assertive"`), título da aba piscando, beep opcional via WebAudio e troca de fase. Só ciclos de **foco** são enviados ao servidor; "Pular" não registra nada.

---

## 3. Regras de negócio validadas no servidor

O cliente envia apenas intenção (`subjectId`, `startedAt`, `endedAt`, `plannedSeconds`, `clientToken`). O servidor:

| Verificação | Resposta |
|---|---|
| Sessão HMAC válida — `user_id` **só** vem do cookie | 401 |
| `subjectId` pertence ao usuário autenticado e está ativo | 403 |
| `endedAt > startedAt`, fim não está no futuro (tolerância 5 min), início nas últimas 12 h | 400 |
| Duração ≥ 60 s e ≥ 50 % do planejado | 400 |
| `studiedSeconds` recalculado do intervalo real e **limitado ao planejado** | — |
| Mesmo `clientToken` reenviado | 200 `{ duplicate: true }` |
| Mais de 1 hora de estudo acumulada na última hora | 429 |
| Nome de disciplina 2–40 caracteres, máx. 12 ativas, único entre ativas | 400 / 409 |

Nenhuma query é montada por concatenação: tudo passa por `env.DB.prepare(...).bind(...)`.

---

## 4. API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/auth/discord` | Inicia o OAuth2 com `state` anti-CSRF |
| GET | `/api/auth/discord/callback` | Troca o code, importa `user_id`, nome e avatar, cria a sessão |
| POST | `/api/auth/logout` | Encerra a sessão |
| GET | `/api/me` | Perfil autenticado |
| GET / POST | `/api/subjects` | Lista / cria disciplinas |
| DELETE | `/api/subjects/:id` | Arquiva (soft delete) preservando o histórico |
| GET / POST | `/api/sessions` | Histórico recente / registra um ciclo de foco |
| GET | `/api/stats` | Total da semana, hoje, total geral e distribuição por disciplina |

Semana no fuso `America/Sao_Paulo` (UTC-3), de segunda a domingo, calculada em `functions/_lib/stats.js` e coberta por teste.

---

## 5. Banco de dados (D1)

```sql
users          (user_id PK, username, display_name, avatar, created_at, updated_at)
subjects       (id, user_id, name, color, archived, created_at)
focus_sessions (id, user_id, subject_id, planned_seconds, studied_seconds,
                started_at, ended_at, client_token, created_at)
```

- Índice único `(user_id, lower(name)) WHERE archived = 0` — evita disciplina duplicada.
- Índice único `(user_id, client_token)` — idempotência do registro.
- Índices de leitura `(user_id, started_at DESC)` e `(user_id, subject_id)`.
- Datas sempre em ISO-8601 UTC, gravadas explicitamente (comparação lexicográfica correta).

Migração: `migrations/0001_init.sql`.

---

## 6. Rodando localmente

Pré-requisitos: Node.js ≥ 18 e uma conta Cloudflare (só para publicar). Wrangler é a única devDependency.

```powershell
# na raiz desta pasta
npm.cmd install
copy .dev.vars.example .dev.vars      # preencha DISCORD_* e SESSION_SECRET
npx.cmd wrangler d1 migrations apply DB --local
npx.cmd wrangler pages dev            # http://127.0.0.1:8788
```

Testes:

```powershell
node --test tests/                    # unidade: relógio, validação, fuso, formatação
node tests/api.integration.mjs        # contrato HTTP (com o pages dev rodando)
```

---

## 7. Deploy na Cloudflare

1. **D1**
   ```powershell
   npx.cmd wrangler d1 create db-p26-2a-63ce-527a-2990-8d25
   # copie o database_id para wrangler.jsonc
   npx.cmd wrangler d1 migrations apply DB --remote
   ```
2. **Discord Developer Portal** → New Application → OAuth2:
   - copie `Client ID` e `Client Secret`;
   - adicione o redirect `https://pomodoro-p26-2a.pages.dev/api/auth/discord/callback`.
3. **Cloudflare Pages** (projeto `pomodoro-p26-2a`, deploy direto pelo Wrangler):
   ```powershell
   npx.cmd wrangler pages project create pomodoro-p26-2a --production-branch main
   npx.cmd wrangler pages deploy public --project-name pomodoro-p26-2a --branch main
   ```
   O `wrangler.jsonc` já aponta `pages_build_output_dir` para `public` e declara o binding `DB` do D1;
   não há build step.
4. **Segredos do projeto** (nunca versionados):
   ```powershell
   npx.cmd wrangler pages secret put DISCORD_CLIENT_ID     --project-name pomodoro-p26-2a
   npx.cmd wrangler pages secret put DISCORD_CLIENT_SECRET --project-name pomodoro-p26-2a
   npx.cmd wrangler pages secret put SESSION_SECRET        --project-name pomodoro-p26-2a
   ```
   Depois de qualquer segredo novo, refaça o `pages deploy` para o deployment passar a enxergá-lo.
5. **Resultado:** <https://pomodoro-p26-2a.pages.dev> — login real com Discord, D1 em produção e
   redirect `https://pomodoro-p26-2a.pages.dev/api/auth/discord/callback` registrado no portal.

`SESSION_SECRET` nunca é versionado: se faltar, toda rota autenticada responde `401` (falha fechada — ninguém entra)
em vez de aceitar sessão sem assinatura.

---

## 8. Segurança

- Sessão `HttpOnly; SameSite=Lax; Secure` com payload + assinatura HMAC-SHA256 e `exp` conferido no servidor.
- `state` OAuth2 de uso único (cookie de 10 minutos) — bloqueia CSRF no callback.
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` no `_middleware.js`.
- Nenhum `innerHTML` com dado de usuário; nomes e histórico entram por `textContent`.
- Nenhum segredo no repositório: `.dev.vars` está no `.gitignore`; só `.dev.vars.example` é versionado.

---

## 9. Engenharia de agentes

Foram usados **4 agentes**, sendo um exclusivamente de teste e validação, em harness **OpenCode**. Papéis, prompts, skills e evidências estão em [`AGENTS.md`](./AGENTS.md); as saídas reais dos agentes de QA e de revisão estão em [`QA-REPORT.md`](./QA-REPORT.md) e [`PONYTAIL-REVIEW.md`](./PONYTAIL-REVIEW.md); os arquivos de skill usados por eles estão em [`skills/`](./skills/).

| Agente | Papel | Skill |
|---|---|---|
| 1 | Arquiteto Serverless (D1, OAuth2, validação) | `skills/serverless-d1-discord/SKILL.md` |
| 2 | Engenheiro de Interface Vanilla | `skills/vanilla-dom-ui/SKILL.md` |
| 3 | **QA / Teste e Validação** | `skills/teste-validacao/SKILL.md` |
| 4 | Revisor Sênior — Ponytail | `skills/ponytail/SKILL.md` (vendorizado, MIT) |

---

## 10. Estrutura

```
P26-2A-63CE-527A-2990-8D25/
├── LICENSE                      MIT
├── README.md                    este arquivo
├── AGENTS.md                    agentes, harness e skills
├── QA-REPORT.md                 relatório do agente de teste e validação
├── PONYTAIL-REVIEW.md           relatório do agente revisor
├── wrangler.jsonc               Pages + binding D1
├── migrations/0001_init.sql     esquema D1
├── functions/                   Cloudflare Pages Functions
│   ├── _middleware.js           headers de segurança
│   ├── _lib/                    auth, http, validação, fuso
│   └── api/                     rotas
├── public/                      HTML5 + CSS3 + JS puro
│   ├── index.html
│   ├── styles.css
│   └── js/                      timer, api, ui, format, app
├── tests/                       node --test + integração HTTP
└── skills/                      skills dos agentes
```

---

## 11. Licença

MIT — veja [`LICENSE`](./LICENSE). Copyright (c) 2026 João Fidalgo Marinho.

O skill em `skills/ponytail/` é de autoria de Dietrich Gebert, também sob MIT — atribuição em `skills/ponytail/NOTICE.md`.

---

**Chave Única: P26-2A-63CE-527A-2990-8D25** · Turma 2A · RA 2026109268 · Licença MIT
