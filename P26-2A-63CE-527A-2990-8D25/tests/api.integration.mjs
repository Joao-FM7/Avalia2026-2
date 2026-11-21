/**
 * Teste de integração das Cloudflare Pages Functions contra o wrangler local.
 * Uso: node tests/api.integration.mjs   (com `wrangler pages dev` rodando na 8788)
 */
import crypto from "node:crypto";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8788";
const SECRET = process.env.SESSION_SECRET || "dev-secret-p26-local-only-0123456789abcdef";

const OWNER = "123456789012345678";
const STRANGER = "987654321098765432";

function sessionCookie(userId, { tamper = false } = {}) {
  const payload = {
    u: userId,
    n: "Estudante Teste",
    a: "https://cdn.discordapp.com/embed/avatars/0.png",
    exp: Date.now() + 3600_000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const value = `${data}.${tamper ? signature.slice(0, -2) + "xx" : signature}`;
  return `pomodoro_session=${value}`;
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data, headers: response.headers };
}

const results = [];
function check(name, condition, extra = "") {
  results.push({ name, ok: Boolean(condition), extra });
  console.log(`${condition ? "✔" : "✖"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  const health = await fetch(BASE);
  const html = await health.text();
  check("home responde 200", health.status === 200);
  check("chave única no rodapé", /P26-2A-63CE-527A-2990-8D25/.test(html));
  check("CSP aplicada", Boolean(health.headers.get("content-security-policy")));
  check("X-Content-Type-Options", health.headers.get("x-content-type-options") === "nosniff");

  const anonymous = await call("/api/me");
  check("GET /api/me sem sessão → 401", anonymous.status === 401, String(anonymous.status));

  const forged = await call("/api/me", { cookie: sessionCookie(OWNER, { tamper: true }) });
  check("cookie adulterado → 401", forged.status === 401, String(forged.status));

  const ownerCookie = sessionCookie(OWNER);
  const me = await call("/api/me", { cookie: ownerCookie });
  check("GET /api/me com sessão → 200", me.status === 200 && me.data?.user?.id === OWNER);

  const created = await call("/api/subjects", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: `Cálculo ${Date.now()}` },
  });
  check("POST /api/subjects cria disciplina", created.status === 201, String(created.status));
  const subjectId = created.data?.subject?.id;
  check("disciplina retorna id", Number.isInteger(subjectId));

  const duplicate = await call("/api/subjects", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: created.data?.subject?.name },
  });
  check("disciplina duplicada → 409", duplicate.status === 409, String(duplicate.status));

  const noSession = await call("/api/sessions", {
    method: "POST",
    body: { subjectId, plannedSeconds: 1500 },
  });
  check("POST /api/sessions sem sessão → 401", noSession.status === 401, String(noSession.status));

  // Ciclos ancorados 2 h atrás: fora da janela de 1 h usada pelo teto de estudo, então o
  // teste pode rodar várias vezes por hora sem esbarrar em 429 de execuções anteriores.
  const now = Date.now();
  const anchor = now - 2 * 3600 * 1000;
  const token = crypto.randomUUID().replace(/-/g, "");
  const cycle = {
    subjectId,
    plannedSeconds: 1500,
    startedAt: new Date(anchor - 1500 * 1000).toISOString(),
    endedAt: new Date(anchor).toISOString(),
    clientToken: token,
  };

  const recorded = await call("/api/sessions", { method: "POST", cookie: ownerCookie, body: cycle });
  check("POST /api/sessions válido → 201", recorded.status === 201, String(recorded.status));
  check("tempo estudado derivado no servidor", recorded.data?.studiedSeconds === 1500, String(recorded.data?.studiedSeconds));

  const repeated = await call("/api/sessions", { method: "POST", cookie: ownerCookie, body: cycle });
  check("mesmo client_token → idempotente", repeated.status === 200 && repeated.data?.duplicate === true);

  const inflated = await call("/api/sessions", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      ...cycle,
      clientToken: crypto.randomUUID().replace(/-/g, ""),
      plannedSeconds: 1500,
      startedAt: new Date(anchor - 5 * 3600 * 1000).toISOString(),
      endedAt: new Date(anchor).toISOString(),
    },
  });
  check("duração inflada é limitada ao planejado", inflated.status === 201 && inflated.data?.studiedSeconds === 1500);

  const shortCycle = await call("/api/sessions", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      ...cycle,
      clientToken: crypto.randomUUID().replace(/-/g, ""),
      startedAt: new Date(anchor - 20 * 1000).toISOString(),
      endedAt: new Date(anchor).toISOString(),
    },
  });
  check("ciclo curto → 400", shortCycle.status === 400, String(shortCycle.status));

  const future = await call("/api/sessions", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      ...cycle,
      clientToken: crypto.randomUUID().replace(/-/g, ""),
      endedAt: new Date(now + 3600_000).toISOString(),
    },
  });
  check("ciclo no futuro → 400", future.status === 400, String(future.status));

  const strangerCookie = sessionCookie(STRANGER);
  const stolen = await call("/api/sessions", {
    method: "POST",
    cookie: strangerCookie,
    body: { ...cycle, clientToken: crypto.randomUUID().replace(/-/g, "") },
  });
  check("disciplina de outro usuário → 403", stolen.status === 403, String(stolen.status));

  const stats = await call("/api/stats", { cookie: ownerCookie });
  check("GET /api/stats → 200", stats.status === 200);
  check("total da semana contabilizado", Number(stats.data?.weekSeconds) >= 3000, String(stats.data?.weekSeconds));
  check("distribuição por disciplina", Array.isArray(stats.data?.subjects) && stats.data.subjects.length >= 1);

  const history = await call("/api/sessions?limit=5", { cookie: ownerCookie });
  check("histórico retorna ciclos", history.status === 200 && history.data?.sessions?.length >= 2);

  const archived = await call(`/api/subjects/${subjectId}`, { method: "DELETE", cookie: ownerCookie });
  check("DELETE disciplina → arquivada", archived.status === 200);

  const afterArchive = await call("/api/sessions", {
    method: "POST",
    cookie: ownerCookie,
    body: { ...cycle, subjectId, clientToken: crypto.randomUUID().replace(/-/g, "") },
  });
  check("disciplina arquivada não aceita novo ciclo", afterArchive.status === 403, String(afterArchive.status));

  // Teto de 1 h de estudo acumulada na última hora: ciclos "infinitos" param de ser aceitos.
  const fresh = await call("/api/subjects", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: `Física ${Date.now()}` },
  });
  const freshSubjectId = fresh.data?.subject?.id;
  check("nova disciplina após arquivar", fresh.status === 201 && Number.isInteger(freshSubjectId), String(fresh.status));

  let sawRateLimit = false;
  for (let attempt = 0; attempt < 6 && !sawRateLimit; attempt += 1) {
    const endedAt = new Date(Date.now() - attempt * 1000).toISOString();
    const startedAt = new Date(Date.parse(endedAt) - 1500 * 1000).toISOString();
    const result = await call("/api/sessions", {
      method: "POST",
      cookie: ownerCookie,
      body: {
        subjectId: freshSubjectId,
        plannedSeconds: 1500,
        startedAt,
        endedAt,
        clientToken: crypto.randomUUID().replace(/-/g, ""),
      },
    });
    if (result.status === 429) sawRateLimit = true;
  }
  check("teto de 1 h de estudo por hora → 429", sawRateLimit);

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
  if (failed.length) {
    console.error("Falhas:", failed.map((item) => item.name).join(" | "));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
