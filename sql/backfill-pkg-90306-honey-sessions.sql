-- Backfill Honey PKG-90306 sessions (29 authority usage dates)
BEGIN;

INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
SELECT '992911d9-8c65-45a7-b5b6-beacc6f94672'::uuid, 'ae113262-d720-4156-9e3b-1c44f977e94c'::uuid, '7f9785db-1207-40e6-a120-7d68bffbc450'::uuid, v.session_date, true, v.notes
FROM (
  VALUES
  ('2026-01-26'::date, 'U1', 'Legacy migration | tracker=PKG-90306 | slot=U1 | recovered=authority_changelog | date_raw=2026-01-26'),
  ('2026-01-27'::date, 'U2', 'Legacy migration | tracker=PKG-90306 | slot=U2 | recovered=authority_changelog | date_raw=2026-01-27'),
  ('2026-01-31'::date, 'U3', 'Legacy migration | tracker=PKG-90306 | slot=U3 | recovered=authority_changelog | date_raw=2026-01-31'),
  ('2026-02-03'::date, 'U4', 'Legacy migration | tracker=PKG-90306 | slot=U4 | recovered=authority_changelog | date_raw=2026-02-03'),
  ('2026-02-05'::date, 'U5', 'Legacy migration | tracker=PKG-90306 | slot=U5 | recovered=authority_changelog | date_raw=2026-02-05'),
  ('2026-02-10'::date, 'U6', 'Legacy migration | tracker=PKG-90306 | slot=U6 | recovered=authority_changelog | date_raw=2026-02-10'),
  ('2026-02-12'::date, 'U7', 'Legacy migration | tracker=PKG-90306 | slot=U7 | recovered=authority_changelog | date_raw=2026-02-12'),
  ('2026-02-17'::date, 'U8', 'Legacy migration | tracker=PKG-90306 | slot=U8 | recovered=authority_changelog | date_raw=2026-02-17'),
  ('2026-02-24'::date, 'U9', 'Legacy migration | tracker=PKG-90306 | slot=U9 | recovered=authority_changelog | date_raw=2026-02-24'),
  ('2026-02-26'::date, 'U10', 'Legacy migration | tracker=PKG-90306 | slot=U10 | recovered=authority_changelog | date_raw=2026-02-26'),
  ('2026-03-24'::date, 'U11', 'Legacy migration | tracker=PKG-90306 | slot=U11 | recovered=authority_changelog | date_raw=2026-03-24'),
  ('2026-04-04'::date, 'U12', 'Legacy migration | tracker=PKG-90306 | slot=U12 | recovered=authority_changelog | date_raw=2026-04-04'),
  ('2026-04-07'::date, 'U13', 'Legacy migration | tracker=PKG-90306 | slot=U13 | recovered=authority_changelog | date_raw=2026-04-07'),
  ('2026-04-09'::date, 'U14', 'Legacy migration | tracker=PKG-90306 | slot=U14 | recovered=authority_changelog | date_raw=2026-04-09'),
  ('2026-04-14'::date, 'U15', 'Legacy migration | tracker=PKG-90306 | slot=U15 | recovered=authority_changelog | date_raw=2026-04-14'),
  ('2026-04-16'::date, 'U16', 'Legacy migration | tracker=PKG-90306 | slot=U16 | recovered=authority_changelog | date_raw=2026-04-16'),
  ('2026-04-21'::date, 'U17', 'Legacy migration | tracker=PKG-90306 | slot=U17 | recovered=authority_changelog | date_raw=2026-04-21'),
  ('2026-04-23'::date, 'U18', 'Legacy migration | tracker=PKG-90306 | slot=U18 | recovered=authority_changelog | date_raw=2026-04-23'),
  ('2026-04-25'::date, 'U19', 'Legacy migration | tracker=PKG-90306 | slot=U19 | recovered=authority_changelog | date_raw=2026-04-25'),
  ('2026-04-28'::date, 'U20', 'Legacy migration | tracker=PKG-90306 | slot=U20 | recovered=authority_changelog | date_raw=2026-04-28'),
  ('2026-04-30'::date, 'U21', 'Legacy migration | tracker=PKG-90306 | slot=U21 | recovered=authority_changelog | date_raw=2026-04-30'),
  ('2026-05-02'::date, 'U22', 'Legacy migration | tracker=PKG-90306 | slot=U22 | recovered=authority_changelog | date_raw=2026-05-02'),
  ('2026-05-05'::date, 'U23', 'Legacy migration | tracker=PKG-90306 | slot=U23 | recovered=authority_changelog | date_raw=2026-05-05'),
  ('2026-05-07'::date, 'U24', 'Legacy migration | tracker=PKG-90306 | slot=U24 | recovered=authority_changelog | date_raw=2026-05-07'),
  ('2026-05-09'::date, 'U25', 'Legacy migration | tracker=PKG-90306 | slot=U25 | recovered=authority_changelog | date_raw=2026-05-09'),
  ('2026-05-12'::date, 'U26', 'Legacy migration | tracker=PKG-90306 | slot=U26 | recovered=authority_changelog | date_raw=2026-05-12'),
  ('2026-05-14'::date, 'U27', 'Legacy migration | tracker=PKG-90306 | slot=U27 | recovered=authority_changelog | date_raw=2026-05-14'),
  ('2026-05-19'::date, 'U28', 'Legacy migration | tracker=PKG-90306 | slot=U28 | recovered=authority_changelog | date_raw=2026-05-19'),
  ('2026-05-21'::date, 'U29', 'Legacy migration | tracker=PKG-90306 | slot=U29 | recovered=authority_changelog | date_raw=2026-05-21')
) AS v(session_date, usage_slot, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM daycare_sessions ds
  WHERE ds.pet_id = 'ae113262-d720-4156-9e3b-1c44f977e94c'::uuid
    AND ds.package_id = '7f9785db-1207-40e6-a120-7d68bffbc450'::uuid
    AND ds.session_date = v.session_date
);

DELETE FROM daycare_sessions
WHERE id = 'b1344de3-e16a-4813-a9fb-e081df8f7ce4'::uuid
  AND session_date = '2026-01-20'::date
  AND notes LIKE '%tracker=PKG-90306%';

COMMIT;

SELECT sc.units_total, sc.units_consumed,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions_linked
FROM service_credits sc WHERE sc.id = '7f9785db-1207-40e6-a120-7d68bffbc450'::uuid;
