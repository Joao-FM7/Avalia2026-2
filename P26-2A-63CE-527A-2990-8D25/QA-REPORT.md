# QA-REPORT.md — Relatório do Agente 3 (Teste e Validação)

**Projeto #13 — Temporizador Pomodoro com Métricas de Estudo**
Chave Única: `P26-2A-63CE-527A-2990-8D25`

Agente: **QA / Teste e Validação** — subagente isolado do OpenCode, **sem permissão de edição**, seguindo
[`skills/teste-validacao/SKILL.md`](./skills/teste-validacao/SKILL.md).
Ambiente: Windows 10, Node 26, Wrangler 4, D1 local migrado, `wrangler pages dev` em `http://127.0.0.1:8788`.

Este relatório tem duas partes: **(1)** a saída original do agente, sem edição, e **(2)** o que o orquestrador
corrigiu depois e como a validação foi refeita.

---

## Parte 1 — Saída original do agente (antes das correções)

### 1.1 Testes de unidade — `node --test tests/`

```
ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ duration_ms 208.4
```

[PASS] 27/27 testes de unidade — `format` (4), `stats` (5), `timer` (7, incluindo salto de 30 min em segundo plano,
pausa/retomada e relógio do sistema voltando no tempo), `validation` (11: futuro, ciclo curto, menos da metade do
planejado, clamp de duração, token inválido, limite de disciplinas).

### 1.2 Integração — `node tests/api.integration.mjs`

```
24/24 verificações passaram.
```

[PASS] 24/24 — home 200, chave no rodapé, CSP, `nosniff`, `/api/me` sem sessão 401, cookie adulterado 401,
disciplina duplicada 409, ciclo válido 201 com `studiedSeconds = 1500`, mesmo `client_token` → `duplicate: true`,
duração inflada clampada, ciclo de 20 s → 400, `endedAt` no futuro → 400, disciplina de outro usuário → 403,
disciplina arquivada → 403, estatísticas com total e distribuição, histórico, `DELETE` arquivando.

### 1.3 Auditoria do servidor (`functions/`)

[PASS] `user_id` **não** vem do body — identidade só do cookie HMAC. POST com `userId` de outro usuário e
`studiedSeconds: 999999` gravou para o dono do cookie, com `studiedSeconds: 1500`.
[PASS] Nenhum SQL concatenado — todas as queries usam `prepare(...).bind(...)`. `subjectId: "2 OR 1=1"` e
`clientToken: "' OR 1=1 --"` → 400.
[PASS] Checagem de dono em toda referência cruzada (403 quando não é do usuário; disciplina arquivada → 403).
[PASS] Sessão assinada (`payload.HMAC-SHA256`, `exp` conferido, `HttpOnly; SameSite=Lax`, `Secure` em HTTPS);
cookie só com payload → 401.
[PASS] Nenhum segredo versionado; `.dev.vars` no `.gitignore`; `.dev.vars.example` só com placeholders.
[PASS] Falha fechada sem `SESSION_SECRET`.
[PASS] Validação de negócio no servidor: duração derivada dos timestamps, mínimo 60 s, ≥ 50 % do planejado,
máximo 90 min, janela de 12 h, skew de 5 min, `client_token` com regex, payload máximo 4096 B (5 KB → 413),
JSON inválido → 400.

[FAIL] **`GET /api/dev-login?u=<qualquer_id>` emitia sessão assinada para o `user_id` escolhido pelo cliente.**
Evidência: `302` + `Set-Cookie`, e `GET /api/me` com esse cookie devolvia `200`. Guardada por `DEV_LOGIN === "1"`,
mas versionada. Critério 2 / risco direto no critério 5. → **Corrigido: arquivo removido** (ver parte 2).

[FAIL] Sem limite de requisições em `POST /api/subjects` e nas rotas de login. Mitigado pelo teto de 12 disciplinas
ativas. Critério 2 (menor). → **Aceito como risco residual** (ver parte 2, item 3).

### 1.4 Auditoria do frontend (`public/`)

[PASS] Zero frameworks (`react|vue|svelte|angular|jquery|bootstrap|tailwind` não aparecem em `public/` nem nas
dependências; a única devDependency é `wrangler`).
[PASS] Nenhum `<script>` inline, nenhum `style="..."`, nenhum `on*=`.
[PASS] `textContent` / `replaceChildren` para nome de disciplina e histórico; largura de barra via CSSOM.
[PASS] Rodapé com a chave; CSS responsivo e `prefers-reduced-motion`; `aria-live`, skip-link e labels.
[PASS] Nome de disciplina com `<img src=x onerror=alert(1)>` não executa.

[FAIL] Arquivo morto `public/app.js` (scaffold antigo) com `innerHTML`, `discordSession.user_id` no cliente e
`fetch("/api/status")`. Critério 3 e má impressão no critério 2. → **Corrigido: arquivo removido**.

### 1.5 Entrega documental

[PASS] `AGENTS.md` com 4 agentes, harness e links de skills; `skills/` com 4 skills e `NOTICE.md`; `LICENSE` MIT;
`README.md` com a chave; `validar-local.mjs` → **8/9** (só o item 9, deploy online, pendente).

[FAIL] `AGENTS.md` citava `QA-REPORT.md` e `PONYTAIL-REVIEW.md` inexistentes. → **Corrigido: este arquivo e
[`PONYTAIL-REVIEW.md`](./PONYTAIL-REVIEW.md) foram criados.**

[FAIL] Repositório público não verificável — não havia `.git` nem remote. → **Corrigido: fork publicado em
`https://github.com/<usuario>/Avalia2026-2` (ver README).**

### 1.6 Ataques manuais (HTTP, `http://127.0.0.1:8788`)

| # | Ataque | Obtido | Veredito |
|---|---|---|---|
| A1 | `POST /api/sessions` sem cookie | 401 | PASS |
| A2 | cookie com assinatura adulterada | 401 | PASS |
| A3 | cookie só com payload, sem HMAC | 401 | PASS |
| A4 | `subjectId` de outro usuário | 403 `subject_not_owned` | PASS |
| A5 | `plannedSeconds: 0` | 400 | PASS |
| A6 | `plannedSeconds: -100` | 400 | PASS |
| A7 | `studiedSeconds: 999999` + `userId` de outro | 201, `studiedSeconds: 1500` | PASS |
| A8 | `GET /api/stats` sem cookie | 401 | PASS |
| A9 | `GET /api/stats` com cookie adulterado | 401 | PASS |
| A10 | SQLi em `subjectId` / `clientToken` | 400 | PASS |
| A11 | JSON malformado / body de 5 KB | 400 / 413 | PASS |
| A12 | `startedAt == endedAt` / planejado 5401 s | 400 / 400 | PASS |
| A13 | `DELETE /api/subjects/1` sem cookie | 401 | PASS |
| A14 | `POST /api/me` | 405 + `Allow: GET` | PASS |
| A15 | `GET /api/dev-login?u=123…` | 302 + cookie, `/api/me` 200 | **FAIL** → corrigido |
| A16 | `GET /api/nao-existe` | 200 com HTML da home | Observação → corrigido |

### 1.7 Riscos apontados na época

1. Deploy não publicado (critério 1, 25 pts) — `pomodoro-p26-2a.pages.dev` não resolvia.
2. `dev-login.js` = identidade controlada pelo cliente (critério 2).
3. Processo e repositório sem prova (critérios 4 e 5).

---

## Parte 2 — Correções aplicadas e revalidação

| # | Achado | Correção | Arquivo |
|---|---|---|---|
| 1 | Backdoor de identidade (A15) | rota apagada; `DEV_LOGIN` removido do `.dev.vars` | `functions/api/dev-login.js` (removido) |
| 2 | Scaffold morto com `innerHTML` e `userId` no cliente | arquivo apagado | `public/app.js` (removido) |
| 3 | Sem 404 JSON em rota de API inexistente (A16) | catch-all `[[path]].js` devolve `404 { ok: false }` | `functions/api/[[path]].js` |
| 4 | Teto por contagem (40 ciclos/h) permitia inflar horas | teto de **3600 s de estudo na última hora**; reenvio idempotente não cai no 429 | `functions/api/sessions.js` |
| 5 | Sem limite em `POST /api/subjects` | **não aplicado**: o teto de 12 disciplinas ativas já limita o dano; rate limit por IP em Pages Functions exigiria estado extra | — |
| 6 | `AGENTS.md` citava relatórios inexistentes | relatórios criados | `QA-REPORT.md`, `PONYTAIL-REVIEW.md` |
| 7 | Ausência de testes para sessão e HTTP | 15 novos testes (assinatura, exp, cookie malformado, base64 inválido, 413, 400) | `tests/auth.test.mjs`, `tests/http.test.mjs` |

### Revalidação (após as correções)

```
node --test tests/              → 42 testes, 42 pass, 0 fail
node tests/api.integration.mjs  → 26/26 verificações passaram
```

Novas verificações de integração: `nova disciplina após arquivar` (201) e `teto de 1 h de estudo por hora → 429`.

### Navegador (Chrome real, 1905×953 e layout responsivo)

[PASS] Console sem erros após login e após concluir um ciclo real de 1 minuto.
[PASS] Contagem regressiva 25:00 → 24:50 com o anel SVG atualizando; ciclo de 1 min concluído → fase
"Pausa curta", faixa de alerta, histórico com o registro novo e métricas recalculadas.
[PASS] "Iniciar" sem disciplina **não** inicia o ciclo e explica o motivo.
[PASS] Criar disciplina pela interface e arquivar a disciplina selecionada (com confirmação), sumindo da lista.
[PASS] `GET /api/dev-login` e `/app.js` passam a cair no fallback e `/api/*` inexistente devolve JSON 404.

### O que o QA **não** executou

- Fluxo OAuth2 real contra o Discord (exige credenciais de produção).
- Chamadas `429` em massa contra o banco semeado (o teto foi coberto por teste automatizado e por leitura de código).
- Leitor de tela real e teste em 375 px no dispositivo físico.
