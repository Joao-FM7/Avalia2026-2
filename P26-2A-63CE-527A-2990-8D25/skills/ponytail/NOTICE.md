# Ponytail (vendorizado)

Este diretório contém o skill **Ponytail**, usado pelo Agente 4 como revisor final.

- **Origem:** https://github.com/DietrichGebert/ponytail
- **Arquivo original:** `skills/ponytail/SKILL.md` (branch `main`)
- **Licença:** MIT (Copyright (c) Dietrich Gebert) — texto integral em https://github.com/DietrichGebert/ponytail/blob/main/LICENSE
- **Como foi usado:** lido como `SKILL.md` pelo agente revisor no harness OpenCode, em modo `full`, para revisar o diff final do projeto: cortar excesso, exigir reuso, apontar risco sem teste. O conteúdo do skill **não** foi alterado.
- **O que foi deliberadamente preservado contra o corte:** validação no servidor, assinatura de sessão, checagem de dono, acessibilidade e o alerta visual — o próprio skill lista esses itens como "never cut".
