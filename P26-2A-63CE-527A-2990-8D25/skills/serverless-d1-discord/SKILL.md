---
name: serverless-d1-discord
description: Padrões obrigatórios para Cloudflare Pages Functions, persistência relacional no D1 e autenticação Discord OAuth2 com sessão assinada.
---

# Skill: Arquiteto Serverless (Cloudflare Functions + D1 + Discord OAuth2)

## Princípios inegociáveis

1. **Identidade só vem do servidor.** O `user_id` é lido do cookie de sessão assinado. Nenhuma rota aceita `userId` no body, na query ou em header customizado.
2. **Sessão assinada com HMAC-SHA256** via WebCrypto (`crypto.subtle`), valor `<base64url(payload)>.<base64url(assinatura)>`, cookie `HttpOnly; SameSite=Lax; Secure` em HTTPS, `Max-Age` de 7 dias, `exp` conferido no servidor. Sessão em `btoa(JSON)` **não** é sessão: é convite a fraude.
3. **OAuth2 com `state` anti-CSRF**: `crypto.randomUUID()` gravado em cookie de vida curta (10 min) e comparado no callback antes da troca de token.
4. **Toda query é parametrizada**: `env.DB.prepare(sql).bind(...)`. Concatenação de string em SQL é proibida, sem exceção.
5. **Toda referência cruzada é checada por dono**: antes de gravar um ciclo, confirmar `subject.user_id === session.user_id` e `archived = 0`; responder `403` quando não for do usuário.
6. **Regra de negócio fecha no servidor**: duração é recalculada de `started_at`/`ended_at`, limitada ao tempo planejado, com janela de tolerância e rejeição de futuro. O cliente só fornece intenção, nunca o número final.
7. **Idempotência explícita**: `UNIQUE(user_id, client_token)` + checagem prévia; reenvio devolve `200 { duplicate: true }` em vez de duplicar horas.
8. **Falha segura**: sem `SESSION_SECRET` nenhuma rota autenticada abre — `requireUser` devolve `null` e a resposta é `401`, nunca um modo "sem assinatura". Sem `DISCORD_CLIENT_ID/SECRET`, o login responde `500` explicativo.

## Contratos de resposta

- Sucesso: `{ ok: true, ... }` com `200`/`201`.
- Erro: `{ ok: false, error: "code", message: "texto para o humano" }` com `400`, `401`, `403`, `409`, `429` ou `500`.
- `405` sempre acompanha header `Allow`.
- JSON com `cache-control: no-store`.

## Modelagem D1

- Datas em **ISO-8601 UTC** (`YYYY-MM-DDTHH:MM:SS.mmmZ`) gravadas explicitamente. `CURRENT_TIMESTAMP` produz `YYYY-MM-DD HH:MM:SS`, que quebra comparação lexicográfica com ISO.
- Índices para os acessos reais: `(user_id, started_at DESC)` e `(user_id, subject_id)`.
- Agregados (`SUM`, `GROUP BY`) calculados no SQL, não mantidos em colunas denormalizadas.
- Semana e dia no fuso `America/Sao_Paulo` (UTC-3) calculados em código puro e testado, não com `date('now')` sem offset.

## Anti-padrões que já custaram nota

- `userId` vindo do `localStorage` ou do body.
- Cookie de sessão em Base64 sem assinatura.
- `INSERT` sem `client_token` (duplo POST = horas dobradas).
- `SELECT` de disciplina sem `AND user_id = ?`.
- Rate limit só no cliente.
