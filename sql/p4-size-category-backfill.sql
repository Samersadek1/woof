DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets' AND column_name = 'weight_kg'
  ) THEN
    EXECUTE $sql$
      UPDATE pets
      SET size_category = CASE
        WHEN weight_kg IS NULL THEN NULL
        WHEN weight_kg < 10 THEN 'S'::pet_size_category
        WHEN weight_kg < 20 THEN 'M'::pet_size_category
        WHEN weight_kg < 35 THEN 'L'::pet_size_category
        ELSE 'XL'::pet_size_category
      END
      WHERE size_category IS NULL;
    $sql$;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets' AND column_name = 'weight'
  ) THEN
    EXECUTE $sql$
      UPDATE pets
      SET size_category = CASE
        WHEN weight IS NULL THEN NULL
        WHEN weight < 10 THEN 'S'::pet_size_category
        WHEN weight < 20 THEN 'M'::pet_size_category
        WHEN weight < 35 THEN 'L'::pet_size_category
        ELSE 'XL'::pet_size_category
      END
      WHERE size_category IS NULL;
    $sql$;
  END IF;
END
$$;
