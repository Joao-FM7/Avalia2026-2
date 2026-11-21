/**
 * GET  /api/subjects → disciplinas ativas do usuário autenticado
 * POST /api/subjects → cria uma disciplina/projeto
 */
import { fail, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
import { validateSubject } from "../_lib/validate.js";

export async function onRequest(context) {
  const { request, env } = context;
  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "Faça login com o Discord.");

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, color FROM subjects WHERE user_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE",
    ).bind(user.u).all();

    return json({ ok: true, subjects: results || [] });
  }

  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

  const body = await readJson(request);
  if (!body.ok) return fail(body.status, "invalid_body", "Corpo JSON inválido.");

  const countRow = await env.DB
    .prepare("SELECT COUNT(*) AS total FROM subjects WHERE user_id = ? AND archived = 0")
    .bind(user.u)
    .first();
  const checked = validateSubject(body.value, Number(countRow?.total || 0));
  if (!checked.ok) return fail(checked.status, "invalid_subject", checked.message);

  const now = new Date().toISOString();
  try {
    const inserted = await env.DB
      .prepare("INSERT INTO subjects (user_id, name, color, archived, created_at) VALUES (?, ?, ?, 0, ?) RETURNING id, name, color")
      .bind(user.u, checked.value.name, checked.value.color, now)
      .first();
    return json({ ok: true, subject: inserted }, 201);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return fail(409, "duplicate_subject", "Você já tem uma disciplina com esse nome.");
    }
    return fail(500, "insert_failed", "Não foi possível criar a disciplina.");
  }
}
