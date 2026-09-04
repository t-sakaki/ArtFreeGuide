-- Spotify-style lyric sync: per-line start times (seconds), JSON-encoded,
-- produced by aligning the written lyrics to a Whisper transcription of the
-- finished track. Empty string means "not aligned yet / alignment failed" —
-- the client falls back to a length-based estimate in that case.

ALTER TABLE artwork_theme_songs ADD COLUMN timings TEXT NOT NULL DEFAULT '';
