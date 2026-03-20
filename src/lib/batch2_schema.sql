-- Batch 2: Voice Intelligence Layer
-- Adds confidence column to tasks table for ambiguity indicator

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'high';
