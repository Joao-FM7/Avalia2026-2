/**
 * Validações de negócio puras (testáveis com node --test).
 * O servidor nunca confia no que o cliente envia: campos derivados são recalculados.
 */

export const LIMITS = {
  subjectNameMin: 2,
  subjectNameMax: 40,
  activeSubjectsMax: 12,
  plannedSecondsMin: 60,
  plannedSecondsMax: 5400,
  clockSkewMs: 5 * 60 * 1000,
  maxSessionAgeMs: 12 * 60 * 60 * 1000,
  clientToken: /^[A-Za-z0-9_-]{8,64}$/,
};

const DEFAULT_COLORS = ["#2563eb", "#0d9488", "#c2410c", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];

export function pickColor(index) {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

function text(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

export function validateSubject(body, activeCount) {
  const name = text(body.name, LIMITS.subjectNameMax);
  if (!name || name.length < LIMITS.subjectNameMin) {
    return { ok: false, status: 400, message: "Informe um nome de disciplina entre 2 e 40 caracteres." };
  }
  if (activeCount >= LIMITS.activeSubjectsMax) {
    return { ok: false, status: 409, message: `Limite de ${LIMITS.activeSubjectsMax} disciplinas ativas atingido.` };
  }
  return { ok: true, value: { name, color: pickColor(activeCount) } };
}

/**
 * Valida um ciclo de foco concluído.
 * studiedSeconds é SEMPRE derivado do intervalo real e limitado ao planejado,
 * para que o cliente não consiga inflar horas de estudo.
 */
export function validateCycle(body, nowMs = Date.now()) {
  const subjectId = Number(body.subjectId);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    return { ok: false, status: 400, message: "Disciplina inválida." };
  }

  const plannedSeconds = Number(body.plannedSeconds);
  if (!Number.isInteger(plannedSeconds)
    || plannedSeconds < LIMITS.plannedSecondsMin
    || plannedSeconds > LIMITS.plannedSecondsMax) {
    return { ok: false, status: 400, message: "Duração planejada fora do intervalo permitido (1 a 90 minutos)." };
  }

  const startedMs = Date.parse(body.startedAt);
  const endedMs = Date.parse(body.endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return { ok: false, status: 400, message: "Datas do ciclo inválidas." };
  }
  if (endedMs <= startedMs) {
    return { ok: false, status: 400, message: "O fim do ciclo deve ser posterior ao início." };
  }
  if (endedMs > nowMs + LIMITS.clockSkewMs) {
    return { ok: false, status: 400, message: "O ciclo termina no futuro." };
  }
  if (startedMs < nowMs - LIMITS.maxSessionAgeMs) {
    return { ok: false, status: 400, message: "Ciclo antigo demais para ser registrado." };
  }

  const elapsedSeconds = Math.round((endedMs - startedMs) / 1000);
  if (elapsedSeconds < LIMITS.plannedSecondsMin) {
    return { ok: false, status: 400, message: "Ciclo curto demais para contar como sessão de foco." };
  }
  if (elapsedSeconds < Math.floor(plannedSeconds * 0.5)) {
    return { ok: false, status: 400, message: "O ciclo não cumpriu ao menos metade do tempo planejado." };
  }

  const clientToken = typeof body.clientToken === "string" ? body.clientToken.trim() : "";
  if (!LIMITS.clientToken.test(clientToken)) {
    return { ok: false, status: 400, message: "Identificador do ciclo inválido." };
  }

  return {
    ok: true,
    value: {
      subjectId,
      plannedSeconds,
      studiedSeconds: Math.min(elapsedSeconds, plannedSeconds),
      startedAt: new Date(startedMs).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      clientToken,
    },
  };
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
