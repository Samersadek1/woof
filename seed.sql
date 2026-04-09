-- =============================================================================
-- SEED DATA: 10 dummy owner profiles
-- Run this entire block in the Supabase SQL editor (Dashboard → SQL Editor)
-- It is safe to re-run only if the owners don't already exist.
-- =============================================================================

DO $$
DECLARE
  -- ── Owner IDs ──────────────────────────────────────────────────────────────
  o1  UUID := gen_random_uuid();  -- Omar Al-Rashidi     (Gold, VIP, Always Same Room)
  o2  UUID := gen_random_uuid();  -- Sarah Pearson       (Silver)
  o3  UUID := gen_random_uuid();  -- Carlos Mendes       (Standard)
  o4  UUID := gen_random_uuid();  -- Khalid Al-Mansoori  (Gold, Camera Required)
  o5  UUID := gen_random_uuid();  -- Emma Fitzgerald     (Silver)
  o6  UUID := gen_random_uuid();  -- Yuki Nakamura       (Standard, low balance)
  o7  UUID := gen_random_uuid();  -- James Thornton      (Gold, VIP)
  o8  UUID := gen_random_uuid();  -- Fatima Hassan       (Standard)
  o9  UUID := gen_random_uuid();  -- Rodrigo Carvalho    (Silver)
  o10 UUID := gen_random_uuid();  -- Ana De Silva        (Standard, new client)

  -- ── Pet IDs ────────────────────────────────────────────────────────────────
  p1a UUID := gen_random_uuid();  -- Rex      (Rottweiler)
  p1b UUID := gen_random_uuid();  -- Luna     (Golden Retriever)
  p1c UUID := gen_random_uuid();  -- Bruno    (German Shepherd)
  p2a UUID := gen_random_uuid();  -- Max      (Labrador)
  p2b UUID := gen_random_uuid();  -- Whiskers (Persian cat)
  p3a UUID := gen_random_uuid();  -- Bella    (Beagle)
  p3b UUID := gen_random_uuid();  -- Rocky    (Border Collie)
  p4a UUID := gen_random_uuid();  -- Thor     (Husky)
  p5a UUID := gen_random_uuid();  -- Mochi    (Ragdoll cat)
  p5b UUID := gen_random_uuid();  -- Nala     (Bengal cat)
  p5c UUID := gen_random_uuid();  -- Leo      (Maine Coon cat)
  p6a UUID := gen_random_uuid();  -- Haru     (Shiba Inu)
  p7a UUID := gen_random_uuid();  -- Duke     (Doberman)
  p7b UUID := gen_random_uuid();  -- Lady     (Toy Poodle)
  p8a UUID := gen_random_uuid();  -- Coco     (Maltese)
  p9a UUID := gen_random_uuid();  -- Atlas    (Boxer)
  p9b UUID := gen_random_uuid();  -- Zara     (Dalmatian)
  p9c UUID := gen_random_uuid();  -- Simba    (Maine Coon cat)
  p10a UUID := gen_random_uuid(); -- Peanut   (Golden Retriever puppy)

  -- ── Room IDs — pulled from whichever active rooms exist ───────────────────
  room1 UUID; room2 UUID; room3 UUID;
  room4 UUID; room5 UUID; room6 UUID;

  -- ── Booking IDs ────────────────────────────────────────────────────────────
  b1 UUID := gen_random_uuid();  -- Rex + Luna   checked_in  Apr 01-08
  b2 UUID := gen_random_uuid();  -- Bruno        confirmed   Apr 10-17
  b3 UUID := gen_random_uuid();  -- Max          confirmed   Apr 05-12
  b4 UUID := gen_random_uuid();  -- Thor         checked_out Mar 18-27
  b5 UUID := gen_random_uuid();  -- Thor         confirmed   Apr 12-19
  b6 UUID := gen_random_uuid();  -- 3 cats       confirmed   Apr 07-14
  b7 UUID := gen_random_uuid();  -- Duke         checked_in  Mar 31-Apr 06
  b8 UUID := gen_random_uuid();  -- Lady         confirmed   Apr 08-13
  b9 UUID := gen_random_uuid();  -- Simba        enquiry     Apr 15-21

  -- ── Daycare Package IDs ────────────────────────────────────────────────────
  pkg1 UUID := gen_random_uuid(); -- Rex    9/12  active
  pkg2 UUID := gen_random_uuid(); -- Max    4/12  active
  pkg3 UUID := gen_random_uuid(); -- Bella 10/12  low credits
  pkg4 UUID := gen_random_uuid(); -- Rocky 12/12  exhausted
  pkg5 UUID := gen_random_uuid(); -- Haru   2/12  active
  pkg6 UUID := gen_random_uuid(); -- Coco  12/12  exhausted
  pkg7 UUID := gen_random_uuid(); -- Atlas  6/12  active

BEGIN
  -- ── Resolve room IDs ──────────────────────────────────────────────────────
  SELECT id INTO room1 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 0;
  SELECT id INTO room2 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 1;
  SELECT id INTO room3 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 2;
  SELECT id INTO room4 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 3;
  SELECT id INTO room5 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 4;
  SELECT id INTO room6 FROM rooms WHERE is_active = true ORDER BY room_number ASC LIMIT 1 OFFSET 5;

  -- Fallback: reuse earlier rooms if fewer than 6 active rooms exist
  IF room1 IS NULL THEN RAISE EXCEPTION 'No active rooms found. Please add rooms before seeding.'; END IF;
  IF room2 IS NULL THEN room2 := room1; END IF;
  IF room3 IS NULL THEN room3 := room1; END IF;
  IF room4 IS NULL THEN room4 := room2; END IF;
  IF room5 IS NULL THEN room5 := room3; END IF;
  IF room6 IS NULL THEN room6 := room4; END IF;

  -- ==========================================================================
  -- 1. OWNERS
  -- ==========================================================================
  INSERT INTO owners (
    id, first_name, last_name, phone, email, member_type, wallet_balance,
    is_vip, always_same_room, camera_required,
    address, emergency_contact_name, emergency_contact_phone,
    vet_name, vet_phone, how_heard, notes
  ) VALUES
    (o1,  'Omar',    'Al-Rashidi',  '+971501234567', 'omar.rashidi@email.com',    'gold',     5000.00, true,  true,  false,
     'Villa 12, Al Barsha, Dubai',    'Layla Al-Rashidi',      '+971501234568', 'Dr Ahmed Vet Clinic',         '+97143445566', 'Word of mouth', 'Prefers staff speak softly around Rex.'),

    (o2,  'Sarah',   'Pearson',     '+971502345678', 'sarah.pearson@email.com',   'silver',   2000.00, false, false, false,
     'Apartment 4B, JBR, Dubai',      'Tom Pearson',           '+971502345679', 'Gulf Vets',                   '+97143556677', 'Instagram',     'Whiskers is shy with other cats.'),

    (o3,  'Carlos',  'Mendes',      '+971503456789', 'carlos.mendes@email.com',   'standard',  800.00, false, false, false,
     'Townhouse 8, Motor City',       'Maria Mendes',          '+971503456790', 'PetVets Dubai',               '+97143667788', 'Google',        'Brings own food for both dogs.'),

    (o4,  'Khalid',  'Al-Mansoori', '+971504567890', 'khalid.mansoori@email.com', 'gold',     3500.00, false, false, true,
     'Floor 22, Downtown Dubai',      'Aisha Al-Mansoori',     '+971504567891', 'Downtown Animal Hospital',    '+97143778899', 'Referral',      'Owner requests camera access 24/7.'),

    (o5,  'Emma',    'Fitzgerald',  '+971505678901', 'emma.fitz@email.com',       'silver',   1800.00, false, false, false,
     'Villa 5, Arabian Ranches',      'Patrick Fitzgerald',    '+971505678902', 'Ranches Vet',                 '+97143889900', 'Facebook',      'Nala and Mochi can be territorial — separate rooms if stressed.'),

    (o6,  'Yuki',    'Nakamura',    '+971506789012', 'yuki.nakamura@email.com',   'standard',  450.00, false, false, false,
     'Studio 301, Dubai Marina',      'Kenji Nakamura',        '+971506789013', 'Marina Vets',                 '+97143990011', 'Online ad',     NULL),

    (o7,  'James',   'Thornton',    '+971507890123', 'j.thornton@email.com',      'gold',     7500.00, true,  false, false,
     'Mansion 3, Emirates Hills',     'Charlotte Thornton',    '+971507890124', 'Emirates Veterinary Hospital','+97144001122', 'Word of mouth', 'VIP. Always receives complimentary treat bag.'),

    (o8,  'Fatima',  'Hassan',      '+971508901234', 'fatima.hassan@email.com',   'standard', 1200.00, false, false, false,
     'Apt 12A, Jumeirah, Dubai',      'Ali Hassan',            '+971508901235', 'Jumeirah Vet Centre',         '+97143112233', 'Friend referral', NULL),

    (o9,  'Rodrigo', 'Carvalho',    '+971509012345', 'rodrigo.carvalho@email.com','silver',   2800.00, false, false, false,
     'Villa 17, Mirdif, Dubai',       'Isabela Carvalho',      '+971509012346', 'Mirdif Animal Clinic',        '+97143223344', 'Google',        'Atlas can be reactive on leash.'),

    (o10, 'Ana',     'De Silva',    '+971500123456', 'ana.desilva@email.com',     'standard', 1000.00, false, false, false,
     'Apt 8C, Business Bay',          'Miguel De Silva',       '+971500123457', 'Business Bay Vets',           '+97143334455', 'Walked past',   'New client — puppy first stay upcoming.');

  -- ==========================================================================
  -- 2. PETS
  -- ==========================================================================
  INSERT INTO pets (
    id, owner_id, name, species, breed, colour, gender, date_of_birth,
    weight_kg, spayed_neutered, assessment_status,
    feeding_instructions, medical_conditions, medications,
    behavioural_notes, grooming_notes, microchip_number
  ) VALUES
    -- Owner 1: Omar — 3 dogs
    (p1a, o1, 'Rex',      'dog', 'Rottweiler',        'Black & Tan',   'male',   '2019-06-15', 40.0, false, 'passed',
     '2 cups dry kibble twice daily', NULL, NULL,
     'Calm indoors, protective around strangers', 'Monthly brush; trim nails every 6 weeks', '982000411234567'),

    (p1b, o1, 'Luna',     'dog', 'Golden Retriever',  'Golden',        'female', '2020-03-20', 28.0, true,  'passed',
     '1.5 cups premium food twice daily', 'Mild hip dysplasia', 'Joint supplement in food daily',
     'Very friendly, loves people and other dogs', 'Full groom every 8 weeks', '982000422345678'),

    (p1c, o1, 'Bruno',    'dog', 'German Shepherd',   'Black & Gold',  'male',   '2021-09-01', 35.0, false, 'passed',
     '2 cups dry food twice daily', NULL, NULL,
     'High energy; needs minimum 2 walks/day', 'Brush weekly', '982000433456789'),

    -- Owner 2: Sarah — dog + cat
    (p2a, o2, 'Max',      'dog', 'Labrador',          'Yellow',        'male',   '2020-07-10', 32.0, true,  'passed',
     '2 cups dry kibble twice daily', 'Occasional ear infections', 'Ear drops as needed',
     'Friendly, great with kids and other dogs', 'Bath every 6 weeks', '982000444567890'),

    (p2b, o2, 'Whiskers', 'cat', 'Persian',           'White',         'female', '2018-11-05',  4.5, true,  'passed',
     'Wet food morning, dry food evening', 'Sensitive stomach', 'Probiotics with food',
     'Shy, needs quiet environment away from dogs', 'Daily brush to prevent matting', '982000455678901'),

    -- Owner 3: Carlos — 2 dogs
    (p3a, o3, 'Bella',    'dog', 'Beagle',            'Tri-colour',    'female', '2021-04-22', 12.0, true,  'passed',
     '1 cup dry food twice daily', NULL, NULL,
     'Scent-driven; secure all gates at all times', 'Bath monthly', '982000466789012'),

    (p3b, o3, 'Rocky',    'dog', 'Border Collie',     'Black & White', 'male',   '2020-12-15', 20.0, false, 'passed',
     '1.5 cups dry food twice daily', NULL, NULL,
     'Highly intelligent, needs mental stimulation daily', 'Brush twice a week', '982000477890123'),

    -- Owner 4: Khalid — 1 dog
    (p4a, o4, 'Thor',     'dog', 'Siberian Husky',    'Grey & White',  'male',   '2019-02-28', 26.0, false, 'passed',
     '2 cups premium dry food twice daily', 'Skin allergies — no chicken-based food',
     'Half antihistamine tablet every other day',
     'Escape artist; double-check all gates and latches', 'Brush 3x per week; heavy seasonal shedding', '982000488901234'),

    -- Owner 5: Emma — 3 cats
    (p5a, o5, 'Mochi',    'cat', 'Ragdoll',           'Seal Bicolour', 'female', '2020-08-14',  5.2, true,  'passed',
     'Premium wet food twice daily', NULL, NULL,
     'Very docile, loves cuddles from staff', 'Brush twice a week', '982000499012345'),

    (p5b, o5, 'Nala',     'cat', 'Bengal',            'Brown Spotted', 'female', '2021-01-30',  4.8, true,  'passed',
     'Half sachet wet food + dry food freely available', NULL, NULL,
     'Energetic; needs enrichment toys in room', 'Minimal grooming needed', '982000400123456'),

    (p5c, o5, 'Leo',      'cat', 'Maine Coon',        'Silver Tabby',  'male',   '2019-05-20',  7.1, true,  'passed',
     'Wet food morning, dry food self-service', 'Hairball tendency', 'Hairball paste once weekly',
     'Gentle giant; gets along with everyone', 'Weekly brush essential to prevent tangles', '982000411234560'),

    -- Owner 6: Yuki — 1 dog
    (p6a, o6, 'Haru',     'dog', 'Shiba Inu',         'Red',           'male',   '2022-03-05',  9.0, false, 'passed',
     '1 cup dry food twice daily', NULL, NULL,
     'Independent; slight dog-reactivity on leash, fine off-leash', 'Monthly bath and brush', '982000422345670'),

    -- Owner 7: James — 2 dogs
    (p7a, o7, 'Duke',     'dog', 'Doberman',          'Black & Tan',   'male',   '2018-11-10', 38.0, false, 'passed',
     '2.5 cups dry food twice daily', 'Dilated Cardiomyopathy — under cardiology',
     'Cardiac supplement (Taurine) in morning food',
     'Well-trained and calm; thrives on consistent routine', 'Monthly groom', '982000433456780'),

    (p7b, o7, 'Lady',     'dog', 'Toy Poodle',        'Apricot',       'female', '2020-06-01',  5.5, true,  'passed',
     'Half cup premium small-breed food twice daily', NULL, NULL,
     'Very social, loves attention and cuddles from staff', 'Full groom every 5 weeks', '982000444567800'),

    -- Owner 8: Fatima — 1 dog
    (p8a, o8, 'Coco',     'dog', 'Maltese',           'White',         'female', '2021-02-18',  3.5, true,  'passed',
     'Half cup small-breed food twice daily', 'Dental disease — no hard chew treats',
     NULL,
     'Friendly and playful, gets on with everyone', 'Full groom every 4 weeks', '982000455678900'),

    -- Owner 9: Rodrigo — 2 dogs + 1 cat
    (p9a, o9, 'Atlas',    'dog', 'Boxer',             'Fawn',          'male',   '2020-10-25', 30.0, false, 'passed',
     '2 cups dry food twice daily', NULL, NULL,
     'Leash-reactive with unknown dogs; good off-leash indoors', 'Bath every 8 weeks', '982000466789000'),

    (p9b, o9, 'Zara',     'dog', 'Dalmatian',         'White & Black', 'female', '2021-07-12', 25.0, true,  'passed',
     '1.5 cups low-purine dry food twice daily', 'Low-purine diet required (urate stones history)',
     NULL,
     'Calm and very well-behaved', 'Brush weekly to control shedding', '982000477890000'),

    (p9c, o9, 'Simba',    'cat', 'Maine Coon',        'Brown Tabby',   'male',   '2020-04-03',  6.8, true,  'passed',
     'Wet food twice daily + dry freely available', NULL, NULL,
     'Friendly, comfortable around dogs', 'Weekly brush', '982000488900000'),

    -- Owner 10: Ana — 1 puppy
    (p10a,o10,'Peanut',   'dog', 'Golden Retriever',  'Golden',        'female', '2025-11-20',  4.5, false, 'not_assessed',
     'Half cup puppy food 3 times daily', NULL, NULL,
     'Puppy — still learning basic commands, very excitable', 'Bath as needed', '982000499000001');

  -- ==========================================================================
  -- 3. VACCINATIONS
  -- ==========================================================================
  INSERT INTO vaccinations (pet_id, vaccine_name, administered_date, expiry_date) VALUES
    -- Rex (all valid)
    (p1a, 'Rabies',        '2025-06-15', '2026-06-15'),
    (p1a, 'DHPP',          '2025-06-15', '2026-06-15'),
    (p1a, 'Bordetella',    '2025-06-15', '2026-06-15'),
    -- Luna (1 expiring soon in ~12 days)
    (p1b, 'Rabies',        '2025-05-20', '2026-05-20'),
    (p1b, 'DHPP',          '2025-03-01', '2026-04-15'),
    (p1b, 'Bordetella',    '2025-05-20', '2026-05-20'),
    -- Bruno (all valid)
    (p1c, 'Rabies',        '2025-09-01', '2026-09-01'),
    (p1c, 'DHPP',          '2025-09-01', '2026-09-01'),
    (p1c, 'Bordetella',    '2025-09-01', '2026-09-01'),
    -- Max (all valid)
    (p2a, 'Rabies',        '2025-07-10', '2026-07-10'),
    (p2a, 'DHPP',          '2025-07-10', '2026-07-10'),
    (p2a, 'Bordetella',    '2025-07-10', '2026-07-10'),
    -- Whiskers (1 expired)
    (p2b, 'Feline FVRCP',  '2024-11-05', '2025-11-05'),
    (p2b, 'FeLV',          '2025-11-05', '2026-11-05'),
    -- Bella (valid)
    (p3a, 'Rabies',        '2025-04-22', '2026-04-22'),
    (p3a, 'DHPP',          '2025-04-22', '2026-04-22'),
    -- Rocky (valid)
    (p3b, 'Rabies',        '2025-12-15', '2026-12-15'),
    (p3b, 'DHPP',          '2025-12-15', '2026-12-15'),
    -- Thor (1 expiring soon, 1 expired)
    (p4a, 'Rabies',        '2025-02-28', '2026-04-20'),
    (p4a, 'DHPP',          '2025-02-28', '2026-02-28'),
    (p4a, 'Bordetella',    '2025-08-01', '2026-08-01'),
    -- Mochi (all valid)
    (p5a, 'Feline FVRCP',  '2025-08-14', '2026-08-14'),
    (p5a, 'FeLV',          '2025-08-14', '2026-08-14'),
    -- Nala (1 expired)
    (p5b, 'Feline FVRCP',  '2025-01-30', '2026-01-30'),
    (p5b, 'FeLV',          '2025-06-01', '2026-06-01'),
    -- Leo (valid)
    (p5c, 'Feline FVRCP',  '2025-05-20', '2026-05-20'),
    (p5c, 'FeLV',          '2025-05-20', '2026-05-20'),
    -- Haru (1 expired)
    (p6a, 'Rabies',        '2025-03-05', '2026-03-05'),
    (p6a, 'DHPP',          '2025-09-05', '2026-09-05'),
    -- Duke (all valid)
    (p7a, 'Rabies',        '2025-11-10', '2026-11-10'),
    (p7a, 'DHPP',          '2025-11-10', '2026-11-10'),
    (p7a, 'Bordetella',    '2025-11-10', '2026-11-10'),
    -- Lady (all valid)
    (p7b, 'Rabies',        '2025-06-01', '2026-06-01'),
    (p7b, 'DHPP',          '2025-06-01', '2026-06-01'),
    (p7b, 'Bordetella',    '2025-06-01', '2026-06-01'),
    -- Coco (1 expired)
    (p8a, 'Rabies',        '2025-02-18', '2026-02-18'),
    (p8a, 'DHPP',          '2025-08-18', '2026-08-18'),
    -- Atlas (valid)
    (p9a, 'Rabies',        '2025-10-25', '2026-10-25'),
    (p9a, 'DHPP',          '2025-10-25', '2026-10-25'),
    -- Zara (valid)
    (p9b, 'Rabies',        '2025-07-12', '2026-07-12'),
    (p9b, 'DHPP',          '2025-07-12', '2026-07-12'),
    -- Simba (1 expired today)
    (p9c, 'Feline FVRCP',  '2025-04-03', '2026-04-03'),
    (p9c, 'FeLV',          '2025-10-03', '2026-10-03'),
    -- Peanut — puppy boosters (1 expired/overdue, 1 expiring soon)
    (p10a,'Puppy DHPP #1', '2025-12-01', '2026-03-01'),
    (p10a,'Puppy DHPP #2', '2026-01-05', '2026-04-15');

  -- ==========================================================================
  -- 4. BOOKINGS
  -- ==========================================================================
  INSERT INTO bookings (
    id, owner_id, room_id, check_in_date, check_out_date,
    status, notes, do_not_move, booking_ref, actual_check_in_at, actual_check_out_at
  ) VALUES
    -- B1: Rex + Luna — checked_in (Apr 01–08)
    (b1, o1, room1, '2026-04-01', '2026-04-08',
     'checked_in', 'Rex on lower platform. Luna needs extra blanket.', true,
     'MSH-2026-00001', '2026-04-01T10:30:00Z', NULL),

    -- B2: Bruno — confirmed future (Apr 10–17)
    (b2, o1, room2, '2026-04-10', '2026-04-17',
     'confirmed', 'Owner dropping off after 9am.', false,
     'MSH-2026-00002', NULL, NULL),

    -- B3: Max — confirmed future (Apr 05–12)
    (b3, o2, room3, '2026-04-05', '2026-04-12',
     'confirmed', 'Ear drops packed in drop-off bag.', false,
     'MSH-2026-00003', NULL, NULL),

    -- B4: Thor — checked_out (Mar 18–27)
    (b4, o4, room4, '2026-03-18', '2026-03-27',
     'checked_out', 'Camera access active — send daily link to owner.', false,
     'MSH-2026-00004', '2026-03-18T09:00:00Z', '2026-03-27T11:00:00Z'),

    -- B5: Thor — confirmed future (Apr 12–19)
    (b5, o4, room4, '2026-04-12', '2026-04-19',
     'confirmed', 'Same room as last stay — Do Not Move flag.', true,
     'MSH-2026-00005', NULL, NULL),

    -- B6: Mochi + Nala + Leo — confirmed (Apr 07–14)
    (b6, o5, room5, '2026-04-07', '2026-04-14',
     'confirmed', 'Keep Nala and Mochi in separate rooms if Nala shows stress.', false,
     'MSH-2026-00006', NULL, NULL),

    -- B7: Duke — checked_in (Mar 31–Apr 06)
    (b7, o7, room2, '2026-03-31', '2026-04-06',
     'checked_in', 'Cardiac supplement in morning food — see vet notes.', true,
     'MSH-2026-00007', '2026-03-31T11:00:00Z', NULL),

    -- B8: Lady — confirmed future (Apr 08–13)
    (b8, o7, room6, '2026-04-08', '2026-04-13',
     'confirmed', 'Full groom on checkout booked with grooming team.', false,
     'MSH-2026-00008', NULL, NULL),

    -- B9: Simba — enquiry (Apr 15–21)
    (b9, o9, room5, '2026-04-15', '2026-04-21',
     'enquiry', 'Cattery preferred. Owner still confirming exact dates.', false,
     'MSH-2026-00009', NULL, NULL);

  -- ==========================================================================
  -- 5. BOOKING PETS (junction)
  -- ==========================================================================
  INSERT INTO booking_pets (booking_id, pet_id) VALUES
    (b1, p1a), (b1, p1b),  -- Rex & Luna in B1
    (b2, p1c),              -- Bruno in B2
    (b3, p2a),              -- Max in B3
    (b4, p4a),              -- Thor in B4
    (b5, p4a),              -- Thor in B5
    (b6, p5a), (b6, p5b), (b6, p5c),  -- 3 cats in B6
    (b7, p7a),              -- Duke in B7
    (b8, p7b),              -- Lady in B8
    (b9, p9c);              -- Simba in B9

  -- ==========================================================================
  -- 6. DAYCARE PACKAGES
  -- ==========================================================================
  INSERT INTO daycare_packages (
    id, owner_id, pet_id, total_days, days_used,
    purchase_date, expiry_date, price_paid, notes
  ) VALUES
    (pkg1, o1, p1a, 12,  9, '2026-01-15', '2026-07-15', 1500.00, 'Gold member discount applied'),
    (pkg2, o2, p2a, 12,  4, '2026-02-10', '2026-08-10', 1500.00, NULL),
    (pkg3, o3, p3a, 12, 10, '2026-01-22', '2026-07-22', 1200.00, NULL),
    (pkg4, o3, p3b, 12, 12, '2025-10-15', '2026-04-15', 1200.00, 'Package exhausted — remind owner to renew'),
    (pkg5, o6, p6a, 12,  2, '2026-03-01', '2026-09-01',  950.00, NULL),
    (pkg6, o8, p8a, 12, 12, '2025-11-18', '2026-05-18', 1200.00, 'Package exhausted — expiring next month'),
    (pkg7, o9, p9a, 12,  6, '2026-02-20', '2026-08-20', 1200.00, NULL);

  -- ==========================================================================
  -- 7. DAYCARE SESSIONS
  -- ==========================================================================
  INSERT INTO daycare_sessions (
    owner_id, pet_id, package_id, session_date, checked_in, checked_in_at, notes
  ) VALUES
    -- Rex / pkg1 — 9 sessions
    (o1, p1a, pkg1, '2026-01-20', true, '2026-01-20T08:30:00Z', NULL),
    (o1, p1a, pkg1, '2026-01-27', true, '2026-01-27T08:45:00Z', NULL),
    (o1, p1a, pkg1, '2026-02-03', true, '2026-02-03T09:00:00Z', NULL),
    (o1, p1a, pkg1, '2026-02-10', true, '2026-02-10T08:30:00Z', NULL),
    (o1, p1a, pkg1, '2026-02-17', true, '2026-02-17T08:30:00Z', 'Rex very playful today'),
    (o1, p1a, pkg1, '2026-02-24', true, '2026-02-24T09:15:00Z', NULL),
    (o1, p1a, pkg1, '2026-03-03', true, '2026-03-03T08:30:00Z', NULL),
    (o1, p1a, pkg1, '2026-03-10', true, '2026-03-10T08:30:00Z', NULL),
    (o1, p1a, pkg1, '2026-03-17', true, '2026-03-17T09:00:00Z', 'Owner collected late — noted'),

    -- Max / pkg2 — 4 sessions
    (o2, p2a, pkg2, '2026-02-16', true, '2026-02-16T08:30:00Z', NULL),
    (o2, p2a, pkg2, '2026-02-23', true, '2026-02-23T08:30:00Z', NULL),
    (o2, p2a, pkg2, '2026-03-02', true, '2026-03-02T09:00:00Z', NULL),
    (o2, p2a, pkg2, '2026-03-16', true, '2026-03-16T08:30:00Z', NULL),

    -- Bella / pkg3 — 10 sessions
    (o3, p3a, pkg3, '2026-01-26', true, '2026-01-26T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-02-02', true, '2026-02-02T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-02-09', true, '2026-02-09T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-02-16', true, '2026-02-16T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-02-23', true, '2026-02-23T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-03-02', true, '2026-03-02T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-03-09', true, '2026-03-09T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-03-16', true, '2026-03-16T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-03-23', true, '2026-03-23T09:00:00Z', NULL),
    (o3, p3a, pkg3, '2026-03-30', true, '2026-03-30T09:00:00Z', NULL),

    -- Rocky / pkg4 — 12 sessions (exhausted)
    (o3, p3b, pkg4, '2025-10-20', true, '2025-10-20T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-10-27', true, '2025-10-27T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-11-03', true, '2025-11-03T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-11-10', true, '2025-11-10T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-11-17', true, '2025-11-17T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-11-24', true, '2025-11-24T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-12-01', true, '2025-12-01T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-12-08', true, '2025-12-08T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-12-15', true, '2025-12-15T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2025-12-22', true, '2025-12-22T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2026-01-05', true, '2026-01-05T09:00:00Z', NULL),
    (o3, p3b, pkg4, '2026-01-12', true, '2026-01-12T09:00:00Z', 'Package fully used — advise owner to renew'),

    -- Haru / pkg5 — 2 sessions
    (o6, p6a, pkg5, '2026-03-09', true, '2026-03-09T09:30:00Z', NULL),
    (o6, p6a, pkg5, '2026-03-23', true, '2026-03-23T09:30:00Z', NULL),

    -- Coco / pkg6 — 12 sessions (exhausted)
    (o8, p8a, pkg6, '2025-11-24', true, '2025-11-24T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2025-12-01', true, '2025-12-01T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2025-12-08', true, '2025-12-08T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2025-12-15', true, '2025-12-15T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2025-12-22', true, '2025-12-22T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-01-05', true, '2026-01-05T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-01-12', true, '2026-01-12T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-01-19', true, '2026-01-19T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-01-26', true, '2026-01-26T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-02-09', true, '2026-02-09T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-02-23', true, '2026-02-23T09:00:00Z', NULL),
    (o8, p8a, pkg6, '2026-03-09', true, '2026-03-09T09:00:00Z', 'Last session on this package'),

    -- Atlas / pkg7 — 6 sessions
    (o9, p9a, pkg7, '2026-02-23', true, '2026-02-23T09:00:00Z', NULL),
    (o9, p9a, pkg7, '2026-03-02', true, '2026-03-02T09:00:00Z', NULL),
    (o9, p9a, pkg7, '2026-03-09', true, '2026-03-09T09:00:00Z', NULL),
    (o9, p9a, pkg7, '2026-03-16', true, '2026-03-16T09:00:00Z', NULL),
    (o9, p9a, pkg7, '2026-03-23', true, '2026-03-23T09:00:00Z', NULL),
    (o9, p9a, pkg7, '2026-03-30', true, '2026-03-30T09:00:00Z', NULL);

  -- ==========================================================================
  -- 8. WALLET TRANSACTIONS
  --    balance_after chain matches owners.wallet_balance for each owner
  -- ==========================================================================
  INSERT INTO wallet_transactions (
    owner_id, transaction_type, amount, balance_after, payment_method, notes, created_at
  ) VALUES
    -- Omar Al-Rashidi (final balance 5000)
    (o1, 'top_up',        5500.00, 5500.00, 'card',   'Initial wallet top-up',            '2026-01-10T10:00:00Z'),
    (o1, 'membership_fee', -500.00, 5000.00, 'card',  'Annual Gold membership fee',        '2026-01-10T10:05:00Z'),

    -- Sarah Pearson (final balance 2000)
    (o2, 'top_up',        2300.00, 2300.00, 'card',   'Initial wallet top-up',            '2026-01-15T09:00:00Z'),
    (o2, 'membership_fee', -300.00, 2000.00, 'card',  'Annual Silver membership fee',      '2026-01-15T09:05:00Z'),

    -- Carlos Mendes (final balance 800)
    (o3, 'top_up',        1000.00, 1000.00, 'cash',   'Cash top-up at reception',         '2026-01-20T11:00:00Z'),
    (o3, 'deduction',      -200.00,  800.00, 'wallet', 'Daycare package top-up deduction', '2026-01-22T09:00:00Z'),

    -- Khalid Al-Mansoori (final balance 3500)
    (o4, 'top_up',        4000.00, 4000.00, 'card',   'Initial wallet top-up',            '2026-01-05T08:00:00Z'),
    (o4, 'membership_fee', -500.00, 3500.00, 'card',  'Annual Gold membership fee',        '2026-01-05T08:05:00Z'),

    -- Emma Fitzgerald (final balance 1800)
    (o5, 'top_up',        2100.00, 2100.00, 'card',   'Top-up for upcoming cattery stay',  '2026-02-01T10:00:00Z'),
    (o5, 'membership_fee', -300.00, 1800.00, 'card',  'Annual Silver membership fee',      '2026-02-01T10:05:00Z'),

    -- Yuki Nakamura (final balance 450 — low)
    (o6, 'top_up',         950.00,  950.00, 'cash',   'Initial cash top-up',              '2026-02-28T14:00:00Z'),
    (o6, 'deduction',      -500.00,  450.00, 'wallet', 'Daycare package purchase — Haru', '2026-03-01T09:00:00Z'),

    -- James Thornton (final balance 7500)
    (o7, 'top_up',        5000.00, 5000.00, 'card',   'Initial wallet top-up',            '2025-12-01T09:00:00Z'),
    (o7, 'membership_fee', -500.00, 4500.00, 'card',  'Annual Gold membership fee',        '2025-12-01T09:05:00Z'),
    (o7, 'top_up',        3000.00, 7500.00, 'card',   'Top-up for extended boarding stay', '2026-01-20T11:00:00Z'),

    -- Fatima Hassan (final balance 1200)
    (o8, 'top_up',        1500.00, 1500.00, 'cash',   'Cash top-up at reception',         '2025-11-15T10:00:00Z'),
    (o8, 'deduction',      -300.00, 1200.00, 'wallet', 'Daycare package — Coco',          '2025-11-18T09:00:00Z'),

    -- Rodrigo Carvalho (final balance 2800)
    (o9, 'top_up',        3100.00, 3100.00, 'card',   'Initial wallet top-up',            '2026-02-15T09:00:00Z'),
    (o9, 'membership_fee', -300.00, 2800.00, 'card',  'Annual Silver membership fee',      '2026-02-15T09:05:00Z'),

    -- Ana De Silva (final balance 1000)
    (o10,'top_up',        1000.00, 1000.00, 'cash',   'New client first top-up at reception','2026-03-28T11:00:00Z');

END $$;
