-- Visitor feedback on generated guides: the raw material for prompt fixes and
-- for regenerating guides that were reported as wrong.

CREATE TABLE IF NOT EXISTS guide_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('good', 'bad', 'bug')),
  comment TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS guide_feedback_title_idx ON guide_feedback (title);
CREATE INDEX IF NOT EXISTS guide_feedback_kind_idx ON guide_feedback (kind, created_at);
