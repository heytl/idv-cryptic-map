CREATE TABLE IF NOT EXISTS visits (
  event_id TEXT PRIMARY KEY,
  layout_id INTEGER NOT NULL,
  entrance_id TEXT NOT NULL,
  entrance_type TEXT NOT NULL,
  game_map_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  received_at TEXT NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_day ON visits(day);
CREATE INDEX IF NOT EXISTS visits_map_day ON visits(game_map_id,day,mode);
CREATE INDEX IF NOT EXISTS visits_received ON visits(received_at);
CREATE TABLE IF NOT EXISTS stats_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
