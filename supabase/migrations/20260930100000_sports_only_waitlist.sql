-- Current release is sports-only and free. Keep existing records and published migration history.
ALTER POLICY disciplines_read ON public.disciplines USING(kind='sport');
REVOKE EXECUTE ON FUNCTION public.staff_payment(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.guard_free_sports() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='activities' THEN
  IF COALESCE(NEW.entry_fee,0)<>0 OR NOT NEW.is_free OR COALESCE(NEW.kaspi_payment_link,'')<>'' OR NEW.tier='blitz' THEN RAISE EXCEPTION 'Сейчас доступны только бесплатные спортивные события'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.disciplines WHERE name=NEW.sport AND kind='sport') THEN RAISE EXCEPTION 'Выберите спортивную дисциплину'; END IF;
 ELSIF TG_TABLE_NAME='registrations' THEN
  IF TG_OP='INSERT' THEN
   IF NOT EXISTS(SELECT 1 FROM public.activities WHERE id=NEW.activity_id AND is_free AND COALESCE(entry_fee,0)=0) OR NEW.payment_status<>'paid' OR COALESCE(NEW.amount_due,0)<>0 OR NEW.paid_at IS NOT NULL OR NEW.confirmed_by IS NOT NULL OR COALESCE(NEW.payment_reference,'')<>'' OR COALESCE(NEW.receipt_url,'')<>'' THEN RAISE EXCEPTION 'Платежи отключены'; END IF;
  ELSIF ROW(NEW.payment_status,NEW.paid_at,NEW.confirmed_by,NEW.confirmed_at,NEW.payment_reference,NEW.receipt_url,NEW.payment_note) IS DISTINCT FROM ROW(OLD.payment_status,OLD.paid_at,OLD.confirmed_by,OLD.confirmed_at,OLD.payment_reference,OLD.receipt_url,OLD.payment_note) THEN RAISE EXCEPTION 'Платежи отключены'; END IF;
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF COALESCE(NEW.kaspi_payment_link,'')<>'' AND (TG_OP='INSERT' OR NEW.kaspi_payment_link IS DISTINCT FROM OLD.kaspi_payment_link) THEN RAISE EXCEPTION 'Реквизиты оплаты отключены'; END IF;
 ELSIF TG_TABLE_NAME='results' THEN
  IF COALESCE(NEW.prize_amount,0)<>0 OR NEW.paid_out THEN RAISE EXCEPTION 'Денежные призы и выплаты отключены'; END IF;
 ELSE RAISE EXCEPTION 'Платежи отключены';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER z_free_sports BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER z_free_registration BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER z_no_payment_details BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER z_no_prize_payments BEFORE INSERT OR UPDATE ON public.results FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER no_payment_proofs BEFORE INSERT OR UPDATE ON public.payment_proofs FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER no_refund_requests BEFORE INSERT OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
CREATE TRIGGER no_payment_events BEFORE INSERT OR UPDATE ON public.payment_events FOR EACH ROW EXECUTE FUNCTION public.guard_free_sports();
-- Receipts cannot be uploaded, including by previously-open clients.
CREATE POLICY receipts_disabled ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'receipts');
CREATE POLICY receipts_updates_disabled ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'receipts') WITH CHECK(bucket_id<>'receipts');

CREATE TABLE public.event_waitlist(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,team_name text NOT NULL DEFAULT '',team_members jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(activity_id,user_id)
);
ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.event_waitlist TO authenticated;
CREATE POLICY waitlist_read ON public.event_waitlist FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_activity_host(activity_id,auth.uid()) OR public.is_staff());
CREATE FUNCTION public.notify_waitlist(aid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; w public.event_waitlist;
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=aid;
 IF a.status IN ('cancelled','completed') OR a.date_time<=now() OR a.registration_deadline<=now() OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RETURN; END IF;
 IF (SELECT count(*) FROM public.registrations WHERE activity_id=aid AND status NOT IN ('cancelled','rejected','no_show'))>=a.max_participants THEN RETURN; END IF;
 SELECT * INTO w FROM public.event_waitlist WHERE activity_id=aid ORDER BY created_at,id LIMIT 1;
 IF w.id IS NOT NULL THEN PERFORM public.profile_notify(w.user_id,'games','Освободилось место',a.title||': ваша очередь. Откройте событие и подтвердите участие.','/activity/'||aid); END IF;
END $$;
REVOKE ALL ON FUNCTION public.notify_waitlist(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.waitlist_registration_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status='registered' AND OLD.status<>'registered' THEN DELETE FROM public.event_waitlist WHERE activity_id=NEW.activity_id AND user_id=NEW.user_id; END IF;
 IF TG_OP='UPDATE' AND NEW.status IN ('cancelled','rejected') AND OLD.status NOT IN ('cancelled','rejected') THEN PERFORM public.notify_waitlist(NEW.activity_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER waitlist_registration_changed AFTER INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.waitlist_registration_changed();
-- Direct REST inserts must respect the same queue as the app.
CREATE FUNCTION public.guard_waitlist_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_user uuid;
BEGIN
 IF TG_OP='UPDATE' AND NOT(NEW.status='registered' AND OLD.status IN ('cancelled','rejected')) THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.activities WHERE id=NEW.activity_id FOR UPDATE;
 SELECT user_id INTO first_user FROM public.event_waitlist WHERE activity_id=NEW.activity_id ORDER BY created_at,id LIMIT 1;
 IF first_user IS NOT NULL AND first_user<>NEW.user_id THEN RAISE EXCEPTION 'Свободное место предложено первому участнику листа ожидания'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_waitlist_order BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_waitlist_order();
ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_sports_base;
REVOKE ALL ON FUNCTION public.event_workspace_sports_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=NULLIF(payload->>'activity_id','')::uuid; a public.activities; result jsonb; d jsonb; affected integer;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF octet_length(payload::text)>40000 THEN RAISE EXCEPTION 'Слишком много данных'; END IF;
 IF action IN ('proof','payment','refund') THEN RAISE EXCEPTION 'Платежи отключены'; END IF;
 IF action='document' THEN
  d:=COALESCE(payload->'data','{}');
  IF COALESCE((d->>'entry_fee')::numeric,0)<>0 OR COALESCE(d->>'kaspi_payment_link','')<>'' OR d->>'tier'='blitz' THEN RAISE EXCEPTION 'Сейчас доступны только бесплатные спортивные события'; END IF;
  IF COALESCE(d->>'sport','')<>'' AND NOT EXISTS(SELECT 1 FROM public.disciplines WHERE name=d->>'sport' AND kind='sport') THEN RAISE EXCEPTION 'Выберите спортивную дисциплину'; END IF;
 END IF;
 IF action IN ('waitlist_join','waitlist_leave','close_checkin') THEN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
  SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Событие недоступно'; END IF;
  IF action='waitlist_leave' THEN
   DELETE FROM public.event_waitlist WHERE activity_id=aid AND user_id=u;
   PERFORM public.notify_waitlist(aid); RETURN jsonb_build_object('ok',true);
  END IF;
  IF action='close_checkin' THEN
   IF NOT(public.is_activity_host(aid,u) OR public.is_staff()) THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
   IF a.date_time IS NULL OR now()<=a.date_time+interval '30 minutes' OR a.status IN ('cancelled','completed') OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Завершение чек-ина сейчас недоступно'; END IF;
   UPDATE public.registrations SET status='no_show',cancellation_reason='Чек-ин не пройден до окончания окна' WHERE activity_id=aid AND status='registered' AND checked_in_at IS NULL;
   GET DIAGNOSTICS affected=ROW_COUNT;
   PERFORM public.event_log(aid,NULL,'Чек-ин завершён',jsonb_build_object('no_show',affected));
   RETURN jsonb_build_object('ok',true,'count',affected);
  END IF;
  IF a.is_private AND a.invite_code<>COALESCE(payload->>'code','') AND NOT public.is_activity_host(aid,u) THEN RAISE EXCEPTION 'Нужен код приглашения'; END IF;
  IF a.status IN ('cancelled','completed') OR a.date_time<=now() OR a.registration_deadline<=now() OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Регистрация закрыта'; END IF;
  IF COALESCE((SELECT (value->>'registrations_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RAISE EXCEPTION 'Запись временно отключена'; END IF;
  IF EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=aid AND user_id=u AND status<>'cancelled') THEN RAISE EXCEPTION 'У вас уже есть запись. При необходимости обратитесь к организатору'; END IF;
  IF COALESCE((payload->>'accepted_terms')::boolean,false)=false THEN RAISE EXCEPTION 'Подтвердите правила участия'; END IF;
  IF a.participation_mode='team' AND (length(trim(COALESCE(payload->>'team_name','')))<2 OR length(payload->>'team_name')>100 OR jsonb_typeof(COALESCE(payload->'team_members','null'))<>'array' OR jsonb_array_length(payload->'team_members') NOT BETWEEN a.team_min AND a.team_max OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'team_members') x WHERE length(trim(x)) NOT BETWEEN 2 AND 100) OR (SELECT count(*)<>count(DISTINCT lower(trim(x))) FROM jsonb_array_elements_text(payload->'team_members') x)) THEN RAISE EXCEPTION 'Проверьте название и состав команды'; END IF;
  IF (SELECT count(*) FROM public.registrations WHERE activity_id=aid AND status NOT IN ('cancelled','rejected'))<a.max_participants AND NOT EXISTS(SELECT 1 FROM public.event_waitlist WHERE activity_id=aid) THEN RAISE EXCEPTION 'Есть свободные места — запишитесь на событие'; END IF;
  INSERT INTO public.event_waitlist(activity_id,user_id,team_name,team_members) VALUES(aid,u,left(COALESCE(payload->>'team_name',''),100),COALESCE(payload->'team_members','[]')) ON CONFLICT(activity_id,user_id) DO NOTHING;
  RETURN jsonb_build_object('ok',true);
 END IF;
 result:=public.event_workspace_sports_base(action,payload);
 IF action IN ('player','host') THEN
  result:=result||jsonb_build_object('waitlist',COALESCE((SELECT jsonb_agg(to_jsonb(w)||jsonb_build_object('name',p.name,'position',(SELECT count(*) FROM public.event_waitlist q WHERE q.activity_id=w.activity_id AND (q.created_at,q.id)<=(w.created_at,w.id)),'activity',(SELECT to_jsonb(x)-'invite_code' FROM public.activities x WHERE x.id=w.activity_id)) ORDER BY w.created_at,w.id) FROM public.event_waitlist w JOIN public.profiles p ON p.id=w.user_id WHERE CASE WHEN action='player' THEN w.user_id=u ELSE public.is_activity_host(w.activity_id,u) END),'[]'));
 END IF;
 IF action='join' THEN PERFORM public.notify_waitlist(aid); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
ALTER FUNCTION public.event_competition(text,jsonb) RENAME TO event_competition_sports_base;
REVOKE ALL ON FUNCTION public.event_competition_sports_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF action='payout' THEN RAISE EXCEPTION 'Выплаты отключены'; END IF;
 RETURN public.event_competition_sports_base(action,payload);
END $$;
REVOKE ALL ON FUNCTION public.event_competition(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_competition(text,jsonb) TO authenticated;

CREATE FUNCTION public.waitlist_event_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w record;
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  FOR w IN SELECT user_id FROM public.event_waitlist WHERE activity_id=NEW.id LOOP
   PERFORM public.profile_notify(w.user_id,'games','Событие из листа ожидания отменено',NEW.title,'/activity/'||NEW.id);
  END LOOP;
 ELSIF NEW.max_participants>OLD.max_participants THEN PERFORM public.notify_waitlist(NEW.id);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER waitlist_event_changed AFTER UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.waitlist_event_changed();
REVOKE INSERT,UPDATE,DELETE ON public.payment_status_history FROM authenticated;
