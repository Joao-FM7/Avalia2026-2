/**
 * Cálculo de janelas de tempo no fuso de São Paulo (UTC-3, sem horário de verão desde 2019).
 * Puro e testável: recebe o instante atual e devolve ISO-8601 em UTC.
 */

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;

function spParts(nowMs) {
  const sp = new Date(nowMs - SP_OFFSET_MS);
  return {
    year: sp.getUTCFullYear(),
    month: sp.getUTCMonth(),
    day: sp.getUTCDate(),
    weekday: sp.getUTCDay(),
  };
}

/** Segunda-feira 00:00 (horário de São Paulo) da semana corrente, em ISO UTC. */
export function weekStartSaoPaulo(nowMs = Date.now()) {
  const { year, month, day, weekday } = spParts(nowMs);
  const daysSinceMonday = (weekday + 6) % 7;
  const mondayUtcMidnight = Date.UTC(year, month, day - daysSinceMonday);
  return new Date(mondayUtcMidnight + SP_OFFSET_MS).toISOString();
}

/** Meia-noite (horário de São Paulo) do dia corrente, em ISO UTC. */
export function dayStartSaoPaulo(nowMs = Date.now()) {
  const { year, month, day } = spParts(nowMs);
  return new Date(Date.UTC(year, month, day) + SP_OFFSET_MS).toISOString();
}

export function addDaysIso(iso, days) {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}
