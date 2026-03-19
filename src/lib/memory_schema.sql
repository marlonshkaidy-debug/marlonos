-- Memory Spine: entity memory for MarlonOS
-- Tracks people, places, projects, and contexts so the system learns over time

CREATE TABLE memory (
  id uuid primary key default gen_random_uuid(),
  entity_name text not null,
  entity_type text not null,
  default_bucket text not null,
  context text null,
  confidence text not null default 'INFERRED',
  correction_count integer default 0,
  last_referenced timestamptz default now(),
  created_at timestamptz default now(),
  UNIQUE(entity_name)
);

-- Row Level Security (single-user app — open access)
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access on memory" ON memory FOR ALL USING (true) WITH CHECK (true);

-- Subtask support: add parent/child relationship columns to tasks
ALTER TABLE tasks ADD COLUMN parent_task_id uuid references tasks(id) null;
ALTER TABLE tasks ADD COLUMN is_parent boolean default false;
ALTER TABLE tasks ADD COLUMN subtask_order integer default 0;
