/**
 * DELETE /api/subjects/:id → arquiva uma disciplina (soft delete, preserva o histórico).
 */
import { fail, json, methodNotAllowed } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";

export async function onRequestDelete({ request, env, params }) {
  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "Faça login com o Discord.");

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, "invalid_id", "Disciplina inválida.");

  const subject = await env.DB
    .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ? AND archived = 0")
    .bind(id, user.u)
    .first();
  if (!subject) return fail(404, "not_found", "Disciplina não encontrada para este usuário.");

  await env.DB.prepare("UPDATE subjects SET archived = 1 WHERE id = ? AND user_id = ?")
    .bind(id, user.u)
    .run();

  return json({ ok: true, archived: id });
}

export async function onRequest(context) {
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return methodNotAllowed(["DELETE"]);
}
