-- Migration: Add medium, dimensions, autoFilled, and updated_by columns to artworks table
ALTER TABLE artworks ADD COLUMN medium TEXT;
ALTER TABLE artworks ADD COLUMN dimensions TEXT;
ALTER TABLE artworks ADD COLUMN autoFilled TEXT;
ALTER TABLE artworks ADD COLUMN updated_by TEXT;
