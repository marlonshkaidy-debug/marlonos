-- MarlonOS Transcripts Table
-- Run this in the Supabase SQL Editor to create the transcripts table

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  raw_transcript text not null,
  parsed_output jsonb not null,
  task_ids uuid[] null,
  was_corrected boolean default false,
  correction_notes text null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (open for now — single user app)
alter table transcripts enable row level security;

create policy "Allow all access" on transcripts
  for all
  using (true)
  with check (true);
