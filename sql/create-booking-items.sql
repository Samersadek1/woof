-- Belongings / check-in inventory for boarding stays.
-- Run in Supabase SQL Editor. Also create Storage bucket `booking-item-photos` (public) in Dashboard → Storage.

create extension if not exists "uuid-ossp";

create table if not exists public.booking_items (
  id              uuid primary key default uuid_generate_v4(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  category        text not null check (category in ('personal', 'food')),
  description     text not null,
  quantity        integer not null default 1,
  condition_notes text,
  photo_urls      text[] not null default '{}',
  returned        boolean,
  return_status   text check (return_status in ('returned', 'missing', 'damaged')),
  return_notes    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_booking_items_booking on public.booking_items(booking_id);

alter table public.booking_items enable row level security;

drop policy if exists "staff_access" on public.booking_items;
create policy "staff_access" on public.booking_items
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage: in Supabase Dashboard → Storage, create a public bucket named `booking-item-photos`.
-- Add policies so authenticated staff can upload/read under paths `bookingId/...`.
