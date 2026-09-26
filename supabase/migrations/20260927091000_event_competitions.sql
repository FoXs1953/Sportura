CREATE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=(payload->>'activity_id')::uuid; a public.activities; m public.event_matches; ids uuid[]; i integer; j integer; n integer; roundno integer; pos integer; winner uuid; reason text:=trim(COALESCE(payload->>'reason','')); item record; r public.registrations; starts timestamptz; duration integer; result jsonb;
BEGIN
 IF u IS NULL OR NOT(public.is_activity_host(aid,u) OR public.is_admin()) THEN RAISE EXCEPTION 'Соревнование недоступно'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF a.type='daily_game' OR a.status='cancelled' THEN RAISE EXCEPTION 'Это не действующее соревнование'; END IF;
 IF action='generate' THEN
  IF EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Расписание уже создано'; END IF;
  SELECT array_agg(id ORDER BY created_at,id) INTO ids FROM public.registrations WHERE activity_id=aid AND status IN ('registered','attended');
  n:=cardinality(ids);
  IF n IS NULL OR n<2 OR n>32 THEN RAISE EXCEPTION 'Для сетки нужно от 2 до 32 команд или участников'; END IF;
  IF a.type='league' THEN
   pos:=0;
   FOR i IN 1..n-1 LOOP FOR j IN i+1..n LOOP pos:=pos+1; INSERT INTO public.event_matches(activity_id,round,position,home_id,away_id) VALUES(aid,1,pos,ids[i],ids[j]); END LOOP; END LOOP;
  ELSE
   -- Non-power-of-two draws have explicit byes: pair the excess first, then add bye entrants in the next round.
   i:=1; pos:=0;
   WHILE i<n LOOP pos:=pos+1; INSERT INTO public.event_matches(activity_id,round,position,home_id,away_id) VALUES(aid,1,pos,ids[i],ids[i+1]); i:=i+2; END LOOP;
  END IF;
  UPDATE public.activities SET registration_deadline=now() WHERE id=aid;
  PERFORM public.event_log(aid,NULL,'Расписание создано');
 ELSIF action='advance' THEN
  IF a.type<>'tournament' THEN RAISE EXCEPTION 'Следующий раунд доступен для турнира'; END IF;
  SELECT max(round) INTO roundno FROM public.event_matches WHERE activity_id=aid;
  IF roundno IS NULL OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND round=roundno AND winner_id IS NULL) THEN RAISE EXCEPTION 'Сначала заполните результаты всех матчей раунда'; END IF;
  -- Winners plus entrants with a bye (not yet eliminated and not in that round).
  SELECT array_agg(r.id ORDER BY r.created_at,r.id) INTO ids FROM public.registrations r WHERE r.activity_id=aid AND r.status IN ('registered','attended') AND NOT EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND (x.home_id=r.id OR x.away_id=r.id) AND x.winner_id IS NOT NULL AND x.winner_id<>r.id);
  n:=cardinality(ids); IF n IS NULL OR n<2 THEN RAISE EXCEPTION 'Победитель уже определён'; END IF;
  i:=1;pos:=0; WHILE i<n LOOP pos:=pos+1; INSERT INTO public.event_matches(activity_id,round,position,home_id,away_id) VALUES(aid,roundno+1,pos,ids[i],ids[i+1]);i:=i+2;END LOOP;
  PERFORM public.event_log(aid,NULL,'Создан следующий раунд',jsonb_build_object('round',roundno+1));
 ELSIF action='match' THEN
  SELECT * INTO m FROM public.event_matches WHERE id=(payload->>'id')::uuid AND activity_id=aid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Матч не найден'; END IF;
  IF EXISTS(SELECT 1 FROM public.results WHERE activity_id=aid AND paid_out) THEN RAISE EXCEPTION 'После выплаты изменение рассматривает поддержка'; END IF;
  IF (m.home_score IS NOT NULL OR a.results_submitted_at IS NOT NULL) AND length(reason)<3 THEN RAISE EXCEPTION 'Укажите причину исправления'; END IF;
  IF a.type='tournament' AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND round>m.round) AND ((payload->>'home_score')::integer IS DISTINCT FROM m.home_score OR (payload->>'away_score')::integer IS DISTINCT FROM m.away_score) THEN RAISE EXCEPTION 'Результат связан со следующим раундом. Исправление требует обращения в поддержку'; END IF;
  starts:=NULLIF(payload->>'starts_at','')::timestamptz;duration:=COALESCE((payload->>'duration_minutes')::integer,60);
  IF duration NOT BETWEEN 5 AND 600 THEN RAISE EXCEPTION 'Проверьте длительность матча'; END IF;
  IF starts IS NOT NULL AND EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND x.id<>m.id AND x.starts_at IS NOT NULL AND (x.home_id IN (m.home_id,m.away_id) OR x.away_id IN (m.home_id,m.away_id) OR (length(trim(COALESCE(payload->>'location','')))>0 AND x.location=payload->>'location')) AND tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.duration_minutes),'[)') && tstzrange(starts,starts+make_interval(mins=>duration),'[)')) THEN RAISE EXCEPTION 'Команда или площадка уже занята в это время'; END IF;
  winner:=CASE WHEN (payload->>'home_score')::integer>(payload->>'away_score')::integer THEN m.home_id WHEN (payload->>'away_score')::integer>(payload->>'home_score')::integer THEN m.away_id ELSE CASE WHEN a.type='tournament' AND payload->>'home_score' IS NOT NULL THEN NULLIF(payload->>'winner_id','')::uuid END END;
  IF winner IS NOT NULL AND winner NOT IN (m.home_id,m.away_id) THEN RAISE EXCEPTION 'Победитель не участвует в матче'; END IF;
  IF a.type='tournament' AND payload->>'home_score' IS NOT NULL AND winner IS NULL THEN RAISE EXCEPTION 'При равном счёте выберите победителя по дополнительному правилу'; END IF;
  UPDATE public.event_matches SET starts_at=starts,duration_minutes=duration,location=left(COALESCE(payload->>'location',''),200),home_score=(payload->>'home_score')::integer,away_score=(payload->>'away_score')::integer,winner_id=winner,updated_at=now() WHERE id=m.id;
  -- Published results must be explicitly republished after corrections.
  IF a.results_submitted_at IS NOT NULL THEN UPDATE public.activities SET results_submitted_at=NULL WHERE id=aid; END IF;
  PERFORM public.event_log(aid,NULL,'Матч изменён',jsonb_build_object('match',m.id,'home_score',payload->'home_score','away_score',payload->'away_score','reason',reason));
 ELSIF action='publish_results' THEN
  IF a.results_submitted_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  IF a.date_time>now() THEN RAISE EXCEPTION 'Соревнование ещё не началось'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND home_score IS NULL) THEN RAISE EXCEPTION 'Заполните все результаты'; END IF;
  IF a.type='tournament' THEN
   SELECT array_agg(r.id) INTO ids FROM public.registrations r WHERE r.activity_id=aid AND r.status IN ('registered','attended') AND NOT EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND (x.home_id=r.id OR x.away_id=r.id) AND x.winner_id IS NOT NULL AND x.winner_id<>r.id);
   IF cardinality(ids)<>1 THEN RAISE EXCEPTION 'Сначала проведите оставшиеся раунды'; END IF;
   winner:=ids[1];
  ELSE
   SELECT registration_id INTO winner FROM public.competition_standings(aid) ORDER BY points DESC,difference DESC,scored DESC,registration_id LIMIT 1;
   -- A tie for first place requires an explicit choice justified by the published regulations.
   SELECT count(*) INTO n FROM public.competition_standings(aid) s WHERE (s.points,s.difference,s.scored)=(SELECT points,difference,scored FROM public.competition_standings(aid) WHERE registration_id=winner);
   IF n>1 THEN
    IF length(reason)<3 OR NOT EXISTS(SELECT 1 FROM public.competition_standings(aid) s WHERE s.registration_id=NULLIF(payload->>'winner_id','')::uuid AND (s.points,s.difference,s.scored)=(SELECT points,difference,scored FROM public.competition_standings(aid) WHERE registration_id=winner)) THEN RAISE EXCEPTION 'Равенство показателей: выберите победителя по регламенту и укажите основание'; END IF;
    winner:=(payload->>'winner_id')::uuid;
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.results WHERE activity_id=aid AND paid_out) THEN RAISE EXCEPTION 'После выплаты изменение итогов рассматривает поддержка'; END IF;
  SELECT * INTO r FROM public.registrations WHERE id=winner;
  DELETE FROM public.results WHERE activity_id=aid;
  INSERT INTO public.results(activity_id,user_id,participant_name,placement,prize_amount) SELECT aid,r.user_id,COALESCE(NULLIF(r.team_name,''),(SELECT name FROM public.profiles WHERE id=r.user_id)),1,COALESCE(sum(COALESCE(amount_due,0)) FILTER(WHERE payment_status='paid' AND status NOT IN ('cancelled','rejected')),0)*(1-a.commission_percent/100) FROM public.registrations WHERE activity_id=aid;
  UPDATE public.activities SET status='completed',results_submitted_at=now(),dispute_window_ends_at=now()+interval '48 hours' WHERE id=aid;
  PERFORM public.event_log(aid,NULL,'Опубликованы результаты',jsonb_build_object('winner',winner,'reason',reason));
 ELSIF action='payout' THEN
  IF a.results_submitted_at IS NULL OR a.dispute_window_ends_at IS NULL OR a.dispute_window_ends_at>now() OR EXISTS(SELECT 1 FROM public.disputes WHERE activity_id=aid AND status='open') OR EXISTS(SELECT 1 FROM public.support_tickets WHERE activity_id=aid AND status<>'resolved') THEN RAISE EXCEPTION 'Дождитесь окончания окна споров и решения открытых споров'; END IF;
  IF length(trim(COALESCE(payload->>'reference','')))<3 THEN RAISE EXCEPTION 'Укажите подтверждение перевода'; END IF;
  UPDATE public.results SET paid_out=true,payout_reference=left(payload->>'reference',200) WHERE activity_id=aid AND id=(payload->>'id')::uuid AND NOT paid_out;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true); END IF;
  PERFORM public.event_log(aid,NULL,'Выплата приза подтверждена');
 ELSE RAISE EXCEPTION 'Неизвестное действие'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
-- League scoring is deterministic; head-to-head or a playoff can be used only via an explicit published rule.
CREATE FUNCTION public.competition_standings(aid uuid) RETURNS TABLE(registration_id uuid,name text,played bigint,won bigint,drawn bigint,lost bigint,scored bigint,conceded bigint,difference bigint,points bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scores AS (
 SELECT home_id id,home_score scored,away_score conceded FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL
 UNION ALL SELECT away_id,away_score,home_score FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL)
 SELECT r.id,COALESCE(NULLIF(r.team_name,''),p.name),count(s.id),count(s.id) FILTER(WHERE s.scored>s.conceded),count(s.id) FILTER(WHERE s.scored=s.conceded),count(s.id) FILTER(WHERE s.scored<s.conceded),COALESCE(sum(s.scored),0),COALESCE(sum(s.conceded),0),COALESCE(sum(s.scored-s.conceded),0),COALESCE(sum(CASE WHEN s.scored>s.conceded THEN a.win_points WHEN s.scored=s.conceded THEN a.draw_points ELSE 0 END),0)
 FROM public.registrations r JOIN public.profiles p ON p.id=r.user_id JOIN public.activities a ON a.id=r.activity_id LEFT JOIN scores s ON s.id=r.id WHERE r.activity_id=aid AND r.status IN ('registered','attended') GROUP BY r.id,p.name;
$$;
REVOKE ALL ON FUNCTION public.competition_standings(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.event_competition(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_competition(text,jsonb) TO authenticated;

CREATE FUNCTION public.event_public(aid uuid,code text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; result jsonb;
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=aid;
 IF NOT FOUND OR (a.is_private AND NOT(COALESCE(a.invite_code=code,false) OR COALESCE(public.is_activity_host(aid,auth.uid()),false) OR EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=aid AND user_id=auth.uid()))) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('activity',to_jsonb(a)-'invite_code','matches',COALESCE((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('home_name',COALESCE(NULLIF(h.team_name,''),hp.name),'away_name',COALESCE(NULLIF(w.team_name,''),wp.name)) ORDER BY m.round,m.position) FROM public.event_matches m JOIN public.registrations h ON h.id=m.home_id JOIN public.profiles hp ON hp.id=h.user_id JOIN public.registrations w ON w.id=m.away_id JOIN public.profiles wp ON wp.id=w.user_id WHERE m.activity_id=aid),'[]'),'standings',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.points DESC,s.difference DESC,s.scored DESC) FROM public.competition_standings(aid) s),'[]'),'results',COALESCE((SELECT jsonb_agg(to_jsonb(r)-'payout_reference'-'user_id' ORDER BY placement) FROM public.results r WHERE activity_id=aid AND a.results_submitted_at IS NOT NULL),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.event_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public(uuid,text) TO anon,authenticated;
