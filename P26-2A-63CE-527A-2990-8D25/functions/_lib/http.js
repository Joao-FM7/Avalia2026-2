/** Utilitários HTTP compartilhados pelas Cloudflare Pages Functions. */

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function fail(status, error, message) {
  return json({ ok: false, error, message }, status);
}

export function isSecureRequest(request) {
  return new URL(request.url).protocol === "https:";
}

export function setCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, `Path=${options.path || "/"}`, "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name, secure) {
  return setCookie(name, "", { maxAge: 0, secure });
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const chunk of header.split(";")) {
    const trimmed = chunk.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() === name) return trimmed.slice(eq + 1).trim();
  }
  return "";
}

export function methodNotAllowed(allowed) {
  return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: allowed.join(", ") });
}

/** Lê JSON do corpo com limite de tamanho (evita payloads gigantes). */
export async function readJson(request, maxBytes = 4096) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, status: 413 };
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, status: 413 };
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, status: 400 };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400 };
  }
}
