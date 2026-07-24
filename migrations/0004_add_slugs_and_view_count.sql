ALTER TABLE artworks ADD COLUMN artist_slug TEXT;
ALTER TABLE artworks ADD COLUMN artwork_slug TEXT;
ALTER TABLE artworks ADD COLUMN view_count INTEGER DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_slugs ON artworks (artist_slug, artwork_slug);
