-- Same guide cache as supabase/migrations/003_artwork_guides.sql, for when
-- GUIDE_STORE=d1. Apply with: wrangler d1 migrations apply <db> --remote

CREATE TABLE IF NOT EXISTS artwork_guides (
  cache_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS artwork_guides_title_idx ON artwork_guides (title);
