/**
 * POST /api/auth/logout → encerra a sessão. GET redireciona para a home.
 */
import { clearCookie, isSecureRequest } from "../../_lib/http.js";
import { SESSION_COOKIE } from "../../_lib/auth.js";

export async function onRequest({ request }) {
  const secure = isSecureRequest(request);
  if (request.method === "GET") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/", "Set-Cookie": clearCookie(SESSION_COOKIE, secure) },
    });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookie(SESSION_COOKIE, secure) },
  });
}
