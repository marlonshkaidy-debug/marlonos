-- Build 4: Rolling task tracking
-- Tracks how many times a task has been rolled over to the next day.
-- Incremented in taskService.rolloverTasks() every time a task is pushed forward.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS roll_count integer DEFAULT 0;
