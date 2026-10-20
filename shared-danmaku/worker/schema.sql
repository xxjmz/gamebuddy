CREATE TABLE IF NOT EXISTS shared_danmaku (
  id TEXT PRIMARY KEY,
  scene_key TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('combat', 'death')),
  text TEXT NOT NULL,
  character TEXT NOT NULL DEFAULT '',
  game_version TEXT NOT NULL DEFAULT '',
  author_hash TEXT NOT NULL,
  created_day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  served_count INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_shared_danmaku_scene
  ON shared_danmaku(scene_key, phase, status, report_count);

CREATE INDEX IF NOT EXISTS idx_shared_danmaku_author_day
  ON shared_danmaku(author_hash, created_day);

CREATE TABLE IF NOT EXISTS clears (
  run_id TEXT PRIMARY KEY,
  character TEXT NOT NULL,
  ascension INTEGER NOT NULL,
  game_mode TEXT NOT NULL,
  observed_duration_seconds INTEGER NOT NULL,
  combat_save_load INTEGER NOT NULL CHECK (combat_save_load IN (0, 1)),
  final_deck TEXT NOT NULL,
  final_relics TEXT NOT NULL,
  selected_events TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '匿名人士',
  player_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clears_leaderboard
  ON clears(character, ascension, game_mode, observed_duration_seconds, created_at, run_id);
