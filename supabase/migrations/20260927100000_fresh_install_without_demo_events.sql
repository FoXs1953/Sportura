-- The original schema seeded demonstration events. Fresh installations should
-- start empty; never remove events from a database that already has users.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    DELETE FROM public.activities
    WHERE manager_id IS NULL AND organizer_id IS NULL
      AND (title, host_name) IN (
        ('Мини-футбол 7×7', 'Данияр С.'),
        ('Уличная пятёрка', 'Алишер К.'),
        ('Сет у бассейна', 'Мадина Т.'),
        ('Футбол по субботам', 'Ержан Б.'),
        ('Кубок дворов Астаны', 'Sportura Cup'),
        ('Баскет-лига Астана', 'Astana Hoops')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.activity_id = activities.id
      );
  END IF;
END $$;
