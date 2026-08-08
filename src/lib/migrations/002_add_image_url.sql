-- Migration: Add imageUrl column to artworks table
ALTER TABLE artworks ADD COLUMN imageUrl TEXT;
