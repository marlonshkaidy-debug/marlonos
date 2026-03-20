-- Batch 3: Lists System
-- Run this in Supabase SQL editor

CREATE TABLE lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'permanent', -- 'permanent' or 'session'
  context text null, -- e.g. "Dallas trip packing list"
  is_archived boolean default false,
  created_at timestamptz default now(),
  archived_at timestamptz null,
  UNIQUE(name)
);

CREATE TABLE list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists(id) on delete cascade not null,
  text text not null,
  is_core boolean default false, -- true = part of the Always core template
  is_checked boolean default false,
  item_order integer default 0,
  created_at timestamptz default now(),
  checked_at timestamptz null
);
