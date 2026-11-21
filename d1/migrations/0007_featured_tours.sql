-- Dynamic featured tours managed without a redeploy (Phase 3 of #163).
-- Lifecycle: 'draft' -> 'published' -> 'archived'.
-- `payload` stores JSON for { items, i18n } matching src/lib/playlists.ts.

CREATE TABLE IF NOT EXISTS featured_tours (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  payload TEXT NOT NULL,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_featured_tours_status_order
  ON featured_tours(status, sort_order ASC, updated_at DESC);
