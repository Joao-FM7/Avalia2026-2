import test from "node:test";
import assert from "node:assert/strict";

import { validateCycle, validateSubject, LIMITS } from "../functions/_lib/validate.js";

const NOW = Date.parse("2026-11-20T18:00:00.000Z");

function cycle(overrides = {}) {
  return {
    subjectId: 1,
    plannedSeconds: 1500,
    startedAt: new Date(NOW - 1500 * 1000).toISOString(),
    endedAt: new Date(NOW).toISOString(),
    clientToken: "abc123def456",
    ...overrides,
  };
}

test("aceita um ciclo de foco coerente", () => {
  const result = validateCycle(cycle(), NOW);
  assert.equal(result.ok, true);
  assert.equal(result.value.studiedSeconds, 1500);
  assert.equal(result.value.subjectId, 1);
});

test("rejeita ciclo sem disciplina válida", () => {
  for (const subjectId of [0, -1, "abc", null, 1.5]) {
    const result = validateCycle(cycle({ subjectId }), NOW);
    assert.equal(result.ok, false, `subjectId=${subjectId}`);
    assert.equal(result.status, 400);
  }
});

test("rejeita ciclo que termina no futuro", () => {
  const result = validateCycle(cycle({
    startedAt: new Date(NOW - 1500 * 1000).toISOString(),
    endedAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
  }), NOW);
  assert.equal(result.ok, false);
  assert.match(result.message, /futuro/i);
});

test("rejeita ciclo curto demais para contar como foco", () => {
  const result = validateCycle(cycle({
    startedAt: new Date(NOW - 30 * 1000).toISOString(),
    endedAt: new Date(NOW - 1000).toISOString(),
  }), NOW);
  assert.equal(result.ok, false);
});

test("rejeita ciclo que cumpriu menos da metade do planejado", () => {
  const result = validateCycle(cycle({
    plannedSeconds: 1500,
    startedAt: new Date(NOW - 600 * 1000).toISOString(),
    endedAt: new Date(NOW - 60 * 1000).toISOString(),
  }), NOW);
  assert.equal(result.ok, false);
  assert.match(result.message, /metade/i);
});

test("limita o tempo estudado ao planejado, impedindo inflar horas", () => {
  const result = validateCycle(cycle({
    plannedSeconds: 1500,
    startedAt: new Date(NOW - 3 * 3600 * 1000).toISOString(),
    endedAt: new Date(NOW - 60 * 1000).toISOString(),
  }), NOW);
  assert.equal(result.ok, true);
  assert.equal(result.value.studiedSeconds, 1500);
});

test("rejeita duração planejada fora do limite da rubrica", () => {
  assert.equal(validateCycle(cycle({ plannedSeconds: 30 }), NOW).ok, false);
  assert.equal(validateCycle(cycle({ plannedSeconds: 99 * 60 }), NOW).ok, false);
});

test("rejeita client token inválido", () => {
  for (const clientToken of ["", "abc", "com espaços aqui", "x".repeat(65)]) {
    assert.equal(validateCycle(cycle({ clientToken }), NOW).ok, false, clientToken);
  }
});

test("valida nome de disciplina e aplica cor da paleta", () => {
  const ok = validateSubject({ name: "  Cálculo   I  " }, 0);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, "Cálculo I");
  assert.match(ok.value.color, /^#[0-9a-f]{6}$/);

  assert.equal(validateSubject({ name: "a" }, 0).ok, false);
  assert.equal(validateSubject({ name: "x".repeat(41) }, 0).ok, false);
  assert.equal(validateSubject({ name: 123 }, 0).ok, false);
});

test("a cor vem do servidor e muda conforme a quantidade de disciplinas", () => {
  const primeira = validateSubject({ name: "Física", color: "#FF8800" }, 0);
  const segunda = validateSubject({ name: "Química" }, 1);
  assert.equal(primeira.ok, true);
  assert.notEqual(primeira.value.color, "#FF8800");
  assert.notEqual(primeira.value.color, segunda.value.color);
});

test("bloqueia cadastro acima do limite de disciplinas ativas", () => {
  const result = validateSubject({ name: "Extra" }, LIMITS.activeSubjectsMax);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});
