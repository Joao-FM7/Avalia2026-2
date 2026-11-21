# Engenharia de Agentes, Harness e Skills

**Projeto #13 — Temporizador Pomodoro com Métricas de Estudo**
Chave Única: `P26-2A-63CE-527A-2990-8D25`

Este documento descreve **como** o projeto foi construído: quais agentes foram usados, em qual harness operaram, o que cada um entregou e quais skills versionadas eles leram. Todos os arquivos citados estão em `skills/`.

---

## 1. Harness

| Item | Valor |
|---|---|
| Harness | **OpenCode** (agente de código com terminal, sistema de arquivos, subagentes e automação de navegador) |
| Modelo base | DeepSeek V4.1 Flash |
| Agentes | **4 agentes**: 1 orquestrador (build), que acumulou os papéis 1 e 2, + 2 especialistas em **sessões de subagente isoladas** (QA e revisor) |
| Sistema operacional | Windows 10, Node.js 26 (Scoop), Git 2.56, Cloudflare Wrangler 4 |
| Ferramentas usadas pelos agentes | leitura/escrita de arquivos, terminal PowerShell, `wrangler`, automação do Chrome (bridge `browse`), `curl`, execução de testes Node |

### Como a coordenação funcionou

1. **Planejamento** no agente de plano: leitura das instruções oficiais, do `iniciar.mjs` e do `validar-local.mjs` para descobrir exatamente o que o avaliador checa.
2. **Agente 1** definiu esquema, contratos e regras de servidor.
3. **Agente 2** construiu a interface consumindo esses contratos.
4. **Agente 3 (QA)** rodou em sessão separada, sem permissão de edição, e reportou com evidência.
5. **Agente 4 (Ponytail)** rodou por último, também sem editar, revisando excesso de código.
6. O orquestrador aplicou as correções apontadas, rodou os testes de novo e publicou.

Cada subagente recebeu: o caminho do projeto, a skill correspondente, o critério da rubrica que precisava atender e a proibição explícita de editar arquivos (para o QA e o revisor).

---

## 2. Agente 1 — Arquiteto Serverless (Cloudflare D1 + Discord OAuth2)

| | |
|---|---|
| **Papel** | Modelagem relacional no D1, fluxo OAuth2 do Discord, sessão assinada e todas as validações de negócio no servidor |
| **Harness** | OpenCode — sessão principal (build) |
| **Skill** | [`skills/serverless-d1-discord/SKILL.md`](./skills/serverless-d1-discord/SKILL.md) |
| **Entregas** | `migrations/0001_init.sql`, `functions/_lib/*`, `functions/api/*`, `wrangler.jsonc` |
| **Critérios da rubrica** | 1 (deploy funcional) e 2 (serverless + D1 + OAuth2 + validação no servidor) |

**Prompt de trabalho (resumo):** “Implemente as Functions de um Pomodoro onde o `user_id` vem exclusivamente de um cookie de sessão HMAC assinado; valide dono da disciplina, duração derivada de timestamps e idempotência por `client_token`; toda query parametrizada; falhe fechado se `SESSION_SECRET` faltar.”

**Decisões que o agente tomou (e por quê):**

- Sessão em `<payload>.<HMAC>` com WebCrypto em vez do `btoa(JSON)` do scaffold — o scaffold original era forjável e derrubaria o critério 2.
- `state` OAuth2 de uso único em cookie de 10 min — sem isso o callback aceita CSRF.
- `studied_seconds` recalculado de `started_at`/`ended_at` e **limitado** ao planejado — o cliente não consegue inflar horas.
- `UNIQUE(user_id, client_token)` — duplo POST (retry de rede) não duplica métricas.
- Datas em ISO-8601 UTC explícitas, porque `CURRENT_TIMESTAMP` do SQLite quebra a comparação lexicográfica usada nos filtros de semana.

**Evidência:** `tests/validation.test.mjs` e `tests/stats.test.mjs` verdes; 26/26 verificações de contrato em `tests/api.integration.mjs`.

---

## 3. Agente 2 — Engenheiro de Interface Vanilla

| | |
|---|---|
| **Papel** | Timer imune a throttling de aba, alertas visuais, dashboard de métricas, acessibilidade e responsividade sem frameworks |
| **Harness** | OpenCode — sessão principal (build) |
| **Skill** | [`skills/vanilla-dom-ui/SKILL.md`](./skills/vanilla-dom-ui/SKILL.md) |
| **Entregas** | `public/index.html`, `public/styles.css`, `public/js/{timer,api,ui,format,app}.js` |
| **Critérios da rubrica** | 3 (HTML5/CSS3/Vanilla JS) e requisito explícito do relógio |

**Prompt de trabalho (resumo):** “Construa a interface em HTML/CSS/JS puro. O relógio deve usar `setInterval` apenas para desenhar e `Date.now()` para calcular o delta; ao voltar de segundo plano precisa mostrar o tempo correto. Emita alerta visual ao fim de cada ciclo. Rodapé com a chave. Sem `text-shadow`, sem framework, sem build.”

**Decisões que o agente tomou:**

- `PomodoroTimer` como classe pura, com `now()` injetável — o relógio virou testável sem navegador.
- Alerta em quatro canais: faixa com `aria-live="assertive"`, título da aba piscando, beep WebAudio e troca de cor/label da fase.
- CSP `script-src 'self'; style-src 'self'` obrigou a eliminar script e style inline; largura das barras é definida por CSSOM (`element.style.width`), não por atributo `style`.
- Nomes de disciplina e histórico entram por `textContent`/`replaceChildren`.

**Evidência:** `tests/timer.test.mjs` (7 testes, incluindo salto de 30 min em background e relógio voltando no tempo), `tests/format.test.mjs`, inspeção no Chrome com console sem erros e ciclo real de 1 minuto concluído de ponta a ponta.

---

## 4. Agente 3 — QA / Teste e Validação (obrigatório)

| | |
|---|---|
| **Papel** | Auditoria independente: testes, ataques manuais, revisão da rubrica |
| **Harness** | OpenCode — **subagente isolado**, sem permissão de edição |
| **Skill** | [`skills/teste-validacao/SKILL.md`](./skills/teste-validacao/SKILL.md) |
| **Entregas** | Relatório `[PASS]/[FAIL]` com evidência + lista de riscos |
| **Critério da rubrica** | 4 (agente dedicado a teste e validação) e conferência dos critérios 1, 2, 3 e 5 |

**Prompt de trabalho (resumo):** “Você é o QA. Não edite nada. Rode `node --test tests/` e `node tests/api.integration.mjs`, audite as Functions procurando `userId` vindo do body, SQL concatenado, falta de checagem de dono e cookie sem assinatura, audite o frontend procurando framework ou `innerHTML` com dado de usuário, e ataque o servidor local via HTTP. Reporte com status e números.”

**Escopo de ataque executado:**

- `POST /api/sessions` sem cookie → esperado 401
- cookie com assinatura adulterada → esperado 401
- `subjectId` de outro usuário → esperado 403
- duração 20 s, duração 5 h e `endedAt` no futuro → 400 / clamp / 400
- mesmo `client_token` duas vezes → 200 idempotente
- disciplina arquivada → 403
- `GET /api/stats` sem sessão → 401

**Resultado:** 42/42 testes de unidade e 26/26 verificações de integração aprovadas; nenhum bypass ficou aberto (o backdoor de `dev-login` que o agente encontrou foi removido). Relatório completo em [`QA-REPORT.md`](./QA-REPORT.md).

---

## 5. Agente 4 — Revisor Sênior (Ponytail)

| | |
|---|---|
| **Papel** | Revisão final de excesso de código, reuso e risco sem teste — o “sênior preguiçoso” |
| **Harness** | OpenCode — **subagente isolado**, sem permissão de edição |
| **Skill** | [`skills/ponytail/SKILL.md`](./skills/ponytail/SKILL.md) — vendorizado de [DietrichGebert/ponytail](https://github.com/dietrichgebert/ponytail) (MIT), atribuição em [`skills/ponytail/NOTICE.md`](./skills/ponytail/NOTICE.md) |
| **Entregas** | Relatório `[CORTAR]/[REUSAR]/[TESTE FALTANDO]/[RISCO]` + veredito |
| **Critério da rubrica** | 4 (mínimo de 3 agentes, com harness e skills documentados) |

**Prompt de trabalho (resumo):** “Leia `skills/ponytail/SKILL.md` e revise o projeto em modo `full`. Aponte abstração desnecessária, duplicação, dependência inútil e lógica sem teste. Nunca sugira cortar validação, segurança, acessibilidade, alerta de fim de ciclo ou idempotência.”

**Resultado:** veredito e mudanças aplicadas em [`PONYTAIL-REVIEW.md`](./PONYTAIL-REVIEW.md).

---

## 6. O que cada skill contém

| Skill | Conteúdo |
|---|---|
| `serverless-d1-discord` | identidade só da sessão, HMAC, `state`, queries parametrizadas, checagem de dono, clamp de duração, idempotência, modelo D1 e datas ISO |
| `vanilla-dom-ui` | proibição de frameworks, relógio por delta, tratamento de `visibilitychange`, canais de alerta, CSP, acessibilidade, regra de tipografia |
| `teste-validacao` | matriz de testes de unidade, matriz de ataques HTTP, checklist de navegador e checklist da rubrica, formato de relatório |
| `ponytail` | skill externo vendorizado, inalterado, com licença e atribuição |

---

## 7. Como reproduzir a validação

```powershell
# na raiz desta pasta
node --test tests/                 # 42 testes de unidade
npx.cmd wrangler d1 migrations apply DB --local
npx.cmd wrangler pages dev         # em outro terminal
node tests/api.integration.mjs     # 26 verificações HTTP

# na raiz do repositório forkado
node validar-local.mjs P26-2A-63CE-527A-2990-8D25
```

---

## 8. Transparência

- O projeto foi desenvolvido por um único aluno, com agentes de IA no harness OpenCode; os relatórios de QA e Ponytail são saídas reais de sessões de subagente, executadas contra o código deste repositório.
- Nenhum número deste documento foi estimado: os totais de testes vêm da saída de `node --test` e de `tests/api.integration.mjs`.
- O que o harness **não** fez: não criou contas, não aceitou termos em nome do aluno e não digitou credenciais. Login no GitHub, Cloudflare e Discord foi feito pelo aluno no navegador.
