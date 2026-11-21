/**
 * GET  /api/sessions?limit=20 → histórico recente de ciclos de foco
 * POST /api/sessions           → registra um ciclo de foco concluído
 *
 * O user_id vem SEMPRE da sessão assinada; duração é recalculada no servidor,
 * limitada ao tempo planejado e protegida por client_token idempotente.
 */
import { fail, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
import { clampInt, validateCycle } from "../_lib/validate.js";

/** Teto de estudo acumulado na última hora: impede inflar a métrica que é a nota. */
const MAX_STUDIED_SECONDS_PER_HOUR = 3600;

export async function onRequest(context) {
  const { request, env } = context;
  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "Faça login com o Discord.");

  if (request.method === "GET") {
    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get("limit"), 1, 50, 20);
    const { results } = await env.DB.prepare(
      `SELECT f.id, f.subject_id, s.name AS subject_name, s.color AS subject_color,
              f.planned_seconds, f.studied_seconds, f.started_at, f.ended_at
         FROM focus_sessions f
         JOIN subjects s ON s.id = f.subject_id
        WHERE f.user_id = ?
        ORDER BY f.started_at DESC
        LIMIT ?`,
    ).bind(user.u, limit).all();
    return json({ ok: true, sessions: results || [] });
  }

  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

  const body = await readJson(request);
  if (!body.ok) return fail(body.status, "invalid_body", "Corpo JSON inválido.");

  const checked = validateCycle(body.value, Date.now());
  if (!checked.ok) return fail(checked.status, "invalid_cycle", checked.message);
  const cycle = checked.value;

  const subject = await env.DB
    .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ? AND archived = 0")
    .bind(cycle.subjectId, user.u)
    .first();
  if (!subject) return fail(403, "subject_not_owned", "Disciplina inexistente ou de outro usuário.");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const gate = await env.DB.prepare(
    `SELECT
       (SELECT id FROM focus_sessions WHERE user_id = ? AND client_token = ?) AS duplicate_id,
       (SELECT COALESCE(SUM(studied_seconds), 0) FROM focus_sessions
         WHERE user_id = ? AND started_at >= ?) AS recent_seconds`,
  ).bind(user.u, cycle.clientToken, user.u, hourAgo).first();

  // Reenvio do mesmo ciclo: idempotente, sem passar pelo teto (senão um retry viraria 429).
  if (gate?.duplicate_id) {
    return json({ ok: true, duplicate: true, sessionId: gate.duplicate_id, studiedSeconds: cycle.studiedSeconds });
  }
  if (Number(gate?.recent_seconds || 0) >= MAX_STUDIED_SECONDS_PER_HOUR) {
    return fail(429, "rate_limited", "Limite de 1 hora de estudo registrada na última hora. Tente novamente mais tarde.");
  }

  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO focus_sessions
         (user_id, subject_id, planned_seconds, studied_seconds, started_at, ended_at, client_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    ).bind(
      user.u,
      cycle.subjectId,
      cycle.plannedSeconds,
      cycle.studiedSeconds,
      cycle.startedAt,
      cycle.endedAt,
      cycle.clientToken,
      new Date().toISOString(),
    ).first();

    return json({ ok: true, sessionId: inserted?.id, studiedSeconds: cycle.studiedSeconds }, 201);
  } catch (error) {
    // Índice UNIQUE(user_id, client_token): reenvio devolve o mesmo resultado em vez de duplicar.
    if (String(error).toLowerCase().includes("unique")) {
      return json({ ok: true, duplicate: true, studiedSeconds: cycle.studiedSeconds });
    }
    return fail(500, "insert_failed", "Não foi possível registrar o ciclo.");
  }
}
