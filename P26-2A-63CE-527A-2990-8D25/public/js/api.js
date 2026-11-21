/** Cliente HTTP fino sobre fetch — sem dependências. */

async function request(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { ok: response.ok, status: response.status, data };
  } catch {
    // Rede indisponível: status 0 sinaliza "tentar de novo", não "dado inválido".
    return { ok: false, status: 0, data: null };
  }
}

export const api = {
  me: () => request("/api/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  subjects: () => request("/api/subjects"),
  createSubject: (name) => request("/api/subjects", { method: "POST", body: { name } }),
  archiveSubject: (id) => request(`/api/subjects/${id}`, { method: "DELETE" }),
  stats: () => request("/api/stats"),
  sessions: (limit = 10) => request(`/api/sessions?limit=${limit}`),
  recordSession: (payload) => request("/api/sessions", { method: "POST", body: payload }),
};
