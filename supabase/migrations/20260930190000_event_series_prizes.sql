ALTER TABLE public.activities ADD COLUMN event_extras jsonb NOT NULL DEFAULT '{}',ADD COLUMN weather_original_start timestamptz;
CREATE TABLE public.event_item_prizes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES public.activities(id),name text NOT NULL CHECK(length(name) BETWEEN 2 AND 160),sponsor text NOT NULL DEFAULT '',registration_id uuid REFERENCES public.registrations(id),delivered_at timestamptz,note text NOT NULL DEFAULT '');
ALTER TABLE public.event_item_prizes ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.validate_event_extras() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.event_extras=OLD.event_extras THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.event_extras)<>'object' OR length(NEW.event_extras::text)>3000 OR COALESCE(NEW.event_extras->>'series','open') NOT IN ('open','friday_blitz','weekend_marathon','monday_spark','astana_open','rookie_cup','last_chance','major','sponsor_cup','club_clash') THEN RAISE EXCEPTION 'Проверьте серию турнира'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=OLD.id) THEN RAISE EXCEPTION 'Серия и условия отбора зафиксированы после регистрации'; END IF;
 IF NEW.event_extras->>'series' IN ('major','sponsor_cup','club_clash') AND public.organizer_trust(COALESCE(NEW.organizer_id,NEW.manager_id))->>'level'<>'partner' THEN RAISE EXCEPTION 'Эта серия доступна организаторам-партнёрам'; END IF;
 IF NEW.event_extras->>'series'='rookie_cup' AND COALESCE((NEW.event_extras->>'rating_limit')::integer,1100) NOT BETWEEN 1000 AND 1900 THEN RAISE EXCEPTION 'Порог рейтинга: от 1000 до 1900'; END IF;
 IF NULLIF(NEW.event_extras->>'qualifier_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.activities WHERE id=(NEW.event_extras->>'qualifier_id')::uuid AND status='completed' AND NOT is_private AND discipline_id=NEW.discipline_id AND results_submitted_at IS NOT NULL AND dispute_window_ends_at<=now()) THEN RAISE EXCEPTION 'Выберите завершённый отборочный турнир той же дисциплины'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_event_extras BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.validate_event_extras();
CREATE FUNCTION public.guard_series_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities;rating numeric;
BEGIN
 IF TG_OP='UPDATE' AND NOT(NEW.status='registered' AND OLD.status IN ('cancelled','rejected')) THEN RETURN NEW; END IF;
 SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id;
 IF a.event_extras->>'series'='rookie_cup' THEN
  SELECT (r->>'rating')::numeric INTO rating FROM jsonb_array_elements(public.sports_ratings()) r WHERE r->>'user_id'=NEW.user_id::text AND r->>'discipline'=a.discipline_id;
  IF COALESCE(rating,1000)>COALESCE((a.event_extras->>'rating_limit')::integer,1100) THEN RAISE EXCEPTION 'Ваш рейтинг выше лимита Rookie Cup'; END IF;
 END IF;
 IF NULLIF(a.event_extras->>'qualifier_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.results WHERE activity_id=(a.event_extras->>'qualifier_id')::uuid AND user_id=NEW.user_id AND placement<=4) THEN RAISE EXCEPTION 'Участие доступно призёрам отборочного турнира (места 1–4)'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER series_entry BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_series_entry();
ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_extras_base;
REVOKE ALL ON FUNCTION public.event_workspace_extras_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;extras jsonb;
BEGIN
 IF action='publish' THEN SELECT data->'event_extras' INTO extras FROM public.host_documents WHERE id=(payload->>'id')::uuid AND user_id=auth.uid(); END IF;
 result:=public.event_workspace_extras_base(action,payload);
 IF action='publish' AND extras IS NOT NULL THEN UPDATE public.activities SET event_extras=extras WHERE id=(result->>'id')::uuid; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
ALTER FUNCTION public.event_competition(text,jsonb) RENAME TO event_competition_extras_base;
REVOKE ALL ON FUNCTION public.event_competition_extras_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid:=(payload->>'activity_id')::uuid;a public.activities;p public.event_item_prizes;rid uuid:=NULLIF(payload->>'registration_id','')::uuid;next_start timestamptz;delta interval;
BEGIN
 IF action NOT IN ('prize_add','prize_award','prize_deliver','weather') THEN RETURN public.event_competition_extras_base(action,payload); END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF a.id IS NULL OR NOT(public.is_activity_host(aid,auth.uid()) OR public.is_admin()) THEN RAISE EXCEPTION 'Событие недоступно'; END IF;
 IF action='weather' THEN
  next_start:=(payload->>'starts_at')::timestamptz;delta:=next_start-a.date_time;
  IF a.venue_type<>'outdoor' OR a.status IN ('completed','cancelled') OR next_start IS NULL OR next_start<=now() OR delta<=interval '0' OR next_start-COALESCE(a.weather_original_start,a.date_time)>interval '48 hours' OR length(trim(COALESCE(payload->>'reason','')))<10 OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL) THEN RAISE EXCEPTION 'Перенос из-за погоды: до 48 часов, до первого результата, с указанием причины. Иначе отмените событие'; END IF;
  UPDATE public.activities SET weather_original_start=COALESCE(weather_original_start,date_time),date_time=next_start,registration_deadline=CASE WHEN registration_deadline>now() THEN registration_deadline+delta ELSE registration_deadline END WHERE id=aid;
  UPDATE public.event_matches SET starts_at=starts_at+delta WHERE activity_id=aid AND starts_at IS NOT NULL;
  PERFORM public.event_log(aid,NULL,'Перенос из-за погоды',jsonb_build_object('reason',payload->>'reason','new_start',next_start));
 ELSIF action='prize_add' THEN
  IF a.status IN ('completed','cancelled') OR EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=aid) THEN RAISE EXCEPTION 'Добавьте призы до регистрации участников'; END IF;
  IF (SELECT count(*) FROM public.event_item_prizes WHERE activity_id=aid)>=20 THEN RAISE EXCEPTION 'Можно добавить до 20 призов'; END IF;
  INSERT INTO public.event_item_prizes(activity_id,name,sponsor) VALUES(aid,trim(payload->>'name'),left(trim(COALESCE(payload->>'sponsor','')),120));
 ELSE
  SELECT * INTO p FROM public.event_item_prizes WHERE id=(payload->>'id')::uuid AND activity_id=aid FOR UPDATE;
  IF p.id IS NULL OR p.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'Приз недоступен или уже выдан'; END IF;
  IF a.results_submitted_at IS NULL OR a.dispute_window_ends_at IS NULL OR a.dispute_window_ends_at>now() OR EXISTS(SELECT 1 FROM public.disputes WHERE activity_id=aid AND status='open') THEN RAISE EXCEPTION 'Дождитесь итогов и закрытия споров'; END IF;
  IF action='prize_award' THEN
   IF NOT EXISTS(SELECT 1 FROM public.registrations WHERE id=rid AND activity_id=aid AND status IN ('registered','attended')) THEN RAISE EXCEPTION 'Выберите участника этого турнира'; END IF;
   UPDATE public.event_item_prizes SET registration_id=rid WHERE id=p.id;
  ELSE
   IF p.registration_id IS NULL OR length(trim(COALESCE(payload->>'note','')))<3 THEN RAISE EXCEPTION 'Выберите получателя и укажите примечание о выдаче'; END IF;
   UPDATE public.event_item_prizes SET delivered_at=now(),note=left(payload->>'note',500) WHERE id=p.id;
  END IF;
  PERFORM public.event_log(aid,NULL,'Обновлён вещевой приз',jsonb_build_object('prize',p.id,'action',action));
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.event_competition(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_competition(text,jsonb) TO authenticated;
ALTER FUNCTION public.event_public(uuid,text) RENAME TO event_public_extras_base;
REVOKE ALL ON FUNCTION public.event_public_extras_base(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_public(aid uuid,code text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.event_public_extras_base(aid,code);
 IF result IS NULL THEN RETURN NULL; END IF;
 RETURN result||jsonb_build_object('item_prizes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sponsor',p.sponsor,'registration_id',p.registration_id,'recipient',COALESCE(NULLIF(r.team_name,''),u.name),'delivered_at',p.delivered_at) ORDER BY p.id) FROM public.event_item_prizes p LEFT JOIN public.registrations r ON r.id=p.registration_id LEFT JOIN public.profiles u ON u.id=r.user_id WHERE p.activity_id=aid),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.event_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public(uuid,text) TO anon,authenticated;
DO $badge$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.player_progress(uuid)'::regprocedure);
 definition:=replace(definition,'a.tier::text=''major''','a.event_extras->>''series''=''major''');
 EXECUTE definition;
END $badge$;
ALTER TABLE public.profile_preferences ADD COLUMN host_contact text NOT NULL DEFAULT '' CHECK(length(host_contact)<=120);
DO $contact$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.profile_workspace_v1(text,jsonb)'::regprocedure);
 definition:=replace(definition,'SET host_name=', 'SET host_contact=CASE WHEN COALESCE(payload->>''host_contact'','''') ~ ''^https://t[.]me/[A-Za-z0-9_]{5,32}$'' THEN payload->>''host_contact'' ELSE '''' END,host_name=');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.public_player_profile_progress_base(uuid)'::regprocedure);
 definition:=replace(definition,'''host_name'',COALESCE(s.host_name,'''')','''host_contact'',COALESCE(s.host_contact,''''),''host_name'',COALESCE(s.host_name,'''')');
 EXECUTE definition;
END $contact$;
