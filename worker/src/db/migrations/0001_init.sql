-- Gimme.domains — D1 schema

CREATE TABLE IF NOT EXISTS domains (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status      TEXT NOT NULL DEFAULT 'unknown', -- caught|expiring|safe|unknown
  expiry_date TEXT,
  registrar   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain          TEXT NOT NULL COLLATE NOCASE,
  email           TEXT NOT NULL,
  intervals       TEXT NOT NULL DEFAULT '[30,14,7,1]', -- JSON array
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  UNIQUE(domain, email)
);

CREATE TABLE IF NOT EXISTS caught_domains (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  domain              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  caught_at           TEXT NOT NULL DEFAULT (datetime('now')),
  catch_registrar     TEXT,
  cost_usd            REAL,
  claim_window_closes TEXT,
  rescue_price_usd    REAL NOT NULL DEFAULT 249,
  concierge_price_usd REAL NOT NULL DEFAULT 499,
  status              TEXT NOT NULL DEFAULT 'holding', -- holding|claimed|expired_unclaimed
  outreach_sent       INTEGER NOT NULL DEFAULT 0,
  outreach_email      TEXT
);

CREATE TABLE IF NOT EXISTS claims (
  id                TEXT PRIMARY KEY, -- clm_xxxx
  domain            TEXT NOT NULL,
  email             TEXT NOT NULL,
  registrar_handle  TEXT,
  plan              TEXT NOT NULL DEFAULT 'self', -- self|concierge
  amount_usd        REAL NOT NULL,
  payment_status    TEXT NOT NULL DEFAULT 'pending', -- pending|paid|failed
  payment_intent_id TEXT,
  transfer_status   TEXT NOT NULL DEFAULT 'pending', -- pending|initiated|complete|failed
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_alerts_domain ON alert_subscriptions(domain);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alert_subscriptions(active);
CREATE INDEX IF NOT EXISTS idx_caught_status ON caught_domains(status);
CREATE INDEX IF NOT EXISTS idx_claims_domain ON claims(domain);

-- Prospecting audit log — every domain evaluated, score, and whether we placed a backorder
CREATE TABLE IF NOT EXISTS prospect_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  domain            TEXT NOT NULL COLLATE NOCASE,
  score             INTEGER NOT NULL,
  reason            TEXT,
  backorder_placed  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(domain, created_at)
);
CREATE INDEX IF NOT EXISTS idx_prospect_score ON prospect_log(score);
CREATE INDEX IF NOT EXISTS idx_prospect_domain ON prospect_log(domain);
