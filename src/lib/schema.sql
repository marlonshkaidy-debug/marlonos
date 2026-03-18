-- MarlonOS Tasks Table
-- Run this in the Supabase SQL Editor to create the tasks table

create type task_priority as enum ('critical', 'high', 'normal', 'low');
create type task_status as enum ('active', 'completed', 'rolled');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  bucket text not null,
  priority task_priority not null default 'normal',
  "mustDoToday" boolean not null default false,
  "scheduledTime" timestamptz,
  "dueDate" date not null default current_date,
  status task_status not null default 'active',
  "completedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "archivedAt" timestamptz
);

-- Enable Row Level Security (open for now — single user app)
alter table tasks enable row level security;

create policy "Allow all access" on tasks
  for all
  using (true)
  with check (true);
