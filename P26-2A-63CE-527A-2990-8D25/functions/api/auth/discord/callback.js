/**
 * GET /api/auth/discord/callback
 * Valida o state, troca o code por token, importa user_id / username / avatar
 * do Discord e grava a sessão assinada (HMAC) em cookie HttpOnly.
 */
import { clearCookie, getCookie, isSecureRequest, setCookie } from "../../../_lib/http.js";
import { getSessionSecret, signSession, SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE } from "../../../_lib/auth.js";

function redirectTo(request, query, cookie) {
  const headers = { Location: new URL(`/${query}`, request.url).href };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const secure = isSecureRequest(request);
  const stateCookie = getCookie(request, STATE_COOKIE);
  const clearState = clearCookie(STATE_COOKIE, secure);

  if (url.searchParams.get("error")) {
    return redirectTo(request, `?auth_error=${encodeURIComponent(url.searchParams.get("error"))}`, clearState);
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return redirectTo(request, "?auth_error=state", clearState);
  }

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return redirectTo(request, "?auth_error=not_configured", clearState);
  }

  try {
    const redirectUri = new URL("/api/auth/discord/callback", url.origin).href;
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) return redirectTo(request, "?auth_error=token_exchange", clearState);

    const token = await tokenResponse.json();
    const profileResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) return redirectTo(request, "?auth_error=profile", clearState);

    const profile = await profileResponse.json();
    const userId = String(profile.id || "");
    if (!/^\d{5,25}$/.test(userId)) return redirectTo(request, "?auth_error=profile", clearState);

    const user = {
      user_id: userId,
      username: String(profile.username || "aluno").slice(0, 80),
      display_name: String(profile.global_name || profile.username || "Aluno").slice(0, 80),
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${profile.avatar}.png?size=128`
        : "https://cdn.discordapp.com/embed/avatars/0.png",
    };

    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (user_id, username, display_name, avatar, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         avatar = excluded.avatar,
         updated_at = excluded.updated_at`,
    ).bind(user.user_id, user.username, user.display_name, user.avatar, now, now).run();

    const session = await signSession({ user_id: user.user_id, username: user.display_name, avatar: user.avatar }, getSessionSecret(env));
    const sessionSetCookie = setCookie(SESSION_COOKIE, session, { maxAge: SESSION_MAX_AGE, secure });

    return new Response(null, {
      status: 302,
      headers: { Location: new URL("/?login=ok", url.origin).href, "Set-Cookie": sessionSetCookie },
    });
  } catch {
    return redirectTo(request, "?auth_error=unexpected", clearState);
  }
}
