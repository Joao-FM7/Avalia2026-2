import test from "node:test";
import assert from "node:assert/strict";

import { addDaysIso, dayStartSaoPaulo, weekStartSaoPaulo } from "../functions/_lib/stats.js";

test("semana começa na segunda-feira 00:00 de São Paulo (UTC-3)", () => {
  // Sexta 20/11/2026 12:00 UTC
  const weekStart = weekStartSaoPaulo(Date.parse("2026-11-20T12:00:00Z"));
  assert.equal(weekStart, "2026-11-16T03:00:00.000Z");
});

test("domingo à noite ainda pertence à semana anterior", () => {
  // Domingo 15/11/2026 23:30 em São Paulo = 16/11 02:30 UTC
  const weekStart = weekStartSaoPaulo(Date.parse("2026-11-16T02:30:00Z"));
  assert.equal(weekStart, "2026-11-09T03:00:00.000Z");
});

test("segunda-feira de manhã já pertence à nova semana", () => {
  const weekStart = weekStartSaoPaulo(Date.parse("2026-11-16T09:00:00Z"));
  assert.equal(weekStart, "2026-11-16T03:00:00.000Z");
});

test("início do dia respeita o fuso de São Paulo", () => {
  const dayStart = dayStartSaoPaulo(Date.parse("2026-11-20T02:00:00Z"));
  assert.equal(dayStart, "2026-11-19T03:00:00.000Z");
});

test("somar 7 dias fecha a janela semanal", () => {
  const weekStart = weekStartSaoPaulo(Date.parse("2026-11-20T12:00:00Z"));
  assert.equal(addDaysIso(weekStart, 7), "2026-11-23T03:00:00.000Z");
});
