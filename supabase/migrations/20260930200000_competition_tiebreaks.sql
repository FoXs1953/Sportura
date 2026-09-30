CREATE FUNCTION public.competition_head_to_head(aid uuid,rid uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scores AS (SELECT registration_id,points,group_number FROM public.competition_scoreboard(aid)), target AS(SELECT * FROM scores WHERE registration_id=rid)
 SELECT COALESCE(sum(CASE WHEN m.winner_id=rid THEN a.win_points WHEN m.home_score=m.away_score THEN a.draw_points ELSE 0 END),0)::bigint
 FROM public.event_matches m JOIN public.activities a ON a.id=m.activity_id JOIN scores opponent ON opponent.registration_id=CASE WHEN m.home_id=rid THEN m.away_id ELSE m.home_id END CROSS JOIN target t
 WHERE m.activity_id=aid AND rid IN(m.home_id,m.away_id) AND m.home_score IS NOT NULL AND m.stage<>'playoff' AND opponent.points=t.points AND opponent.group_number IS NOT DISTINCT FROM t.group_number;
$$;
REVOKE ALL ON FUNCTION public.competition_head_to_head(uuid,uuid) FROM PUBLIC,anon,authenticated;
DO $patch$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.advanced_competition_round(uuid,boolean,jsonb)'::regprocedure);
 definition:=replace(definition,'PARTITION BY group_number ORDER BY points DESC,difference DESC','PARTITION BY group_number ORDER BY points DESC,public.competition_head_to_head(aid,registration_id) DESC,difference DESC');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.event_competition_sports_base(text,jsonb)'::regprocedure);
 definition:=replace(definition,'ORDER BY points DESC,difference DESC,scored DESC,registration_id LIMIT 1','ORDER BY points DESC,public.competition_head_to_head(aid,registration_id) DESC,difference DESC,scored DESC,registration_id LIMIT 1');
 definition:=replace(definition,'(s.points,s.difference,s.scored)=(SELECT points,difference,scored FROM public.competition_standings(aid) WHERE registration_id=winner)','(s.points,public.competition_head_to_head(aid,s.registration_id),s.difference,s.scored)=(SELECT points,public.competition_head_to_head(aid,registration_id),difference,scored FROM public.competition_standings(aid) WHERE registration_id=winner)');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.event_public_formats_base(uuid,text)'::regprocedure);
 -- This base predates the formats wrapper; its table remains valid for legacy brackets.
 definition:=pg_get_functiondef('public.event_public_extras_base(uuid,text)'::regprocedure);
 definition:=replace(definition,'to_jsonb(s) ORDER BY group_number,points DESC,buchholz DESC,difference DESC,scored DESC,seed','(to_jsonb(s)||jsonb_build_object(''head_to_head'',public.competition_head_to_head(aid,s.registration_id))) ORDER BY group_number,points DESC,CASE WHEN result->''activity''->>''competition_format''=''swiss'' THEN buchholz ELSE public.competition_head_to_head(aid,s.registration_id) END DESC,difference DESC,scored DESC,seed');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.player_progress(uuid)'::regprocedure);
 definition:=replace(definition,'''ratings'',ratings','''matches'',COALESCE((SELECT jsonb_agg(to_jsonb(recent)) FROM (SELECT a.id activity_id,a.title,x.round,x.home_score,x.away_score,x.starts_at,COALESCE(NULLIF(home.team_name,''''),hp.name) home_name,COALESCE(NULLIF(away.team_name,''''),ap.name) away_name FROM public.event_matches x JOIN public.activities a ON a.id=x.activity_id JOIN public.registrations home ON home.id=x.home_id JOIN public.registrations away ON away.id=x.away_id JOIN public.profiles hp ON hp.id=home.user_id JOIN public.profiles ap ON ap.id=away.user_id WHERE uid IN(home.user_id,away.user_id) AND NOT a.is_private AND a.status=''completed'' AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now() AND x.home_score IS NOT NULL ORDER BY a.results_submitted_at DESC,x.round DESC,x.position DESC LIMIT 20) recent),''[]''::jsonb),''ratings'',ratings');
 EXECUTE definition;
END $patch$;
