-- Pickup / drop-off transport flags for stays (boarding & cattery share `bookings`).
-- pickup_required: staff should collect the pet for check-in (transport to kennel).
-- dropoff_required: staff should return the pet after check-out (transport from kennel).

alter table public.bookings
  add column if not exists pickup_required boolean not null default false,
  add column if not exists dropoff_required boolean not null default false;

comment on column public.bookings.pickup_required is 'Customer needs pickup/transport for check-in (to kennel)';
comment on column public.bookings.dropoff_required is 'Customer needs drop-off/transport after check-out (from kennel)';
