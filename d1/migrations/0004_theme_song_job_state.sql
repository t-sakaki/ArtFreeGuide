-- The MiniMax Music 3.0 composition job takes ~1-2 min, which is longer than a
-- single Cloudflare Worker request. Track the job on the row so the client can
-- poll: 'pending' (job submitted, request_id set) -> 'ready' (audio copied into
-- R2, audio_url points at /api/theme-song/audio) -> or 'failed' (error set).
--
-- SQLite ADD COLUMN cannot take a non-constant default (CURRENT_TIMESTAMP), so
-- updated_at defaults to '' and is always written explicitly by the API route.
-- Existing rows predate the job flow and already carry a finished audio_url, so
-- they default to 'ready'.

ALTER TABLE artwork_theme_songs ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE artwork_theme_songs ADD COLUMN request_id TEXT NOT NULL DEFAULT '';
ALTER TABLE artwork_theme_songs ADD COLUMN error TEXT NOT NULL DEFAULT '';
ALTER TABLE artwork_theme_songs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
