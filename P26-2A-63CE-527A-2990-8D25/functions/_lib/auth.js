/**
 * Sessão assinada (HMAC-SHA256) em cookie HttpOnly.
 * O cliente nunca informa user_id: a identidade vem exclusivamente daqui.
 */
import { getCookie } from "./http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const SESSION_COOKIE = "pomodoro_session";
export const STATE_COOKIE = "pomodoro_oauth_state";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

export function getSessionSecret(env) {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET ausente ou com menos de 16 caracteres");
  }
  return secret;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(user, secret) {
  const payload = {
    u: user.user_id,
    n: user.username,
    a: user.avatar || "",
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${toBase64Url(signature)}`;
}

/** Retorna { u, n, a, exp } ou null se ausente, adulterado ou expirado. */
export async function readSession(request, secret) {
  const raw = getCookie(request, SESSION_COOKIE);
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const data = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!data || !signature) return null;

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(data),
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(data)));
    if (!payload || typeof payload.u !== "string" || !payload.u) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Sessão atual ou null. Falha fechada: sem SESSION_SECRET, ninguém está autenticado. */
export async function requireUser(request, env) {
  try {
    return await readSession(request, getSessionSecret(env));
  } catch {
    return null;
  }
}
