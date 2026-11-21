/**
 * GET /api/auth/discord → inicia o fluxo OAuth2 do Discord (scope: identify).
 * Um `state` aleatório é guardado em cookie HttpOnly para impedir CSRF no callback.
 */
import { fail, isSecureRequest, setCookie } from "../../_lib/http.js";
import { STATE_COOKIE } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return fail(500, "discord_not_configured", "Configure DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET no Cloudflare Pages.");
  }

  const url = new URL(request.url);
  const state = crypto.randomUUID().replace(/-/g, "");
  const redirectUri = new URL("/api/auth/discord/callback", url.origin).href;

  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.href,
      "Set-Cookie": setCookie(STATE_COOKIE, state, { maxAge: 600, secure: isSecureRequest(request) }),
    },
  });
}
