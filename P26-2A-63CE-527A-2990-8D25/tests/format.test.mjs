import test from "node:test";
import assert from "node:assert/strict";

import { formatClock, formatDuration, formatWeekRange, formatRelative } from "../public/js/format.js";

test("formatClock mostra mm:ss e vira h:mm:ss acima de uma hora", () => {
  assert.equal(formatClock(25 * 60 * 1000), "25:00");
  assert.equal(formatClock(5_000), "00:05");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(61 * 60 * 1000), "1:01:00");
  assert.equal(formatClock(-10), "00:00");
});

test("formatDuration resume horas e minutos", () => {
  assert.equal(formatDuration(0), "0min");
  assert.equal(formatDuration(90), "1min");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(5400), "1h 30min");
  assert.equal(formatDuration(45), "45s");
});

test("formatRelative descreve intervalos recentes", () => {
  const now = Date.parse("2026-11-20T18:00:00Z");
  assert.equal(formatRelative("2026-11-20T17:59:50Z", now), "agora");
  assert.equal(formatRelative("2026-11-20T17:30:00Z", now), "há 30min");
  assert.equal(formatRelative("2026-11-20T15:00:00Z", now), "há 3h");
  assert.equal(formatRelative("2026-11-19T18:00:00Z", now), "ontem");
  assert.equal(formatRelative("inválido", now), "—");
});

test("formatWeekRange mostra a janela segunda–domingo", () => {
  const label = formatWeekRange("2026-11-16T03:00:00.000Z", "2026-11-23T03:00:00.000Z");
  assert.equal(label, "16/11 – 22/11");
});
