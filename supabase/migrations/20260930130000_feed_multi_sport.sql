-- Extend the existing discovery query without changing permissions or pagination.
DO $migration$
DECLARE definition text := pg_get_functiondef('public.event_feed(jsonb,integer)'::regprocedure);
  old_sport text := $old$AND (COALESCE(filters->>'sport','all')='all' OR a.sport=filters->>'sport')$old$;
  new_sport text := $new$AND (CASE WHEN jsonb_typeof(filters->'sport')='array'
    THEN filters->'sport'='[]'::jsonb OR (filters->'sport') ? a.sport
    ELSE COALESCE(filters->>'sport','all')='all' OR a.sport=filters->>'sport' END)$new$;
BEGIN
  IF position(old_sport IN definition)=0 OR position($old$'page',page)$old$ IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected event_feed definition; review before applying';
  END IF;
  definition := replace(definition,old_sport,new_sport);
  definition := replace(definition,$old$'page',page)$old$,$new$'page',page,'districts',COALESCE((SELECT jsonb_agg(d.district ORDER BY d.district) FROM
    (SELECT DISTINCT district FROM public.activities WHERE NOT is_private AND NULLIF(trim(district),'') IS NOT NULL
     AND (COALESCE(filters->>'city','all')='all' OR city=filters->>'city')) d),'[]'::jsonb))$new$);
  EXECUTE definition;
END $migration$;
