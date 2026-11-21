/**
 * Máquina de estados do Pomodoro — pura, sem DOM, testável com node --test.
 *
 * O tempo restante é SEMPRE recalculado a partir de `endsAt - now()`.
 * Nada de decrementar contador a cada tick: é isso que evita atraso quando
 * a aba fica em segundo plano e o navegador estrangula o setInterval.
 */

export const PHASE_LABELS = {
  focus: "Foco",
  short: "Pausa curta",
  long: "Pausa longa",
};

export const DEFAULT_CONFIG = {
  focus: 25,
  short: 5,
  long: 15,
  cyclesBeforeLong: 4,
  autoStart: false,
};

export class PomodoroTimer {
  constructor({ config = {}, now = () => Date.now(), onTick = () => {}, onPhaseEnd = () => {} } = {}) {
    this.now = now;
    this.onTick = onTick;
    this.onPhaseEnd = onPhaseEnd;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.phase = "focus";
    this.running = false;
    this.startedAtMs = null;
    this.completedFocus = 0;
    this.remainingMs = this.phaseDurationMs("focus");
    this.endsAt = 0;
  }

  phaseDurationMs(phase = this.phase) {
    const minutes = Number(this.config[phase]);
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CONFIG[phase];
    return Math.round(safe * 60 * 1000);
  }

  useConfig(patch) {
    const idle = !this.running && this.remainingMs === this.phaseDurationMs();
    this.config = { ...this.config, ...patch };
    if (idle) this.remainingMs = this.phaseDurationMs();
    this.emit();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.endsAt = this.now() + this.remainingMs;
    if (this.startedAtMs === null) this.startedAtMs = this.now();
    this.emit();
  }

  pause() {
    if (!this.running) return;
    this.remainingMs = Math.max(0, this.endsAt - this.now());
    this.running = false;
    this.emit();
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  reset() {
    this.running = false;
    this.startedAtMs = null;
    this.remainingMs = this.phaseDurationMs();
    this.emit();
  }

  /** Avança de fase sem registrar ciclo (botão "Pular"). */
  skip() {
    this.running = false;
    this.startedAtMs = null;
    this.advance(false);
    this.emit();
  }

  tick() {
    if (!this.running) return this.snapshot();

    const now = this.now();
    let remaining = this.endsAt - now;

    // Relógio do sistema voltou no tempo: reancora em vez de "ganhar" tempo.
    if (remaining > this.remainingMs + 1000) {
      this.endsAt = now + this.remainingMs;
      remaining = this.remainingMs;
    }

    this.remainingMs = Math.max(0, remaining);
    if (this.remainingMs === 0) {
      this.finish();
      return this.snapshot();
    }

    this.emit();
    return this.snapshot();
  }

  finish() {
    const phase = this.phase;
    const plannedSeconds = Math.round(this.phaseDurationMs(phase) / 1000);
    const endedAtMs = this.now();
    const startedAtMs = this.startedAtMs ?? endedAtMs - plannedSeconds * 1000;

    this.running = false;
    this.startedAtMs = null;
    if (phase === "focus") this.completedFocus += 1;
    this.advance(true);

    this.onPhaseEnd({
      phase,
      plannedSeconds,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    });
    this.emit();
  }

  advance(completed) {
    const series = Math.max(1, Number(this.config.cyclesBeforeLong) || 1);
    const next = this.phase === "focus"
      ? (completed && this.completedFocus % series === 0 ? "long" : "short")
      : "focus";

    this.phase = next;
    this.remainingMs = this.phaseDurationMs(next);

    if (completed && this.config.autoStart) this.start();
  }

  snapshot() {
    return {
      phase: this.phase,
      label: PHASE_LABELS[this.phase],
      remainingMs: this.remainingMs,
      totalMs: this.phaseDurationMs(),
      running: this.running,
      completedFocus: this.completedFocus,
      cyclesBeforeLong: Math.max(1, Number(this.config.cyclesBeforeLong) || 1),
      config: { ...this.config },
    };
  }

  emit() {
    this.onTick(this.snapshot());
  }
}
