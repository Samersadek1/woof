-- Phase 5c apply (run AFTER staging INSERTs in phase5c_contact_cleanup.sql)
-- Requires _contact_stage temp table in same transaction.

-- ----- Step 2: Insert distinct vet clinic names into the catalog (idempotent)
INSERT INTO vet_clinics (name, phone)
SELECT DISTINCT s.vet_name, MAX(s.vet_phone)
FROM _contact_stage s
WHERE s.vet_name IS NOT NULL
GROUP BY s.vet_name
ON CONFLICT (name) DO UPDATE
  SET phone = COALESCE(vet_clinics.phone, EXCLUDED.phone);

-- ----- Step 3: Update owners
UPDATE owners o
SET phone                   = COALESCE(s.cleaned_phone,          o.phone),
    phone2                  = COALESCE(NULLIF(o.phone2,''),      s.secondary_phone),
    emergency_contact_name  = COALESCE(NULLIF(o.emergency_contact_name,''),  s.emergency_name),
    emergency_contact_phone = COALESCE(NULLIF(o.emergency_contact_phone,''), s.emergency_phone),
    vet_name                = COALESCE(NULLIF(o.vet_name,''),    s.vet_name),
    vet_phone               = COALESCE(NULLIF(o.vet_phone,''),   s.vet_phone),
    notes                   = TRIM(BOTH ' |' FROM
      COALESCE(o.notes, '') ||
      CASE WHEN s.channel_note IS NOT NULL THEN ' | ' || s.channel_note ELSE '' END ||
      CASE WHEN s.leftover_raw IS NOT NULL
           THEN ' | contact_cleanup_review: ' || s.leftover_raw
           ELSE '' END
    )
FROM _contact_stage s
WHERE o.source_external_id = s.source_external_id;

-- ----- Step 4: Clear phone when ContactNumber was vet-only
UPDATE owners o
SET phone = NULL
FROM _contact_stage s
WHERE o.source_external_id = s.source_external_id
  AND s.vet_name IS NOT NULL
  AND s.cleaned_phone IS NULL
  AND o.phone = s.raw_original;

-- ----- POST-CHECK
SELECT
  (SELECT COUNT(*) FROM vet_clinics)                                              AS vet_clinics_total,
  (SELECT COUNT(*) FROM owners WHERE vet_name IS NOT NULL AND vet_name != '')     AS owners_with_vet_name,
  (SELECT COUNT(*) FROM owners WHERE phone2 IS NOT NULL AND phone2 != '')         AS owners_with_phone2,
  (SELECT COUNT(*) FROM owners
    WHERE emergency_contact_phone IS NOT NULL AND emergency_contact_phone != '')  AS owners_with_emergency,
  (SELECT COUNT(*) FROM owners WHERE phone ~ '[A-Za-z]{3,}')                      AS still_text_in_phone,
  (SELECT COUNT(*) FROM owners WHERE phone LIKE '%/%')                            AS still_slash_in_phone;
