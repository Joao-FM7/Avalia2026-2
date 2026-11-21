---
name: teste-validacao
description: Protocolo do agente de QA para provar que o servidor não confia no cliente, que as métricas fecham e que a entrega cumpre a rubrica de 100 pontos.
---

# Skill: Agente de Teste e Validação

## Regra de ouro

O agente de QA **não confia no relatório dos outros agentes**. Ele executa, mede e reporta com números. Toda afirmação precisa de saída de comando, status HTTP ou conteúdo de arquivo.

## Bateria obrigatória

### 1. Unidade (`node --test tests/`)

- Relógio: salto de 30 min em background encerra o ciclo **uma vez**.
- Pausa/retomada preserva `remainingMs`.
- Pular fase não registra ciclo.
- Pausa longa entra na série correta.
- Fronteira de semana no fuso de São Paulo (domingo 23:30 ainda é semana anterior).
- Validação: futuro, curto demais, menos da metade do planejado, duração inflada, token inválido.

### 2. Integração (`node tests/api.integration.mjs` com `wrangler pages dev`)

Cookie assinado de teste + dois usuários distintos. A matriz mínima:

| Cenário | Esperado |
|---|---|
| `GET /api/me` sem cookie | 401 |
| Cookie com assinatura adulterada | 401 |
| `POST /api/sessions` sem sessão | 401 |
| `POST /api/subjects` duplicado | 409 |
| `POST /api/sessions` válido | 201, `studiedSeconds` = planejado |
| Mesmo `client_token` | 200, `duplicate: true` |
| Duração inflada (5 h para 25 min) | 201, clamp em 1500 s |
| Ciclo de 20 s | 400 |
| `endedAt` no futuro | 400 |
| Disciplina de outro usuário | 403 |
| Disciplina arquivada | 403 |
| `GET /api/stats` | total e distribuição coerentes |
| Home | 200, chave no `<footer>`, CSP e `nosniff` |

### 3. Navegador

- Console sem erro após login e após concluir ciclo.
- Contagem regressiva anda com a aba visível e ao voltar de segundo plano.
- Fim de ciclo: faixa de alerta, troca de fase e item novo no histórico.
- Layout em 1905 px, 768 px e 375 px sem overflow horizontal.

### 4. Entrega

- `node validar-local.mjs P26-2A-63CE-527A-2990-8D25` com 9/9.
- `LICENSE` MIT, chave no README e no rodapé, `AGENTS.md` ≥ 3 agentes, `skills/**/SKILL.md` presentes.
- Nenhum segredo em arquivo versionado (`git grep -i "client_secret"`).
- Nenhum `react|vue|svelte|angular|jquery` em dependências ou HTML.

## Formato do relatório

```
[PASS] descrição — evidência (status/comando/número)
[FAIL] descrição — evidência — impacto na rubrica — correção sugerida
```

Todo `FAIL` aponta o critério da rubrica afetado e o arquivo a corrigir. QA não implementa: aponta e devolve para o agente responsável.
