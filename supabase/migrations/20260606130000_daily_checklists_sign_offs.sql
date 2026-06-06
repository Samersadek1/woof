-- Per-shift staff sign-offs on daily checklists (Lourdes, Flo, Jem, Jess).
alter table public.daily_checklists
  add column if not exists sign_offs jsonb not null default '{}'::jsonb;

-- Verification:
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'daily_checklists' and column_name = 'sign_offs';
