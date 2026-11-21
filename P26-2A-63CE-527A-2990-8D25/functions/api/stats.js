/**
 * GET /api/stats → total de horas da semana (segunda a domingo, America/Sao_Paulo),
 * distribuição por disciplina e histórico agregado.
 */
import { fail, json, methodNotAllowed } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
import { addDaysIso, dayStartSaoPaulo, weekStartSaoPaulo } from "../_lib/stats.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const user = await requireUser(request, env);
  if (!user) return fail(401, "unauthorized", "Faça login com o Discord.");

  const nowMs = Date.now();
  const weekStart = weekStartSaoPaulo(nowMs);
  const weekEnd = addDaysIso(weekStart, 7);
  const todayStart = dayStartSaoPaulo(nowMs);

  const [weekly, bySubject, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(studied_seconds), 0) AS seconds, COUNT(*) AS cycles
         FROM focus_sessions
        WHERE user_id = ? AND started_at >= ? AND started_at < ?`,
    ).bind(user.u, weekStart, weekEnd).first(),
    env.DB.prepare(
      `SELECT s.id, s.name, s.color,
              SUM(f.studied_seconds) AS seconds,
              COUNT(*) AS cycles
         FROM focus_sessions f
         JOIN subjects s ON s.id = f.subject_id
        WHERE f.user_id = ? AND f.started_at >= ? AND f.started_at < ?
        GROUP BY s.id
        ORDER BY seconds DESC, s.name COLLATE NOCASE`,
    ).bind(user.u, weekStart, weekEnd).all(),
    env.DB.prepare(
      `SELECT
         (SELECT COALESCE(SUM(studied_seconds), 0) FROM focus_sessions
           WHERE user_id = ? AND started_at >= ?) AS today_seconds,
         (SELECT COALESCE(SUM(studied_seconds), 0) FROM focus_sessions
           WHERE user_id = ?) AS all_time_seconds`,
    ).bind(user.u, todayStart, user.u).first(),
  ]);

  const weekSeconds = Number(weekly?.seconds || 0);
  const subjects = (bySubject.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    seconds: Number(row.seconds || 0),
    cycles: Number(row.cycles || 0),
    share: weekSeconds > 0 ? Math.round((Number(row.seconds || 0) / weekSeconds) * 100) : 0,
  }));

  return json({
    ok: true,
    weekStart,
    weekEnd,
    weekSeconds,
    weekCycles: Number(weekly?.cycles || 0),
    todaySeconds: Number(totals?.today_seconds || 0),
    allTimeSeconds: Number(totals?.all_time_seconds || 0),
    subjects,
  });
}
