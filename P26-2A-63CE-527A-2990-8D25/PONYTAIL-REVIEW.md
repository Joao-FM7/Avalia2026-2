# PONYTAIL-REVIEW.md — Revisão do Agente 4 (Sênior "Ponytail")

**Projeto #13 — Temporizador Pomodoro com Métricas de Estudo**
Chave Única: `P26-2A-63CE-527A-2990-8D25`

Agente: **Revisor Sênior** — subagente isolado, **sem permissão de edição**, executando o skill
[`skills/ponytail/SKILL.md`](./skills/ponytail/SKILL.md) em modo `full`
(vendorizado de [DietrichGebert/ponytail](https://github.com/dietrichgebert/ponytail), MIT — ver `NOTICE.md`).

Escopo revisado: `functions/` (todas as rotas e `_lib/`), `public/js/`, `public/index.html`, `public/styles.css`,
`migrations/0001_init.sql` e `tests/`. Regra imposta ao revisor: **nunca** sugerir cortar validação no servidor,
assinatura de sessão, checagem de dono, acessibilidade, alerta de fim de ciclo ou idempotência.

---

## 1. Achados do revisor

### Cortes

| Arquivo | Achado | Decisão |
|---|---|---|
| `functions/api/dev-login.js` | Backdoor: com `DEV_LOGIN=1`, `?u=<id>` gera sessão válida para qualquer usuário | **APLICADO** — arquivo removido, `DEV_LOGIN` fora do `.dev.vars` |
| `public/app.js` | Scaffold morto: `/api/status` inexistente, `innerHTML`, `userId` no cliente; nenhum HTML o carrega | **APLICADO** — removido |
| `functions/_lib/stats.js` | `formatDuration` no servidor, sem importador, duplicando `public/js/format.js` com saída divergente (`0s` × `0min`) | **APLICADO** — removido |
| `functions/api/subjects.js` | `SUM/COUNT` com `LEFT JOIN focus_sessions` que o cliente não usa | **APLICADO** — `SELECT id, name, color … ORDER BY name` |
| `functions/api/sessions.js` | Pré-checagem de duplicado "redundante" com o índice único | **PARCIAL** — mantida, mas fundida em **uma** query junto com o teto de segundos; sem ela, um reenvio de ciclo já contabilizado cairia em 429 em vez de responder `duplicate: true` |
| `functions/api/subjects/[id].js` | Rota `DELETE` inalcançável (nenhum botão na UI) | **APLICADO** (opção "1 botão") — botão "Arquivar" ao lado do seletor de disciplina |
| `tests/_seed.mjs`, `tests/_seed.sql`, `tests/seed-demo.mjs` | Artefatos de demonstração, fora do runbook, reimplementando o fuso de São Paulo | **APLICADO** — removidos |
| `functions/_lib/auth.js` | `await import("./http.js")` dentro de `readSession`, sem ciclo de importação | **APLICADO** — import estático |
| `functions/_lib/validate.js` | Aceitar `color` do cliente sem uso real | **APLICADO** — cor vem sempre da paleta do servidor |

### Reuso

| Arquivo | Duplicação | Decisão |
|---|---|---|
| `me.js`, `subjects.js`, `subjects/[id].js`, `sessions.js`, `stats.js` | Bloco "ler sessão com `try/catch` → null" repetido 5× | **APLICADO** — `requireUser(request, env)` exportado por `_lib/auth.js` |
| `public/js/ui.js` | Recalculava `share` já devolvido por `/api/stats` | **APLICADO** — usa `subject.share` do servidor |
| `public/js/app.js` | `localStorage.setItem` direto ao lado de `writeJSON` protegido | **APLICADO** — tudo por `readJSON`/`writeJSON` |
| `public/js/api.js` | `fetch` sem `try/catch`: uma queda de rede rejeitava e abortava o boot | **APLICADO** — `{ ok: false, status: 0 }` |

### Testes que faltavam

| Arquivo | Risco | Decisão |
|---|---|---|
| `functions/_lib/auth.js` | Assinatura, `exp` e cookie malformado sem teste em `npm test` — regressão silenciosa = bypass de autenticação | **APLICADO** — `tests/auth.test.mjs` (9 testes, HMAC forjado de forma independente) |
| `functions/_lib/http.js` | `readJson` (413/400) e `getCookie` sem teste, sendo a fronteira de confiança de todo POST | **APLICADO** — `tests/http.test.mjs` (6 testes; revelou que `getCookie` não tolerava espaço antes do `=`, corrigido) |
| `public/js/app.js` | Fila offline sem teste | **PARCIAL** — corrigida e validada no navegador; sem teste automatizado de DOM (exigiria jsdom, ou seja, dependência nova) |
| `functions/api/sessions.js` | O 429 não tinha teste | **APLICADO** — verificação de integração `teto de 1 h de estudo por hora → 429` |

### Riscos

| Arquivo | O que quebrava | Decisão |
|---|---|---|
| `public/js/app.js` (`flushQueue`) | `await` sem `try/catch`: queda de rede no meio do envio descartava os itens **não processados** | **APLICADO** — `try/catch` por item; nada sai da fila sem resposta do servidor |
| `public/js/app.js` | Todo 4xx/429 era descartado em silêncio, e a mensagem "Ciclo enviado" aparecia **antes** da resposta | **APLICADO** — item permanece na fila; a mensagem passa a ser "Registrando…" e o resultado real é exibido depois; além disso, POST é idempotente, então reenviar é grátis |
| `functions/api/sessions.js` | `40 ciclos/hora` × 90 min permitia inflar até 60 h de estudo em 1 h | **APLICADO** — teto de 3600 s de estudo na última hora |
| `public/js/app.js` | "Iniciar" sem disciplina só alertava e **iniciava** o ciclo, que era perdido no fim | **APLICADO** — `return` antes de `timer.toggle()` |
| `functions/api/[[path]].js` (novo) | Rota de API inexistente devolvia HTML 200 (fallback do Pages) | **APLICADO** — catch-all 404 JSON |
| `functions/api/subjects.js` | Sem rate limit de criação | **ACEITO** — teto de 12 disciplinas ativas já limita o dano; contador por IP exigiria estado extra (KV/Durable Object) desproporcional ao projeto |

---

## 2. Veredito do revisor

> **"Merge com ressalvas"**: segurança, validação e idempotência estavam no lugar; o que impedia o merge limpo era a
> perda silenciosa de ciclos em `flushQueue` e o `dev-login.js` versionado.

**As 3 mudanças de maior impacto apontadas:** (1) `try/catch` por item na fila, (2) apagar `dev-login.js`,
(3) trocar a contagem de ciclos por teto de segundos/hora.

**Todas as três foram aplicadas.** Com isso, as ressalvas estão fechadas e o veredito passa a **merge**.

## 3. O que o revisor não verificou

- Não executou `node --test` nem a integração (não havia `node` no PATH da sessão dele): os achados de teste são
  por leitura de código; a execução ficou com o Agente 3.
- Não subiu `wrangler pages dev` nem confirmou se o D1 local aplica a FK de `users`.
- Não abriu navegador: layout, leitor de tela, CSP com `element.style` e comportamento em segundo plano não foram
  avaliados por ele — foram avaliados pelo orquestrador no Chrome.
- Não auditou o portal do Discord nem os valores reais de `.dev.vars`.

## 4. Resultado da revalidação após os cortes

```
node --test tests/              → 42 testes, 42 pass, 0 fail
node tests/api.integration.mjs  → 26/26 verificações passaram
```

Nenhum corte removeu validação, sessão assinada, checagem de dono, acessibilidade, alerta visual ou idempotência.
