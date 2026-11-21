/** Camada de renderização: só DOM nativo, sem frameworks. */
import { formatClock, formatDuration, formatRelative, formatWeekRange } from "./format.js";

const RING_CIRCUMFERENCE = 2 * Math.PI * 98;

export function createUI(root = document) {
  const byId = (id) => root.getElementById(id);
  const el = {
    loginLink: byId("loginLink"),
    profile: byId("profile"),
    avatar: byId("avatar"),
    username: byId("username"),
    logoutBtn: byId("logoutBtn"),
    phaseBadge: byId("phaseBadge"),
    ringProgress: byId("ringProgress"),
    clock: byId("clock"),
    clockSub: byId("clockSub"),
    alertBanner: byId("alertBanner"),
    cycleDots: byId("cycleDots"),
    startBtn: byId("startBtn"),
    resetBtn: byId("resetBtn"),
    skipBtn: byId("skipBtn"),
    subjectSelect: byId("subjectSelect"),
    archiveBtn: byId("archiveBtn"),
    subjectForm: byId("subjectForm"),
    subjectName: byId("subjectName"),
    focusMin: byId("focusMin"),
    shortMin: byId("shortMin"),
    longMin: byId("longMin"),
    cyclesInput: byId("cyclesInput"),
    autoStart: byId("autoStart"),
    loginHint: byId("loginHint"),
    weekLabel: byId("weekLabel"),
    weekTotal: byId("weekTotal"),
    weekMeta: byId("weekMeta"),
    subjectBars: byId("subjectBars"),
    statsEmpty: byId("statsEmpty"),
    todayTotal: byId("todayTotal"),
    allTimeTotal: byId("allTimeTotal"),
    historyList: byId("historyList"),
    historyEmpty: byId("historyEmpty"),
    historyCount: byId("historyCount"),
  };

  let alertTimer = null;

  function renderAuth(user) {
    const logged = Boolean(user);
    el.loginLink.hidden = logged;
    el.profile.hidden = !logged;
    el.loginHint.hidden = logged;
    if (user) {
      el.username.textContent = user.username || "Aluno";
      el.avatar.src = user.avatar || "";
      el.avatar.alt = `Avatar de ${user.username || "aluno"}`;
    }
  }

  function renderTimer(state) {
    el.clock.textContent = formatClock(state.remainingMs);
    el.clockSub.textContent = state.label;
    el.phaseBadge.textContent = state.label;
    el.phaseBadge.dataset.phase = state.phase;
    el.ringProgress.dataset.phase = state.phase;

    const ratio = state.totalMs > 0
      ? Math.min(1, Math.max(0, state.remainingMs / state.totalMs))
      : 0;
    el.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));

    el.startBtn.textContent = state.running
      ? "Pausar"
      : (state.remainingMs < state.totalMs ? "Continuar" : "Iniciar");
    el.startBtn.setAttribute("aria-pressed", state.running ? "true" : "false");

    renderDots(state);
  }

  function renderDots(state) {
    const total = state.cyclesBeforeLong;
    const remainder = state.completedFocus % total;
    const filled = state.completedFocus > 0 && remainder === 0 ? total : remainder;

    const dots = [];
    for (let index = 0; index < total; index += 1) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.dataset.done = index < filled ? "1" : "0";
      dot.setAttribute("aria-hidden", "true");
      dots.push(dot);
    }
    el.cycleDots.replaceChildren(...dots);
    el.cycleDots.setAttribute(
      "aria-label",
      `Série atual: ${filled} de ${total} ciclos de foco concluídos`,
    );
  }

  function renderSubjects(subjects, wantedId) {
    const previous = String(wantedId ?? "");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = subjects.length
      ? "Selecione para registrar o foco"
      : "Crie sua primeira disciplina";
    el.subjectSelect.replaceChildren(placeholder);

    for (const subject of subjects) {
      const option = document.createElement("option");
      option.value = String(subject.id);
      option.textContent = subject.name;
      el.subjectSelect.append(option);
    }

    const exists = subjects.some((subject) => String(subject.id) === previous);
    el.subjectSelect.value = exists ? previous : "";
    return el.subjectSelect.value;
  }

  function renderStats(stats) {
    const weekSeconds = Number(stats.weekSeconds || 0);
    const subjects = Array.isArray(stats.subjects) ? stats.subjects : [];

    el.weekTotal.textContent = formatDuration(weekSeconds);
    el.weekMeta.textContent = `${Number(stats.weekCycles || 0)} ciclo(s) · hoje ${formatDuration(stats.todaySeconds)}`;
    el.weekLabel.textContent = stats.weekStart ? formatWeekRange(stats.weekStart, stats.weekEnd) : "";
    el.todayTotal.textContent = formatDuration(stats.todaySeconds);
    el.allTimeTotal.textContent = formatDuration(stats.allTimeSeconds);

    const rows = subjects.map((subject) => {
      const seconds = Number(subject.seconds || 0);
      const share = Math.round(Number(subject.share || 0));

      const item = document.createElement("li");
      item.className = "bar-row";

      const top = document.createElement("div");
      top.className = "bar-top";

      const name = document.createElement("span");
      name.className = "bar-name";
      name.textContent = subject.name;

      const value = document.createElement("span");
      value.className = "bar-value";
      value.textContent = `${formatDuration(seconds)} · ${share}%`;

      const track = document.createElement("div");
      track.className = "bar-track";
      track.setAttribute("role", "presentation");

      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(2, share)}%`;
      fill.style.background = subject.color || "var(--accent)";
      track.append(fill);

      top.append(name, value);
      item.append(top, track);
      return item;
    });

    el.subjectBars.replaceChildren(...rows);
    el.statsEmpty.hidden = rows.length > 0;
  }

  function renderHistory(sessions) {
    const items = Array.isArray(sessions) ? sessions : [];
    el.historyCount.textContent = items.length ? `${items.length} registro(s)` : "";

    const rows = items.map((session) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = "history-dot";
      dot.style.background = session.subject_color || "var(--accent)";
      dot.setAttribute("aria-hidden", "true");

      const info = document.createElement("div");
      const subject = document.createElement("div");
      subject.className = "history-subject";
      subject.textContent = session.subject_name || "Disciplina";
      const date = document.createElement("div");
      date.className = "history-date";
      date.textContent = formatRelative(session.ended_at || session.started_at);
      info.append(subject, date);

      const duration = document.createElement("span");
      duration.className = "history-duration";
      duration.textContent = formatDuration(session.studied_seconds);

      li.append(dot, info, duration);
      return li;
    });

    el.historyList.replaceChildren(...rows);
    el.historyEmpty.hidden = rows.length > 0;
  }

  function showAlert(message, kind = "focus", timeoutMs = 12000) {
    el.alertBanner.textContent = message;
    el.alertBanner.dataset.kind = kind;
    el.alertBanner.hidden = false;
    if (alertTimer) clearTimeout(alertTimer);
    if (timeoutMs > 0) {
      alertTimer = setTimeout(() => {
        el.alertBanner.hidden = true;
      }, timeoutMs);
    }
  }

  function clearAlert() {
    if (alertTimer) clearTimeout(alertTimer);
    el.alertBanner.hidden = true;
  }

  return {
    el,
    renderAuth,
    renderTimer,
    renderSubjects,
    renderStats,
    renderHistory,
    showAlert,
    clearAlert,
  };
}
