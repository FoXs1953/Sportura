-- Deterministic recomputation makes result corrections safe: no duplicate awards.
CREATE FUNCTION public.sports_ratings() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ratings jsonb:='{}'; m record; item record; h text; v text; hr numeric; vr numeric; delta integer; outcome numeric; quarter integer; current_quarter integer; hq integer; vq integer; output jsonb:='[]'; value jsonb;
BEGIN
 current_quarter:=extract(year FROM now())::integer*4+extract(quarter FROM now())::integer;
 FOR m IN SELECT x.*,a.discipline_id,a.sport,a.results_submitted_at,r.user_id home_user,s.user_id away_user
 FROM public.event_matches x JOIN public.activities a ON a.id=x.activity_id JOIN public.registrations r ON r.id=x.home_id JOIN public.registrations s ON s.id=x.away_id
 WHERE a.status='completed' AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now() AND NOT a.is_private AND a.discipline_id IS NOT NULL AND x.home_score IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.disputes d WHERE d.activity_id=a.id AND d.status='open')
 ORDER BY a.results_submitted_at,a.id,x.round,x.position,x.id LOOP
  quarter:=extract(year FROM m.results_submitted_at)::integer*4+extract(quarter FROM m.results_submitted_at)::integer;
  h:=m.home_user::text||':'||m.discipline_id;v:=m.away_user::text||':'||m.discipline_id;
  hq:=COALESCE((ratings->h->>'quarter')::integer,quarter);vq:=COALESCE((ratings->v->>'quarter')::integer,quarter);
  hr:=round(1000+(COALESCE((ratings->h->>'rating')::numeric,1000)-1000)*power(0.5,greatest(quarter-hq,0)));
  vr:=round(1000+(COALESCE((ratings->v->>'rating')::numeric,1000)-1000)*power(0.5,greatest(quarter-vq,0)));
  outcome:=CASE WHEN m.winner_id=m.home_id THEN 1 WHEN m.winner_id=m.away_id THEN 0 ELSE 0.5 END;
  delta:=round(32*(outcome-1/(1+power(10,(vr-hr)/400))));
  ratings:=jsonb_set(ratings,ARRAY[h],jsonb_build_object('user_id',m.home_user,'discipline',m.discipline_id,'sport',m.sport,'rating',greatest(0,hr+delta),'quarter',quarter,'matches',COALESCE((ratings->h->>'matches')::integer,0)+1,'wins',COALESCE((ratings->h->>'wins')::integer,0)+CASE WHEN outcome=1 THEN 1 ELSE 0 END));
  ratings:=jsonb_set(ratings,ARRAY[v],jsonb_build_object('user_id',m.away_user,'discipline',m.discipline_id,'sport',m.sport,'rating',greatest(0,vr-delta),'quarter',quarter,'matches',COALESCE((ratings->v->>'matches')::integer,0)+1,'wins',COALESCE((ratings->v->>'wins')::integer,0)+CASE WHEN outcome=0 THEN 1 ELSE 0 END));
 END LOOP;
 FOR item IN SELECT * FROM jsonb_each(ratings) LOOP
  value:=item.value;hr:=round(1000+((value->>'rating')::numeric-1000)*power(0.5,greatest(current_quarter-(value->>'quarter')::integer,0)));
  output:=output||jsonb_build_array(value||jsonb_build_object('rating',hr,'rank',CASE WHEN hr<1100 THEN 'Rookie' WHEN hr<1300 THEN 'Contender' WHEN hr<1600 THEN 'Pro' WHEN hr<1900 THEN 'Elite' ELSE 'Legend' END));
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.sports_ratings() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.player_progress(uid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ratings jsonb; medals jsonb:='[]'; wins integer; streak integer; reliable integer; info jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND account_status='active') THEN RETURN NULL; END IF;
 IF uid IS DISTINCT FROM auth.uid() AND NOT COALESCE((SELECT (privacy->>'stats')::boolean FROM public.profile_preferences WHERE user_id=uid),true) THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(r ORDER BY r->>'sport'),'[]') INTO ratings FROM jsonb_array_elements(public.sports_ratings()) r WHERE r->>'user_id'=uid::text;
 SELECT count(*) INTO wins FROM public.results r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=uid AND r.placement=1 AND a.status='completed' AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now() AND NOT a.is_private AND NOT EXISTS(SELECT 1 FROM public.disputes d WHERE d.activity_id=a.id AND d.status='open');
 WITH games AS (SELECT row_number() OVER(ORDER BY a.results_submitted_at DESC,a.id DESC) pos,EXISTS(SELECT 1 FROM public.results r WHERE r.activity_id=a.id AND r.user_id=uid AND r.placement=1) won FROM public.activities a JOIN public.registrations reg ON reg.activity_id=a.id WHERE reg.user_id=uid AND reg.status IN ('registered','attended') AND a.type<>'daily_game' AND a.status='completed' AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now() AND NOT a.is_private AND NOT EXISTS(SELECT 1 FROM public.disputes d WHERE d.activity_id=a.id AND d.status='open')) SELECT COALESCE(min(pos) FILTER(WHERE NOT won)-1,count(*)) INTO streak FROM games;
 SELECT count(*) INTO reliable FROM public.registrations r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=uid AND r.status='attended' AND a.type<>'daily_game' AND a.status='completed' AND NOT a.is_private AND r.created_at>COALESCE((SELECT max(q.created_at) FROM public.registrations q WHERE q.user_id=uid AND q.status='no_show'),'epoch');
 IF wins>0 THEN medals:=medals||'[{"id":"first_win","name":"Первая победа"}]'; END IF;
 IF streak>=3 THEN medals:=medals||'[{"id":"win_streak","name":"Три победы подряд"}]'; END IF;
 IF reliable>=10 THEN medals:=medals||'[{"id":"iron","name":"Железный: 10 турниров без неявок"}]'; END IF;
 IF EXISTS(SELECT 1 FROM public.registrations r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=uid AND r.status='attended' AND a.status='completed' AND a.tier::text='marathon' AND NOT a.is_private AND a.dispute_window_ends_at<=now()) THEN medals:=medals||'[{"id":"marathon","name":"Финишер Marathon"}]'; END IF;
 IF EXISTS(SELECT 1 FROM public.results r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=uid AND r.placement=1 AND a.status='completed' AND a.tier::text='major' AND NOT a.is_private AND a.dispute_window_ends_at<=now()) THEN medals:=medals||'[{"id":"major","name":"Чемпион Major"}]'; END IF;
 SELECT jsonb_build_object('reliability',p.reliability_rating,'season',to_char(now(),'YYYY')||' · '||extract(quarter FROM now())||' квартал','ratings',ratings,'badges',medals,'tournament_wins',wins,'win_streak',streak) INTO info FROM public.profiles p WHERE id=uid;
 RETURN info;
END $$;
REVOKE ALL ON FUNCTION public.player_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_progress(uuid) TO anon,authenticated,service_role;
ALTER FUNCTION public.public_player_profile(uuid) RENAME TO public_player_profile_progress_base;
REVOKE ALL ON FUNCTION public.public_player_profile_progress_base(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.public_player_profile(_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.public_player_profile_progress_base(_id)||jsonb_build_object('progress',public.player_progress(_id));
$$;
REVOKE ALL ON FUNCTION public.public_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_player_profile(uuid) TO anon,authenticated,service_role;
ALTER FUNCTION public.profile_workspace(text,jsonb) RENAME TO profile_workspace_progress_base;
REVOKE ALL ON FUNCTION public.profile_workspace_progress_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.profile_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.profile_workspace_progress_base(action,payload);
 IF action='get' THEN result:=result||jsonb_build_object('progress',public.player_progress(auth.uid())); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.profile_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_workspace(text,jsonb) TO authenticated;
DO $seed$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.advanced_competition_round(uuid,boolean,jsonb)'::regprocedure);
 definition:=replace(definition,'ELSIF seed_mode=''manual'' THEN','ELSIF seed_mode=''rating'' THEN
   SELECT array_agg(reg.id ORDER BY COALESCE((rating->>''rating'')::numeric,1000) DESC,reg.created_at,reg.id) INTO ids FROM public.registrations reg LEFT JOIN jsonb_array_elements(public.sports_ratings()) rating ON rating->>''user_id''=reg.user_id::text AND rating->>''discipline''=a.discipline_id WHERE reg.id=ANY(ids);
  ELSIF seed_mode=''manual'' THEN');
 EXECUTE definition;
END $seed$;
