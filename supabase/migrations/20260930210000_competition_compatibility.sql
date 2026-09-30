-- Bring existing single-elimination and round-robin schedules into the seeded engine.
-- Match identities, scores and user registrations are preserved.
INSERT INTO public.event_seeds(activity_id,registration_id,seed,group_number,qualified)
SELECT r.activity_id,r.id,row_number() OVER(PARTITION BY r.activity_id ORDER BY r.created_at,r.id),CASE WHEN a.competition_format='round_robin' THEN 1 END,a.competition_format='single_elimination'
FROM public.registrations r JOIN public.activities a ON a.id=r.activity_id
WHERE a.competition_format IN ('single_elimination','round_robin')
AND EXISTS(SELECT 1 FROM public.event_matches m WHERE m.activity_id=a.id)
AND NOT EXISTS(SELECT 1 FROM public.event_seeds s WHERE s.activity_id=a.id)
AND (r.status IN ('registered','attended') OR EXISTS(SELECT 1 FROM public.event_matches m WHERE m.activity_id=a.id AND r.id IN(m.home_id,m.away_id)));
UPDATE public.event_matches m SET stage='playoff' FROM public.activities a WHERE a.id=m.activity_id AND a.competition_format='single_elimination' AND m.stage='main';
DO $patch$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.sports_ratings()'::regprocedure);
 definition:=replace(definition,'extract(year FROM now())','extract(year FROM now() AT TIME ZONE ''Asia/Almaty'')');
 definition:=replace(definition,'extract(quarter FROM now())','extract(quarter FROM now() AT TIME ZONE ''Asia/Almaty'')');
 definition:=replace(definition,'extract(year FROM m.results_submitted_at)','extract(year FROM m.results_submitted_at AT TIME ZONE ''Asia/Almaty'')');
 definition:=replace(definition,'extract(quarter FROM m.results_submitted_at)','extract(quarter FROM m.results_submitted_at AT TIME ZONE ''Asia/Almaty'')');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.player_progress(uuid)'::regprocedure);
 definition:=replace(definition,'to_char(now(),''YYYY'')','to_char(now() AT TIME ZONE ''Asia/Almaty'',''YYYY'')');
 definition:=replace(definition,'extract(quarter FROM now())','extract(quarter FROM now() AT TIME ZONE ''Asia/Almaty'')');
 EXECUTE definition;
END $patch$;
