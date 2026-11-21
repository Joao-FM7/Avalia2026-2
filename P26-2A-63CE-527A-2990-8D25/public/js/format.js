/** Formatação de tempo — pura e testável. */

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}min`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}min`;
  if (seconds === 0) return "0min";
  return `${seconds}s`;
}

export function formatRelative(iso, nowMs = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const diff = Math.max(0, nowMs - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(then).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatWeekRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(Date.parse(endIso) - 24 * 60 * 60 * 1000);
  const fmt = (date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
  return `${fmt(start)} – ${fmt(end)}`;
}
