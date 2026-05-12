-- Dog size captured from Grooming / Daycare / Boarding intake forms (text labels: Small, Medium, Large, Extra Large).

ALTER TABLE public.grooming_appointments ADD COLUMN IF NOT EXISTS dog_size text;
ALTER TABLE public.daycare_sessions ADD COLUMN IF NOT EXISTS dog_size text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dog_size text;
