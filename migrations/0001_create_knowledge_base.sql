-- Migration: Create Knowledge Base Schema for ArtFreeGuide

CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    location TEXT,
    year TEXT,
    guide_short TEXT,
    guide_standard TEXT,
    guide_deep TEXT,
    search_query TEXT,
    recommendations TEXT, -- JSON stringified array of recommended artworks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artworks_title ON artworks(title);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist);

CREATE TABLE IF NOT EXISTS artwork_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artwork_images_artwork_id ON artwork_images(artwork_id, is_valid);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'content_quality', 'image_validity', 'fact_correction'
    score INTEGER,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_artwork_id ON feedback(artwork_id);
