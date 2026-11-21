---
name: vanilla-dom-ui
description: Como construir a interface do Pomodoro em HTML5, CSS3 e JavaScript puro, com relógio imune a throttling de aba e sem frameworks de UI.
---

# Skill: Interface Web em HTML5, CSS3 e Vanilla JS

## Regras de stack

1. **Zero frameworks de UI.** Nada de React, Vue, Svelte, Angular, jQuery, Alpine, Tailwind CDN ou similares. Módulos ES nativos (`<script type="module">`) e API do DOM bastam.
2. **Nada de build step.** O que está em `public/` é exatamente o que é servido.
3. **Sem `innerHTML` com dado de usuário.** Nome de disciplina e histórico entram por `textContent` / `replaceChildren`.
4. **CSP compatível**: sem `<script>` inline, sem `style="..."` no HTML, sem `<style>` inline. Largura de barra via `elemento.style.width` (CSSOM é permitido), nunca via `setAttribute("style")`.

## O relógio (requisito explícito da disciplina)

- Estado guarda `endsAt`, não um contador que diminui.
- `start()` faz `endsAt = Date.now() + remainingMs`; `tick()` calcula `remaining = max(0, endsAt - Date.now())`.
- `setInterval(tick, 250)` só desenha; quem manda no tempo é o delta.
- `visibilitychange`, `focus` e `pageshow` disparam `tick()` imediato ao voltar para a aba.
- Se o relógio do sistema voltar no tempo, reancorar `endsAt` em vez de "ganhar" tempo.
- Pausa guarda `remainingMs` e zera `endsAt`.
- Fim de ciclo: um único disparo (`finish()`), nunca dois por causa de ticks atrasados.

## Alerta visual no fim do ciclo

1. Faixa com `role="status"` e `aria-live="assertive"`.
2. Título da aba piscando por alguns segundos.
3. Beep curto via WebAudio (sem arquivo externo), criado a partir de um gesto do usuário.
4. Indicador de fase muda de cor/label (`Foco`, `Pausa curta`, `Pausa longa`).

## Acessibilidade e tipografia

- Contraste alto, foco visível (`:focus-visible`), `prefers-reduced-motion` respeitado.
- Texto do relógio em `role="timer"` com `aria-live="off"` (anúncio a cada segundo é ruído); anúncios vão para a região viva.
- **Nunca** `text-shadow`/`filter: drop-shadow` em texto. Hierarquia por peso, cor e pílulas de fundo.
- Rodapé com a Chave Única, turma, RA e licença MIT.

## Dados

- `fetch` com `credentials: "same-origin"`, tratamento explícito de `401` (volta ao login) e `4xx` (mensagem do servidor).
- Fila de reenvio em `localStorage` quando o POST falha. O item **só** sai da fila depois de uma resposta `ok` do servidor: reenviar é idempotente (`client_token`), perder um ciclo não é. Falha de rede é `status: 0` e mantém o item.
