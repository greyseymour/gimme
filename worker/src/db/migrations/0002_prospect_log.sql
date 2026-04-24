-- Prospecting audit log — every domain evaluated, score, and whether we placed a backorder
CREATE TABLE IF NOT EXISTS prospect_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  domain            TEXT NOT NULL COLLATE NOCASE,
  score             INTEGER NOT NULL,
  reason            TEXT,
  backorder_placed  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prospect_score ON prospect_log(score);
CREATE INDEX IF NOT EXISTS idx_prospect_domain ON prospect_log(domain);
