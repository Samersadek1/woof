-- =============================================================================
-- woof Pricing Seed (adapted to current system schema)
-- Effective 2026-04-01
--
-- Current DB schema for pricing:
--   pricing(key PRIMARY KEY, amount_aed, label, category, updated_at)
--
-- Design notes for this repo:
-- - Seed base prices only (no member-tier prices stored in pricing rows).
-- - Discount is applied at invoice time via apply_member_discount().
-- - VAT handling is an app/RPC concern and should not duplicate rows here.
-- - For boarding seasonality, keep both peak + off-peak keys:
--     * unsuffixed key = default/peak rate used by current app flows
--     * *_off_peak key = available for future season resolver
-- =============================================================================

-- If you want a full reset, uncomment:
-- TRUNCATE TABLE pricing RESTART IDENTITY CASCADE;

INSERT INTO pricing (key, amount_aed, label, category) VALUES
  -- ─── DAYCARE ───────────────────────────────────────────────────────────────
  ('daycare_single_day',        115.50, 'Daycare — 1 Dog',                           'daycare'),
  ('daycare_2_dogs',            173.25, 'Daycare — 2 Dogs',                          'daycare'),
  ('daycare_3_dogs',            231.00, 'Daycare — 3 Dogs',                          'daycare'),

  ('daycare_hourly_single_day',  38.50, 'Daycare Hourly — 1 Dog',                  'daycare'),
  ('daycare_hourly_2_dogs',      57.75, 'Daycare Hourly — 2 Dogs',                 'daycare'),
  ('daycare_hourly_3_dogs',      77.00, 'Daycare Hourly — 3 Dogs',                 'daycare'),
  ('daycare_hourly_family_per_dog', 29.00, 'Daycare Hourly — Family rate / dog (4+)', 'daycare'),
  ('daycare_hourly_4_dogs',     116.00, 'Daycare Hourly — 4 Dogs',                 'daycare'),
  ('daycare_hourly_5_dogs',     145.00, 'Daycare Hourly — 5 Dogs',                 'daycare'),
  ('daycare_hourly_6_dogs',     174.00, 'Daycare Hourly — 6 Dogs',                 'daycare'),

  -- ─── BOARDING (DEFAULT/PEAK) — keys match current resolver expectations ───
  ('standard_single',           173.25, 'Standard Suite — Single (Peak)',            'boarding'),
  ('deluxe_single',             225.75, 'Deluxe Suite — Single (Peak)',              'boarding'),
  ('deluxe_double',             315.00, 'Deluxe Suite — Double Small Dogs (Peak)',   'boarding'),
  ('royal_single',              278.25, 'Royal Suite — Single (Peak)',               'boarding'),
  ('royal_double',              393.75, 'Royal Suite — Double (Peak)',               'boarding'),
  ('presidential_single',       367.50, 'Presidential Suite — Single (Peak)',        'boarding'),
  ('presidential_double',       525.00, 'Presidential Suite — Double/Triple (Peak)', 'boarding'),
  ('little_gems_chalet_single', 173.25, 'Little Gems Chalet — Single (Peak)',        'boarding'),
  ('little_gems_chalet_double', 315.00, 'Little Gems Chalet — Double (Peak)',        'boarding'),
  ('little_gems_community_1',   315.00, 'Little Gems Community — 1st Dog (Peak)',    'boarding'),
  ('little_gems_community_extra',157.50,'Little Gems Community — Each Extra Dog (Peak)','boarding'),
  ('family_family',             525.00, 'Family Room — up to 4 dogs (Peak)',         'boarding'),

  -- room_type fallback keys currently used by resolver
  ('presidential_super_single',       367.50, 'Presidential Super — Single (Peak)',         'boarding'),
  ('presidential_standard_single',    367.50, 'Presidential Standard — Single (Peak)',      'boarding'),
  ('royal_suite_single_single',       278.25, 'Royal Suite Single — Single (Peak)',         'boarding'),
  ('royal_suite_double_double',       393.75, 'Royal Suite Double — Double (Peak)',         'boarding'),
  ('double_royal_double',             393.75, 'Double Royal — Double (Peak)',               'boarding'),
  ('single_royal_single',             278.25, 'Single Royal — Single (Peak)',               'boarding'),
  ('family_room_family',              525.00, 'Family Room — up to 4 dogs (Peak)',          'boarding'),
  ('royal_annex_single',              278.25, 'Royal Annex — Single (Peak)',                'boarding'),
  ('cattery_deluxe_single',            94.50, 'Cattery — Deluxe Single (Peak)',             'boarding'),
  ('cattery_presidential_double',     157.50, 'Cattery — Presidential Twin (Peak)',         'boarding'),
  ('cattery_super_presidential_triple',210.00,'Cattery — Super Presidential Triple (Peak)', 'boarding'),

  -- ─── BOARDING OFF-PEAK (future season resolver keys) ──────────────────────
  ('standard_single_off_peak',             157.50, 'Standard Suite — Single (Off-Peak)',            'boarding'),
  ('deluxe_single_off_peak',               189.00, 'Deluxe Suite — Single (Off-Peak)',              'boarding'),
  ('deluxe_double_off_peak',               273.00, 'Deluxe Suite — Double Small Dogs (Off-Peak)',   'boarding'),
  ('royal_single_off_peak',                210.00, 'Royal Suite — Single (Off-Peak)',               'boarding'),
  ('royal_double_off_peak',                315.00, 'Royal Suite — Double (Off-Peak)',               'boarding'),
  ('presidential_single_off_peak',         262.50, 'Presidential Suite — Single (Off-Peak)',        'boarding'),
  ('presidential_double_off_peak',         367.50, 'Presidential Suite — Double/Triple (Off-Peak)', 'boarding'),
  ('little_gems_chalet_single_off_peak',   157.50, 'Little Gems Chalet — Single (Off-Peak)',        'boarding'),
  ('little_gems_chalet_double_off_peak',   273.00, 'Little Gems Chalet — Double (Off-Peak)',        'boarding'),
  ('family_family_off_peak',               420.00, 'Family Room — up to 4 dogs (Off-Peak)',         'boarding'),
  ('cattery_deluxe_single_off_peak',        84.00, 'Cattery — Deluxe Single (Off-Peak)',            'boarding'),
  ('cattery_presidential_double_off_peak', 136.50, 'Cattery — Presidential Twin (Off-Peak)',        'boarding'),
  ('cattery_super_presidential_triple_off_peak', 189.00, 'Cattery — Super Presidential Triple (Off-Peak)', 'boarding'),

  -- ─── PARK ──────────────────────────────────────────────────────────────────
  ('park_1_dog',                 63.00, 'Dog Park Visit — 1 Dog',                  'park'),
  ('park_2_dogs',               105.00, 'Dog Park Visit — 2 Dogs',                 'park'),
  ('park_3_dogs',               126.00, 'Dog Park Visit — 3 Dogs',                 'park'),
  ('park_extra_dog',             31.50, 'Dog Park Visit — Additional Dog',         'park'),
  ('park_slot',                  63.00, 'Dog Park Visit — 1 Dog (slot)',           'park'),

  -- ─── TRANSPORT ─────────────────────────────────────────────────────────────
  ('transport_dubai_shared',     44.38, 'Dubai Taxi — Shared, 1 Dog One-way',      'transport'),
  ('transport_dubai',           125.00, 'Dubai Taxi — Private, up to 3 Family Dogs','transport'),
  ('transport_abudhabi',        250.00, 'Other Emirates Pickup — 1 Dog One-way',   'transport'),

  -- ─── REGISTRATION ──────────────────────────────────────────────────────────
  ('registration_member',       500.00, 'Member Registration — per Dog',           'membership'),

  -- ─── GROOMING (size-tiered families + extras) ─────────────────────────────
  ('grooming_grande_s',         294.00, 'Grande Grooming — Small',                 'grooming'),
  ('grooming_grande_m',         336.00, 'Grande Grooming — Medium',                'grooming'),
  ('grooming_grande_l',         378.00, 'Grande Grooming — Large',                 'grooming'),
  ('grooming_grande_xl',        399.00, 'Grande Grooming — Extra Large',           'grooming'),

  ('grooming_bijoux_s',         210.00, 'Bijoux Grooming — Small',                 'grooming'),
  ('grooming_bijoux_m',         242.00, 'Bijoux Grooming — Medium',                'grooming'),
  ('grooming_bijoux_l',         294.00, 'Bijoux Grooming — Large',                 'grooming'),
  ('grooming_bijoux_xl',        336.00, 'Bijoux Grooming — Extra Large',           'grooming'),

  ('grooming_deshed_long_s',    294.00, 'Deshedding (Long/Dense) — Small',         'grooming'),
  ('grooming_deshed_long_m',    336.00, 'Deshedding (Long/Dense) — Medium',        'grooming'),
  ('grooming_deshed_long_l',    378.00, 'Deshedding (Long/Dense) — Large',         'grooming'),
  ('grooming_deshed_long_xl',   399.00, 'Deshedding (Long/Dense) — Extra Large',   'grooming'),

  ('grooming_deshed_smooth_s',  210.00, 'Deshedding (Smooth/Flat) — Small',        'grooming'),
  ('grooming_deshed_smooth_m',  263.00, 'Deshedding (Smooth/Flat) — Medium',       'grooming'),
  ('grooming_deshed_smooth_l',  315.00, 'Deshedding (Smooth/Flat) — Large',        'grooming'),
  ('grooming_deshed_smooth_xl', 336.00, 'Deshedding (Smooth/Flat) — Extra Large',  'grooming'),

  ('grooming_bath_hourly',      158.00, 'Bath and Blow Dry — Hourly',              'grooming'),
  ('grooming_pawdicure',        105.00, 'Pawdicure',                                'grooming'),
  ('grooming_nail_clip',         47.00, 'Nail Clip',                                'grooming'),
  ('grooming_matting_min',       63.00, 'Matting Fee — Minimum',                    'grooming'),
  ('grooming_matting_max',      126.00, 'Matting Fee — Maximum',                    'grooming'),
  ('grooming_heavy_min',         47.00, 'Heavy Dog Fee — Minimum',                  'grooming'),
  ('grooming_heavy_max',        126.00, 'Heavy Dog Fee — Maximum',                  'grooming'),
  ('grooming_teeth',             42.00, 'Teeth Brushing',                           'grooming'),
  ('grooming_medicated',         37.00, 'Medicated Bath',                           'grooming'),
  ('grooming_full_groom',       294.00, 'Full Groom (default)',                     'grooming'),
  ('grooming_full_bath',        158.00, 'Full Bath (default)',                      'grooming'),

  -- ─── TRAINING ──────────────────────────────────────────────────────────────
  ('training_obedience_6wk',   1260.00, 'Obedience Classes — 6-week block',         'rule'),
  ('training_scent_6wk',       1399.00, 'Scent Work Classes — 6-week block',        'rule'),
  ('training_initial_consult',  460.00, 'Initial Consultation',                      'rule'),
  ('training_bespoke_from',    1260.00, 'Bespoke Training Package (from)',           'rule'),
  ('training_behaviour_from',  1459.00, 'Behavioural Package (from)',                'rule'),
  ('training_remote_from',     1260.00, 'Remote Training (from)',                    'rule'),
  ('training_single_from',      500.00, 'Single Session (from)',                     'rule')
ON CONFLICT (key) DO UPDATE
SET amount_aed = EXCLUDED.amount_aed,
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    updated_at = NOW();

-- =============================================================================
-- Optional checks
-- =============================================================================
-- SELECT category, COUNT(*) FROM pricing GROUP BY 1 ORDER BY 1;
-- SELECT key, amount_aed, label FROM pricing WHERE category='boarding' ORDER BY key;
