import test from "node:test";
import assert from "node:assert/strict";

import { PomodoroTimer } from "../public/js/timer.js";

function makeTimer(options = {}) {
  let clock = 1_000_000;
  const events = [];
  const timer = new PomodoroTimer({
    now: () => clock,
    onPhaseEnd: (event) => events.push(event),
    ...options,
  });
  return {
    timer,
    events,
    advance(ms) { clock += ms; },
    setClock(value) { clock = value; },
    get clock() { return clock; },
  };
}

test("o tempo restante vem do delta entre endsAt e now (não de contadores)", () => {
  const { timer, advance } = makeTimer();
  timer.start();
  advance(10_000);
  timer.tick();
  assert.equal(timer.snapshot().remainingMs, 25 * 60 * 1000 - 10_000);
});

test("aba em segundo plano: um salto de 30 minutos encerra o ciclo exatamente uma vez", () => {
  const { timer, events, advance } = makeTimer();
  timer.start();
  advance(30 * 60 * 1000);
  timer.tick();
  assert.equal(events.length, 1);
  assert.equal(events[0].phase, "focus");
  assert.equal(timer.snapshot().phase, "short");
  assert.equal(timer.snapshot().remainingMs, 5 * 60 * 1000);
});

test("pausar e continuar preserva o tempo restante", () => {
  const { timer, advance } = makeTimer();
  timer.start();
  advance(60_000);
  timer.pause();
  const paused = timer.snapshot().remainingMs;
  assert.equal(paused, 24 * 60 * 1000);

  advance(120_000);
  timer.tick();
  assert.equal(timer.snapshot().remainingMs, paused);

  timer.start();
  advance(30_000);
  timer.tick();
  assert.equal(timer.snapshot().remainingMs, paused - 30_000);
});

test("pular fase não registra ciclo nem incrementa o contador de foco", () => {
  const { timer, events } = makeTimer();
  timer.start();
  timer.skip();
  assert.equal(events.length, 0);
  assert.equal(timer.snapshot().completedFocus, 0);
  assert.equal(timer.snapshot().phase, "short");
});

test("pausa longa entra após a série configurada de ciclos", () => {
  const { timer, advance } = makeTimer({ config: { focus: 1, short: 1, long: 1, cyclesBeforeLong: 2 } });

  timer.start();
  advance(60_000);
  timer.tick();
  assert.equal(timer.snapshot().phase, "short");
  assert.equal(timer.snapshot().completedFocus, 1);

  timer.start();
  advance(60_000);
  timer.tick();
  assert.equal(timer.snapshot().phase, "focus");

  timer.start();
  advance(60_000);
  timer.tick();
  assert.equal(timer.snapshot().phase, "long");
  assert.equal(timer.snapshot().completedFocus, 2);

  timer.start();
  advance(60_000);
  timer.tick();
  assert.equal(timer.snapshot().phase, "focus");

  timer.start();
  advance(60_000);
  timer.tick();
  assert.equal(timer.snapshot().phase, "short");
  assert.equal(timer.snapshot().completedFocus, 3);
});

test("relógio do sistema voltando no tempo não aumenta o tempo restante", () => {
  const { timer, advance, setClock } = makeTimer();
  timer.start();
  advance(60_000);
  timer.tick();
  const before = timer.snapshot().remainingMs;

  setClock(timer.endsAt - 24 * 60 * 1000 + 3_600_000 * 2);
  timer.tick();
  assert.ok(timer.snapshot().remainingMs <= before);
});

test("snapshot expõe a duração planejada em segundos para o registro", () => {
  const { timer, events, advance } = makeTimer();
  timer.start();
  advance(25 * 60 * 1000);
  timer.tick();
  assert.equal(events[0].plannedSeconds, 1500);
  assert.match(events[0].startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(events[0].endedAt, /^\d{4}-\d{2}-\d{2}T/);
});
