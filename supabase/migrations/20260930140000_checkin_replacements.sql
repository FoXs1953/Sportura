-- A host confirms a physically present waiter after check-in closes.
-- The private ledger authorizes one atomic replacement, never a general late join.
CREATE TABLE public.event_checkin_closures (
 activity_id uuid PRIMARY KEY REFERENCES public.activities(id), closed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.event_replacements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES public.activities(id),
 absent_registration_id uuid NOT NULL UNIQUE REFERENCES public.registrations(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id), actor_id uuid NOT NULL REFERENCES public.profiles(id),
 registration_id uuid REFERENCES public.registrations(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_checkin_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_replacements ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.replacement_pending(aid uuid,uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.event_replacements r WHERE r.activity_id=aid AND r.user_id=uid
  AND r.actor_id=auth.uid() AND r.registration_id IS NULL AND r.created_at=now())
$$;
REVOKE ALL ON FUNCTION public.replacement_pending(uuid,uuid) FROM PUBLIC,anon,authenticated;

DO $patch$
DECLARE definition text; fn text;
BEGIN
 -- No-shows retain their historical records but no longer occupy a playing spot.
 FOREACH fn IN ARRAY ARRAY['guard_activity_capacity','sync_activity_counts','event_activity_guard','guard_waitlist_capacity'] LOOP
  definition:=pg_get_functiondef(('public.'||fn||'()')::regprocedure);
  IF position('''cancelled'',''rejected''' IN definition)=0 THEN RAISE EXCEPTION 'Review capacity function %',fn; END IF;
  definition:=replace(definition,'''cancelled'',''rejected''','''cancelled'',''rejected'',''no_show''');
  IF fn='guard_activity_capacity' THEN
   -- Keep no-show reactivation protected; only cancelled/rejected records can rejoin.
   definition:=replace(definition,'OLD.status IN (''cancelled'',''rejected'',''no_show'')','OLD.status IN (''cancelled'',''rejected'')');
   definition:=replace(definition,'IF a.status IN (''cancelled'',''completed'') OR a.date_time<=now() OR a.registration_deadline<=now() OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=a.id) THEN',
    'IF NOT public.replacement_pending(NEW.activity_id,NEW.user_id) AND (a.status IN (''cancelled'',''completed'') OR a.date_time<=now() OR a.registration_deadline<=now() OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=a.id)) THEN');
  END IF;
  EXECUTE definition;
 END LOOP;
 definition:=pg_get_functiondef('public.guard_roster_checkin()'::regprocedure);
 definition:=replace(definition,'OR now()>a.date_time+interval ''30 minutes''','OR (now()>a.date_time+interval ''30 minutes'' AND NOT public.replacement_pending(NEW.activity_id,NEW.user_id))');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.guard_waitlist_order()'::regprocedure);
 definition:=replace(definition,'PERFORM public.notify_waitlist(NEW.activity_id);','IF public.replacement_pending(NEW.activity_id,NEW.user_id) THEN RETURN NEW; END IF; PERFORM public.notify_waitlist(NEW.activity_id);');
 EXECUTE definition;
END $patch$;
-- A replaced no-show cannot be reinstated over the replacement's occupied spot.
CREATE FUNCTION public.guard_replaced_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities;
BEGIN
 IF OLD.status IN ('no_show','cancelled','rejected') AND NEW.status IN ('registered','attended') THEN
  SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id FOR UPDATE;
  IF (SELECT count(*) FROM public.registrations WHERE activity_id=NEW.activity_id AND status IN ('registered','attended') AND id<>NEW.id)>=a.max_participants THEN RAISE EXCEPTION 'Мест больше нет'; END IF;
 END IF;
 IF NEW.status IN ('registered','attended') AND OLD.status NOT IN ('registered','attended') AND EXISTS(
  SELECT 1 FROM public.event_replacements WHERE absent_registration_id=OLD.id) THEN
  RAISE EXCEPTION 'Место передано участнику очереди. Исправление посещаемости требует обращения в поддержку';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_replaced_registration() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_replaced_registration BEFORE UPDATE ON public.registrations
 FOR EACH ROW EXECUTE FUNCTION public.guard_replaced_registration();

ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_replacement_base;
REVOKE ALL ON FUNCTION public.event_workspace_replacement_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=NULLIF(payload->>'activity_id','')::uuid; a public.activities;
 w public.event_waitlist; absent_id uuid; rid uuid; ledger_id uuid; result jsonb;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 IF action IN ('replace_no_show','skip_waiter') THEN
  SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_activity_host(aid,u) THEN RAISE EXCEPTION 'Только организатор события может выполнить замену'; END IF;
  IF a.date_time IS NULL OR now()<=a.date_time+interval '30 minutes'
   OR now()>=a.date_time+make_interval(mins=>COALESCE(a.duration_minutes,120))
   OR a.status IN ('cancelled','completed') OR NOT a.is_free OR COALESCE(a.entry_fee,0)<>0
   OR NOT EXISTS(SELECT 1 FROM public.event_checkin_closures WHERE activity_id=aid)
   OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Замены доступны после закрытия чек-ина, до сетки и окончания события'; END IF;
  SELECT * INTO w FROM public.event_waitlist WHERE activity_id=aid ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF w.id IS NULL OR w.id IS DISTINCT FROM NULLIF(payload->>'waitlist_id','')::uuid THEN RAISE EXCEPTION 'Очередь изменилась. Обновите список и выберите первого участника'; END IF;
  IF action='skip_waiter' THEN
   IF COALESCE((payload->>'confirmed_absent')::boolean,false)=false THEN RAISE EXCEPTION 'Подтвердите отсутствие участника'; END IF;
   DELETE FROM public.event_waitlist WHERE id=w.id;
   PERFORM public.event_log(aid,NULL,'Участник очереди отсутствует',jsonb_build_object('user_id',w.user_id,'waitlist_id',w.id));
   PERFORM public.profile_notify(w.user_id,'games','Очередь обновлена',a.title||': организатор отметил, что вас нет на площадке. Если это ошибка, обратитесь в поддержку.','/activity/'||aid,'waitlist-skipped:'||w.id);
   RETURN jsonb_build_object('ok',true);
  END IF;
  IF COALESCE((payload->>'confirmed_present')::boolean,false)=false THEN RAISE EXCEPTION 'Подтвердите присутствие участника или команды на площадке'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=w.user_id AND account_status='active')
   OR COALESCE((SELECT (value->>'registrations_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RAISE EXCEPTION 'Запись сейчас недоступна'; END IF;
  SELECT r.id INTO absent_id FROM public.registrations r WHERE r.activity_id=aid AND r.status='no_show'
   AND NOT EXISTS(SELECT 1 FROM public.event_replacements x WHERE x.absent_registration_id=r.id) ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE;
  IF absent_id IS NULL THEN RAISE EXCEPTION 'Нет неявившихся участников для замены'; END IF;
  INSERT INTO public.event_replacements(activity_id,absent_registration_id,user_id,actor_id) VALUES(aid,absent_id,w.user_id,u) RETURNING id INTO ledger_id;
  SELECT id INTO rid FROM public.registrations WHERE activity_id=aid AND user_id=w.user_id AND status='cancelled' FOR UPDATE;
  IF rid IS NOT NULL THEN
   UPDATE public.registrations SET status='registered',team_name=w.team_name,team_members=w.team_members,checked_in_at=now(),cancellation_reason=NULL WHERE id=rid;
  ELSE
   INSERT INTO public.registrations(activity_id,user_id,status,payment_status,team_name,team_members,checked_in_at)
    VALUES(aid,w.user_id,'registered','paid',w.team_name,w.team_members,now()) RETURNING id INTO rid;
  END IF;
  UPDATE public.event_replacements SET registration_id=rid WHERE id=ledger_id;
  PERFORM public.event_log(aid,rid,'Замена из очереди после чек-ина',jsonb_build_object('absent_registration_id',absent_id,'waitlist_id',w.id));
  PERFORM public.profile_notify(w.user_id,'games','Вы в составе',a.title||': организатор подтвердил ваше присутствие и добавил вас из очереди.','/my-games','replacement:'||ledger_id);
  RETURN jsonb_build_object('ok',true,'id',rid);
 END IF;
 result:=public.event_workspace_replacement_base(action,payload);
 IF action='close_checkin' THEN
  INSERT INTO public.event_checkin_closures(activity_id) VALUES(aid) ON CONFLICT DO NOTHING;
 END IF;
 IF action='host' THEN
  result:=result||jsonb_build_object('checkin_closures',COALESCE((SELECT jsonb_agg(c.activity_id) FROM public.event_checkin_closures c WHERE public.is_activity_host(c.activity_id,u)),'[]'),
   'replaced_registrations',COALESCE((SELECT jsonb_agg(r.absent_registration_id) FROM public.event_replacements r WHERE public.is_activity_host(r.activity_id,u)),'[]'));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
