-- Batch 1: Foundation & Navigation
-- The dueDate column already exists in the tasks table as "dueDate" date.
-- This is a no-op confirmation. If running on a fresh DB that somehow lacks it:

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "dueDate" date DEFAULT current_date;
