-- Cloudflare D1 · Projeto #13: Temporizador Pomodoro com Métricas de Estudo
-- Chave: P26-2A-63CE-527A-2990-8D25
-- Todas as datas são ISO-8601 em UTC (YYYY-MM-DDTHH:MM:SS.mmmZ) para ordenação lexicográfica.

CREATE TABLE IF NOT EXISTS users (
  user_id      TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  display_name TEXT,
  avatar       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Nome único por usuário apenas entre disciplinas ativas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_unique_active
  ON subjects(user_id, lower(name)) WHERE archived = 0;

CREATE TABLE IF NOT EXISTS focus_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  subject_id      INTEGER NOT NULL REFERENCES subjects(id),
  planned_seconds INTEGER NOT NULL,
  studied_seconds INTEGER NOT NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT NOT NULL,
  client_token    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- Idempotência: o mesmo ciclo enviado duas vezes não é contado duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token
  ON focus_sessions(user_id, client_token);

CREATE INDEX IF NOT EXISTS idx_sessions_user_start
  ON focus_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_subject
  ON focus_sessions(user_id, subject_id);
