ALTER FUNCTION public.event_competition(text,jsonb) RENAME TO event_competition_calendar_base;
REVOKE ALL ON FUNCTION public.event_competition_calendar_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid:=(payload->>'activity_id')::uuid;a public.activities;first_start timestamptz;starts timestamptz;minutes integer;gap integer;perday integer;number integer:=0;m record;u record;
BEGIN
 IF action<>'schedule' THEN RETURN public.event_competition_calendar_base(action,payload); END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF a.id IS NULL OR NOT(public.is_activity_host(aid,auth.uid()) OR public.is_admin()) THEN RAISE EXCEPTION 'Соревнование недоступно'; END IF;
 IF a.status IN ('cancelled','completed') THEN RAISE EXCEPTION 'Соревнование завершено'; END IF;
 first_start:=(payload->>'starts_at')::timestamptz;minutes:=(payload->>'minutes')::integer;gap:=(payload->>'gap')::integer;perday:=(payload->>'per_day')::integer;
 IF first_start IS NULL OR minutes IS NULL OR minutes NOT BETWEEN 5 AND 600 OR gap IS NULL OR gap NOT BETWEEN 0 AND 120 OR perday IS NULL OR perday NOT BETWEEN 1 AND 32 OR perday*(minutes+gap)>1440 THEN RAISE EXCEPTION 'Проверьте начало, длительность и число матчей в день'; END IF;
 FOR m IN SELECT * FROM public.event_matches WHERE activity_id=aid AND home_score IS NULL AND starts_at IS NULL ORDER BY round,position FOR UPDATE LOOP
  starts:=first_start+make_interval(days=>number/perday,mins=>(number%perday)*(minutes+gap));
  IF starts<a.date_time OR starts+make_interval(mins=>minutes)>a.date_time+make_interval(mins=>a.duration_minutes) THEN RAISE EXCEPTION 'Матчи выходят за время события. Увеличьте длительность события или число матчей в день'; END IF;
  IF EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND x.id<>m.id AND x.starts_at IS NOT NULL AND (x.home_id IN(m.home_id,m.away_id) OR x.away_id IN(m.home_id,m.away_id) OR x.location=a.location_text) AND tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.duration_minutes),'[)') && tstzrange(starts,starts+make_interval(mins=>minutes),'[)')) THEN RAISE EXCEPTION 'Время пересекается с назначенным матчем'; END IF;
  UPDATE public.event_matches SET starts_at=starts,duration_minutes=minutes,location=a.location_text WHERE id=m.id;
  number:=number+1;
 END LOOP;
 IF number=0 THEN RAISE EXCEPTION 'Нет матчей без назначенного времени'; END IF;
 PERFORM public.event_log(aid,NULL,'Опубликовано расписание',jsonb_build_object('matches',number,'start',first_start));
 FOR u IN SELECT user_id FROM public.registrations WHERE activity_id=aid AND status IN ('registered','attended') LOOP
  PERFORM public.profile_notify(u.user_id,'games','Расписание опубликовано',a.title||': проверьте время матчей.','/activity/'||aid,'schedule:'||aid||':'||gen_random_uuid());
 END LOOP;
 RETURN jsonb_build_object('ok',true,'scheduled',number);
END $$;
REVOKE ALL ON FUNCTION public.event_competition(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_competition(text,jsonb) TO authenticated;
