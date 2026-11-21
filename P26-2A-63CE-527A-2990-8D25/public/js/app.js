/**
 * Orquestração do app: timer, sessão Discord, disciplinas, fila offline e métricas.
 * Tudo em Vanilla JS — nenhum framework de UI.
 */
import { PomodoroTimer } from "./timer.js";
import { api } from "./api.js";
import { createUI } from "./ui.js";
import { formatDuration } from "./format.js";

const CONFIG_KEY = "pomodoro.config.v1";
const QUEUE_KEY = "pomodoro.queue.v1";
const SUBJECT_KEY = "pomodoro.subject.v1";

const ui = createUI();
let user = null;
let subjects = [];
let selectedSubjectId = readJSON(SUBJECT_KEY, "");
let flushing = false;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage indisponível (modo privado): segue sem persistir */
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

const storedConfig = readJSON(CONFIG_KEY, {});
const config = {
  focus: clampNumber(storedConfig.focus, 1, 90, 25),
  short: clampNumber(storedConfig.short, 1, 30, 5),
  long: clampNumber(storedConfig.long, 1, 60, 15),
  cyclesBeforeLong: clampNumber(storedConfig.cyclesBeforeLong, 1, 12, 4),
  autoStart: Boolean(storedConfig.autoStart),
};

const timer = new PomodoroTimer({
  config,
  onTick: (state) => ui.renderTimer(state),
  onPhaseEnd: handlePhaseEnd,
});

/* ---------------- Som e alerta visual ---------------- */

let audioContext = null;

function ensureAudio() {
  if (audioContext) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  try {
    audioContext = new AudioCtor();
  } catch {
    audioContext = null;
  }
}

function beep() {
  if (!audioContext) return;
  try {
    if (audioContext.state === "suspended") audioContext.resume();
    const start = audioContext.currentTime;
    [0, 0.3].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 0 ? 880 : 1180;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.26);
    });
  } catch {
    /* áudio opcional: o alerta visual continua */
  }
}

let titleTimer = null;

function flashTitle(message) {
  if (titleTimer) clearInterval(titleTimer);
  const original = document.title;
  let step = 0;
  titleTimer = setInterval(() => {
    document.title = step % 2 === 0 ? `⏰ ${message}` : original;
    step += 1;
    if (step > 16) {
      clearInterval(titleTimer);
      titleTimer = null;
      document.title = original;
    }
  }, 700);
  window.addEventListener("focus", () => {
    if (titleTimer) clearInterval(titleTimer);
    titleTimer = null;
    document.title = original;
  }, { once: true });
}

function notify(title, message) {
  beep();
  flashTitle(title);
  if (document.hidden) document.title = `⏰ ${title}`;
}

/* ---------------- Ciclos e fila ---------------- */

function newClientToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function subjectName(subjectId) {
  return subjects.find((subject) => Number(subject.id) === Number(subjectId))?.name || "disciplina";
}

async function handlePhaseEnd(finished) {
  if (finished.phase === "focus") {
    const subjectId = Number(ui.el.subjectSelect.value) || 0;
    notify("Foco concluído", "Ciclo de foco concluído. Hora da pausa.");

    if (!user) {
      ui.showAlert("Foco concluído! Entre com o Discord para registrar seus ciclos de estudo.", "focus");
      return;
    }
    if (!subjectId) {
      ui.showAlert("Foco concluído! Escolha uma disciplina para que o próximo ciclo seja registrado.", "focus");
      return;
    }

    const queue = readJSON(QUEUE_KEY, []);
    queue.push({
      subjectId,
      plannedSeconds: finished.plannedSeconds,
      startedAt: finished.startedAt,
      endedAt: finished.endedAt,
      clientToken: newClientToken(),
      queuedAt: Date.now(),
    });
    writeJSON(QUEUE_KEY, queue);

    const label = `${formatDuration(finished.plannedSeconds)} em ${subjectName(subjectId)}`;
    ui.showAlert(`Foco concluído: ${label}. Registrando o ciclo…`, "focus");
    const pending = await flushQueue();
    if (pending > 0) {
      ui.showAlert(
        `Foco concluído: ${label}. O servidor não aceitou agora — o ciclo ficou salvo aqui e será reenviado.`,
        "focus",
        15000,
      );
    } else {
      ui.showAlert(`Foco concluído: ${label}. Ciclo registrado.`, "focus");
    }
  } else {
    ui.showAlert("Pausa concluída. Hora de voltar ao foco.", finished.phase);
    notify("Pausa concluída", "Hora de voltar ao foco.");
  }

  refreshData();
}

/** Envia a fila local. Devolve quantos ciclos continuam pendentes (nunca descarta sem resposta do servidor). */
async function flushQueue() {
  if (flushing || !user) return readJSON(QUEUE_KEY, []).length;

  const queue = readJSON(QUEUE_KEY, []);
  if (!queue.length) return 0;

  flushing = true;
  const keep = [];
  try {
    for (const item of queue) {
      let result;
      try {
        result = await api.recordSession({
          subjectId: item.subjectId,
          plannedSeconds: item.plannedSeconds,
          startedAt: item.startedAt,
          endedAt: item.endedAt,
          clientToken: item.clientToken,
        });
      } catch {
        keep.push(item);
        continue;
      }
      // Qualquer resposta não-ok mantém o item: refazer um POST é grátis (idempotente), perder um ciclo não é.
      if (!result.ok) keep.push(item);
    }
  } finally {
    writeJSON(QUEUE_KEY, keep);
    flushing = false;
  }

  if (keep.length < queue.length) await refreshData();
  return keep.length;
}

/* ---------------- Dados do servidor ---------------- */

async function loadSubjects(wantedId) {
  const result = await api.subjects();
  if (!result.ok) {
    if (result.status === 401) setUser(null);
    return;
  }
  subjects = result.data?.subjects || [];
  selectedSubjectId = ui.renderSubjects(subjects, wantedId ?? selectedSubjectId);
  writeJSON(SUBJECT_KEY, selectedSubjectId);
}

async function refreshData() {
  if (!user) return;
  const [stats, history] = await Promise.all([api.stats(), api.sessions(10)]);
  if (stats.ok) ui.renderStats(stats.data);
  if (history.ok) ui.renderHistory(history.data?.sessions || []);
}

function setUser(nextUser) {
  user = nextUser;
  ui.renderAuth(user);
  if (!user) {
    subjects = [];
    ui.renderSubjects([], "");
    ui.renderStats({ weekSeconds: 0, weekCycles: 0, todaySeconds: 0, allTimeSeconds: 0, subjects: [] });
    ui.renderHistory([]);
  }
}

/* ---------------- Formulário e configurações ---------------- */

function applyConfigToForm() {
  ui.el.focusMin.value = String(config.focus);
  ui.el.shortMin.value = String(config.short);
  ui.el.longMin.value = String(config.long);
  ui.el.cyclesInput.value = String(config.cyclesBeforeLong);
  ui.el.autoStart.checked = Boolean(config.autoStart);
}

function saveConfigFromForm() {
  config.focus = clampNumber(ui.el.focusMin.value, 1, 90, config.focus);
  config.short = clampNumber(ui.el.shortMin.value, 1, 30, config.short);
  config.long = clampNumber(ui.el.longMin.value, 1, 60, config.long);
  config.cyclesBeforeLong = clampNumber(ui.el.cyclesInput.value, 1, 12, config.cyclesBeforeLong);
  config.autoStart = Boolean(ui.el.autoStart.checked);

  writeJSON(CONFIG_KEY, config);
  applyConfigToForm();
  timer.useConfig(config);
}

ui.el.subjectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = ui.el.subjectName.value.trim();

  if (!user) {
    ui.showAlert("Entre com o Discord para criar disciplinas.", "focus", 6000);
    return;
  }
  if (name.length < 2) {
    ui.showAlert("Informe um nome com pelo menos 2 caracteres.", "focus", 5000);
    return;
  }

  const result = await api.createSubject(name);
  if (result.ok) {
    ui.el.subjectName.value = "";
    ui.clearAlert();
    await loadSubjects(result.data?.subject?.id);
    await refreshData();
  } else if (result.status === 401) {
    setUser(null);
    ui.showAlert("Sua sessão expirou. Entre novamente com o Discord.", "focus", 8000);
  } else {
    ui.showAlert(result.data?.message || "Não foi possível criar a disciplina.", "focus", 7000);
  }
});

ui.el.subjectSelect.addEventListener("change", () => {
  selectedSubjectId = ui.el.subjectSelect.value;
  writeJSON(SUBJECT_KEY, selectedSubjectId);
  if (selectedSubjectId) ui.clearAlert();
});

ui.el.archiveBtn.addEventListener("click", async () => {
  const subjectId = Number(ui.el.subjectSelect.value) || 0;
  if (!subjectId) {
    ui.showAlert("Selecione a disciplina que deseja arquivar.", "focus", 5000);
    return;
  }
  if (!window.confirm(`Arquivar "${subjectName(subjectId)}"? O histórico dela continua nas suas métricas.`)) return;

  const result = await api.archiveSubject(subjectId);
  if (result.ok) {
    ui.clearAlert();
    selectedSubjectId = "";
    await loadSubjects("");
    await refreshData();
  } else if (result.status === 401) {
    setUser(null);
    ui.showAlert("Sua sessão expirou. Entre novamente com o Discord.", "focus", 8000);
  } else {
    ui.showAlert(result.data?.message || "Não foi possível arquivar a disciplina.", "focus", 7000);
  }
});

ui.el.startBtn.addEventListener("click", () => {
  ensureAudio();
  if (!timer.running && timer.phase === "focus" && user && !Number(ui.el.subjectSelect.value)) {
    ui.showAlert("Escolha uma disciplina para que este ciclo seja registrado.", "focus", 6000);
    ui.el.subjectSelect.focus();
    return;
  }
  timer.toggle();
});

ui.el.resetBtn.addEventListener("click", () => timer.reset());
ui.el.skipBtn.addEventListener("click", () => timer.skip());
ui.el.logoutBtn.addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/";
});

for (const input of [ui.el.focusMin, ui.el.shortMin, ui.el.longMin, ui.el.cyclesInput]) {
  input.addEventListener("change", saveConfigFromForm);
}
ui.el.autoStart.addEventListener("change", saveConfigFromForm);

/* ---------------- Loop do relógio ---------------- */

setInterval(() => timer.tick(), 250);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) timer.tick();
});
window.addEventListener("focus", () => timer.tick());
window.addEventListener("pageshow", () => timer.tick());
window.addEventListener("online", () => flushQueue());

/* ---------------- Boot ---------------- */

const AUTH_ERRORS = {
  state: "A sessão de login expirou. Tente entrar novamente.",
  token_exchange: "O Discord recusou a troca de token. Confira Client ID/Secret e a URL de redirecionamento.",
  profile: "Não foi possível ler seu perfil do Discord.",
  not_configured: "O login do Discord ainda não foi configurado no servidor.",
  access_denied: "Você cancelou o login do Discord.",
};

async function boot() {
  applyConfigToForm();
  ui.renderTimer(timer.snapshot());

  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth_error");
  if (authError) {
    ui.showAlert(AUTH_ERRORS[authError] || "Não foi possível concluir o login.", "focus", 15000);
    window.history.replaceState(null, "", "/");
  }

  const me = await api.me();
  if (me.ok) {
    setUser(me.data.user);
    await loadSubjects();
    await refreshData();
    await flushQueue();
  } else {
    setUser(null);
  }
}

boot();
