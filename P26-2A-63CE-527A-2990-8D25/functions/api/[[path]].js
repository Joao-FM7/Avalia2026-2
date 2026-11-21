/**
 * Fallback de /api/*: rota inexistente responde JSON 404 em vez de cair no index.html.
 * Rotas mais específicas (api/sessions.js, api/auth/*) têm precedência.
 */
import { fail } from "../_lib/http.js";

export function onRequest() {
  return fail(404, "not_found", "Rota de API inexistente.");
}
