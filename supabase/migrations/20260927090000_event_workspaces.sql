-- Event workspaces: additive migration; existing registrations retain unknown legacy terms.
ALTER TABLE public.activities ADD COLUMN cover_url text CHECK(cover_url IS NULL OR cover_url ~ '^https://'), ADD COLUMN duration_minutes integer CHECK(duration_minutes BETWEEN 15 AND 10080), ADD COLUMN district text NOT NULL DEFAULT '', ADD COLUMN venue_type text NOT NULL DEFAULT 'unknown' CHECK(venue_type IN ('unknown','indoor','outdoor')), ADD COLUMN participation_mode text NOT NULL DEFAULT 'individual' CHECK(participation_mode IN ('individual','team')), ADD COLUMN rules text NOT NULL DEFAULT '', ADD COLUMN cancellation_reason text, ADD COLUMN win_points integer NOT NULL DEFAULT 3 CHECK(win_points BETWEEN 0 AND 10), ADD COLUMN draw_points integer NOT NULL DEFAULT 1 CHECK(draw_points BETWEEN 0 AND 10);
ALTER TABLE public.registrations ADD COLUMN amount_due numeric(12,2), ADD COLUMN terms_snapshot jsonb, ADD COLUMN cancellation_reason text, ADD COLUMN team_name text NOT NULL DEFAULT '', ADD COLUMN team_members jsonb NOT NULL DEFAULT '[]', ADD COLUMN payment_note text;
-- Do not invent historical prices. NULL means the original amount was not recorded.
CREATE TABLE public.saved_events(user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE, reminder boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,activity_id));
CREATE TABLE public.host_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('draft','template','venue','defaults')), name text NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}', activity_id uuid REFERENCES public.activities(id), published_id uuid REFERENCES public.activities(id), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX host_documents_owner ON public.host_documents(user_id,kind);
CREATE TABLE public.event_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX event_history_activity ON public.event_history(activity_id,created_at DESC);
CREATE TABLE public.refund_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL UNIQUE REFERENCES public.registrations(id), user_id uuid NOT NULL REFERENCES auth.users(id),amount numeric(12,2) CHECK(amount>=0),reason text NOT NULL,status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','in_progress','approved','completed','rejected')),response text NOT NULL DEFAULT '',reference text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.payment_proofs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid NOT NULL REFERENCES public.registrations(id),receipt_url text,payment_reference text NOT NULL,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.review_replies(review_id uuid PRIMARY KEY REFERENCES public.reviews(id) ON DELETE CASCADE,author_id uuid NOT NULL REFERENCES auth.users(id),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.event_matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,round integer NOT NULL DEFAULT 1 CHECK(round BETWEEN 1 AND 100),position integer NOT NULL DEFAULT 1,home_id uuid NOT NULL REFERENCES public.registrations(id),away_id uuid NOT NULL REFERENCES public.registrations(id),starts_at timestamptz,duration_minutes integer NOT NULL DEFAULT 60 CHECK(duration_minutes BETWEEN 5 AND 600),location text NOT NULL DEFAULT '',home_score integer CHECK(home_score BETWEEN 0 AND 999),away_score integer CHECK(away_score BETWEEN 0 AND 999),winner_id uuid REFERENCES public.registrations(id),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(home_id<>away_id),CHECK((home_score IS NULL)=(away_score IS NULL)),UNIQUE(activity_id,round,position));
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_matches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.saved_events,public.host_documents,public.event_history,public.refund_requests,public.payment_proofs,public.review_replies,public.event_matches TO authenticated;
GRANT ALL ON public.saved_events,public.host_documents,public.event_history,public.refund_requests,public.payment_proofs,public.review_replies,public.event_matches TO service_role;
CREATE POLICY saved_own ON public.saved_events FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY documents_own ON public.host_documents FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY history_scoped ON public.event_history FOR SELECT TO authenticated USING(public.is_activity_host(activity_id,auth.uid()) OR public.is_admin() OR EXISTS(SELECT 1 FROM public.registrations r WHERE r.id=registration_id AND r.user_id=auth.uid()));
CREATE POLICY refund_scoped ON public.refund_requests FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin() OR EXISTS(SELECT 1 FROM public.registrations r WHERE r.id=registration_id AND public.is_activity_host(r.activity_id,auth.uid())));
CREATE POLICY proof_scoped ON public.payment_proofs FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.registrations r WHERE r.id=registration_id AND (r.user_id=auth.uid() OR public.is_activity_host(r.activity_id,auth.uid()) OR public.is_admin())));
CREATE POLICY reply_scoped ON public.review_replies FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.reviews r WHERE r.id=review_id));
CREATE POLICY matches_scoped ON public.event_matches FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.activities a WHERE a.id=activity_id AND NOT a.is_private) OR public.is_activity_host(activity_id,auth.uid()) OR EXISTS(SELECT 1 FROM public.registrations r WHERE r.activity_id=event_matches.activity_id AND r.user_id=auth.uid()));
-- Participants retain access to their private events. A public UUID alone never grants access.
CREATE POLICY activity_registered_read ON public.activities FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.registrations r WHERE r.activity_id=activities.id AND r.user_id=auth.uid()));

CREATE FUNCTION public.event_log(_aid uuid,_rid uuid,_action text,_detail jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ INSERT INTO public.event_history(activity_id,registration_id,actor_id,action,detail) VALUES(_aid,_rid,auth.uid(),_action,_detail) $$;
REVOKE ALL ON FUNCTION public.event_log(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
-- Serialize capacity allocation on the activity row, including reactivation of a cancelled record.
CREATE OR REPLACE FUNCTION public.guard_activity_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; cnt integer;
BEGIN
 IF TG_OP='UPDATE' AND NOT(OLD.status IN ('cancelled','rejected') AND NEW.status='registered') THEN RETURN NEW; END IF;
 SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Событие не найдено'; END IF;
 IF a.status IN ('cancelled','completed') OR a.date_time<=now() OR a.registration_deadline<=now() OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=a.id) THEN RAISE EXCEPTION 'Регистрация закрыта'; END IF;
 SELECT count(*) INTO cnt FROM public.registrations WHERE activity_id=a.id AND status NOT IN ('cancelled','rejected') AND id<>NEW.id;
 IF cnt>=a.max_participants THEN RAISE EXCEPTION 'Мест больше нет'; END IF;
 IF TG_OP='INSERT' THEN
  NEW.amount_due:=CASE WHEN a.is_free THEN 0 ELSE a.entry_fee END;
  NEW.terms_snapshot:=jsonb_build_object('price',NEW.amount_due,'cancellation_policy',a.cancellation_policy,'date_time',a.date_time,'location_text',a.location_text,'payment_mode',a.payment_mode,'kaspi_payment_link',a.kaspi_payment_link,'participation_mode',a.participation_mode);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registrations_guard_rejoin BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_activity_capacity();
CREATE OR REPLACE FUNCTION public.guard_registration_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE free_game boolean;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.user_id<>OLD.user_id OR NEW.amount_due IS DISTINCT FROM OLD.amount_due OR NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot) THEN RAISE EXCEPTION 'Условия существующей записи неизменны'; END IF;
 IF auth.uid() IS NULL OR public.is_admin() OR public.is_activity_host(NEW.activity_id,auth.uid()) THEN RETURN NEW; END IF;
 IF NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Запись недоступна'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT is_free INTO free_game FROM public.activities WHERE id=NEW.activity_id;
  IF NEW.status<>'registered' OR NEW.payment_status<>(CASE WHEN free_game THEN 'paid'::public.payment_status ELSE 'pending'::public.payment_status END) OR NEW.paid_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL OR NEW.confirmed_by IS NOT NULL THEN RAISE EXCEPTION 'Некорректный статус новой записи'; END IF;
 ELSE
  IF OLD.status='registered' AND NEW.status='cancelled' AND EXISTS(SELECT 1 FROM public.activities WHERE id=NEW.activity_id AND (date_time<=now() OR status IN ('cancelled','completed'))) THEN RAISE EXCEPTION 'Отмена после начала рассматривается через поддержку'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled','rejected') AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=NEW.activity_id) THEN RAISE EXCEPTION 'Состав соревнования зафиксирован. Изменение требует поддержки'; END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.payment_note IS DISTINCT FROM OLD.payment_note THEN RAISE EXCEPTION 'Подтверждение доступно организатору'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='registered' AND NEW.status='cancelled') AND NOT(OLD.status='cancelled' AND NEW.status='registered' AND OLD.payment_status<>'refunded' AND NOT EXISTS(SELECT 1 FROM public.refund_requests WHERE registration_id=OLD.id AND status<>'rejected')) THEN RAISE EXCEPTION 'Отметку участия меняет организатор'; END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NOT(OLD.payment_status IN ('pending','rejected','needs_review') AND NEW.payment_status='needs_review' AND OLD.status='registered') THEN RAISE EXCEPTION 'Статус оплаты меняет организатор'; END IF;
  NEW.cancelled_at:=OLD.cancelled_at;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.event_registration_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN PERFORM public.event_log(NEW.activity_id,NEW.id,'Запись создана',jsonb_build_object('amount',NEW.amount_due));
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  PERFORM public.event_log(NEW.activity_id,NEW.id,'Статус участия изменён',jsonb_build_object('from',OLD.status,'to',NEW.status,'reason',NEW.cancellation_reason));
  IF NEW.status IN ('cancelled','rejected') AND NEW.payment_status IN ('paid','needs_review') AND COALESCE(NEW.amount_due,1)>0 THEN
   INSERT INTO public.refund_requests(registration_id,user_id,amount,reason) VALUES(NEW.id,NEW.user_id,NEW.amount_due,COALESCE(NULLIF(NEW.cancellation_reason,''),'Отмена участия')) ON CONFLICT(registration_id) DO NOTHING;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER event_registration_audit AFTER INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.event_registration_audit();
CREATE FUNCTION public.event_activity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cnt integer;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=OLD.id) THEN RAISE EXCEPTION 'Событие с записями можно только отменить'; END IF;
  RETURN OLD;
 END IF;
 SELECT count(*) INTO cnt FROM public.registrations WHERE activity_id=NEW.id AND status NOT IN ('cancelled','rejected');
 IF NEW.max_participants<cnt THEN RAISE EXCEPTION 'Лимит меньше числа участников'; END IF;
 IF EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=NEW.id) AND (NEW.type<>OLD.type OR NEW.rules IS DISTINCT FROM OLD.rules OR NEW.participation_mode<>OLD.participation_mode OR NEW.commission_percent<>OLD.commission_percent OR NEW.prize_pool IS DISTINCT FROM OLD.prize_pool OR NEW.win_points<>OLD.win_points OR NEW.draw_points<>OLD.draw_points) THEN RAISE EXCEPTION 'Формат и правила расчёта зафиксированы после первой записи'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_activity_guard BEFORE UPDATE OR DELETE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.event_activity_guard();
CREATE FUNCTION public.event_activity_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF (to_jsonb(NEW)-'registered_count'-'updated_at'-'status') IS DISTINCT FROM (to_jsonb(OLD)-'registered_count'-'updated_at'-'status') OR (NEW.status IN ('cancelled','completed') AND NEW.status<>OLD.status) THEN
 PERFORM public.event_log(NEW.id,NULL,'Событие изменено',jsonb_build_object('title',NEW.title,'date_time',NEW.date_time,'location_text',NEW.location_text,'status',NEW.status,'reason',NEW.cancellation_reason));
 END IF;
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  INSERT INTO public.refund_requests(registration_id,user_id,amount,reason)
   SELECT id,user_id,amount_due,'Организатор отменил событие: '||COALESCE(NEW.cancellation_reason,'') FROM public.registrations WHERE activity_id=NEW.id AND payment_status IN ('paid','needs_review') AND COALESCE(amount_due,CASE WHEN NEW.is_free THEN 0 ELSE 1 END)>0 ON CONFLICT(registration_id) DO NOTHING;
 END IF;
 IF NEW.date_time IS DISTINCT FROM OLD.date_time OR NEW.location_text IS DISTINCT FROM OLD.location_text OR NEW.entry_fee IS DISTINCT FROM OLD.entry_fee OR NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  FOR r IN SELECT user_id FROM public.saved_events WHERE activity_id=NEW.id LOOP PERFORM public.profile_notify(r.user_id,'games','Изменилось сохранённое событие',NEW.title,'/activity/'||NEW.id); END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER event_activity_audit AFTER UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.event_activity_audit();
REVOKE ALL ON FUNCTION public.event_registration_audit(),public.event_activity_guard(),public.event_activity_audit() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=NULLIF(payload->>'activity_id','')::uuid; rid uuid:=NULLIF(payload->>'registration_id','')::uuid; ident uuid:=NULLIF(payload->>'id','')::uuid; a public.activities; reg public.registrations; doc public.host_documents; refund public.refund_requests; matchrow public.event_matches; vals jsonb; ids uuid[]; item record; other record; win uuid; _amount numeric; _reason text:=trim(COALESCE(payload->>'reason','')); result jsonb; ishost boolean; selected integer;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF action='player' THEN
  RETURN jsonb_build_object(
   'registrations',COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('activity',(SELECT to_jsonb(x)-'invite_code' FROM public.activities x WHERE x.id=r.activity_id),'review',(SELECT to_jsonb(v)||jsonb_build_object('reply',(SELECT body FROM public.review_replies WHERE review_id=v.id)) FROM public.reviews v WHERE v.activity_id=r.activity_id AND v.reviewer_id=u AND public.is_activity_host(v.activity_id,v.reviewed_user_id) LIMIT 1),'refund',(SELECT to_jsonb(f) FROM public.refund_requests f WHERE f.registration_id=r.id),'proofs',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM public.payment_proofs p WHERE p.registration_id=r.id),'[]'),'history',COALESCE((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',(SELECT name FROM public.profiles WHERE id=h.actor_id)) ORDER BY h.created_at DESC) FROM public.event_history h WHERE h.registration_id=r.id),'[]')) ORDER BY r.created_at DESC) FROM public.registrations r WHERE r.user_id=u),'[]'),
   'saved',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.saved_events s WHERE s.user_id=u),'[]'),
   'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.profile_notifications n WHERE n.user_id=u AND n.read_at IS NULL AND n.category IN ('games','payments','support')),'[]'));
 ELSIF action='host' THEN
  RETURN jsonb_build_object(
   'activities',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.date_time) FROM public.activities x WHERE x.manager_id=u OR x.organizer_id=u),'[]'),
   'registrations',COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('proofs',COALESCE((SELECT jsonb_agg(to_jsonb(proof) ORDER BY proof.created_at DESC) FROM public.payment_proofs proof WHERE proof.registration_id=r.id),'[]'),'name',p.name,'phone',CASE WHEN r.status IN ('registered','attended') THEN p.phone END,'avatar_url',p.avatar_url) ORDER BY r.created_at DESC) FROM public.registrations r JOIN public.profiles p ON p.id=r.user_id WHERE public.is_activity_host(r.activity_id,u)),'[]'),
   'documents',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.updated_at DESC) FROM public.host_documents d WHERE d.user_id=u),'[]'),
   'refunds',COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.refund_requests f JOIN public.registrations r ON r.id=f.registration_id WHERE public.is_activity_host(r.activity_id,u)),'[]'),
   'reviews',COALESCE((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('author',p.name,'reply',(SELECT body FROM public.review_replies WHERE review_id=v.id))) FROM public.reviews v JOIN public.profiles p ON p.id=v.reviewer_id WHERE v.reviewed_user_id=u AND public.is_activity_host(v.activity_id,u)),'[]'),
   'history',COALESCE((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('actor_name',(SELECT name FROM public.profiles WHERE id=h.actor_id)) ORDER BY h.created_at DESC) FROM (SELECT * FROM public.event_history WHERE public.is_activity_host(activity_id,u) ORDER BY created_at DESC LIMIT 300) h),'[]'),
   'matches',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.round,m.position) FROM public.event_matches m WHERE public.is_activity_host(m.activity_id,u)),'[]'),
   'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.profile_notifications n WHERE n.user_id=u AND n.read_at IS NULL AND n.category IN ('host','support')),'[]'));
 END IF;
 IF action='favorite' THEN
  IF NOT EXISTS(SELECT 1 FROM public.activities WHERE id=aid AND NOT is_private) THEN RAISE EXCEPTION 'Событие недоступно'; END IF;
  IF COALESCE((payload->>'saved')::boolean,false) THEN INSERT INTO public.saved_events(user_id,activity_id,reminder) VALUES(u,aid,COALESCE((payload->>'reminder')::boolean,false)) ON CONFLICT(user_id,activity_id) DO UPDATE SET reminder=EXCLUDED.reminder;
  ELSE DELETE FROM public.saved_events WHERE user_id=u AND activity_id=aid; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action IN ('document','delete_document','publish') THEN
  IF NOT(public.has_role(u,'sports_manager') OR public.has_role(u,'tournament_organizer') OR public.is_admin()) THEN RAISE EXCEPTION 'Нужна роль организатора'; END IF;
  IF ident IS NOT NULL THEN SELECT * INTO doc FROM public.host_documents WHERE id=ident FOR UPDATE; IF FOUND AND doc.user_id<>u THEN RAISE EXCEPTION 'Черновик недоступен'; END IF; END IF;
  IF action='delete_document' THEN
   IF doc.id IS NULL OR doc.user_id<>u OR doc.published_id IS NOT NULL THEN RAISE EXCEPTION 'Документ недоступен'; END IF;
   DELETE FROM public.host_documents WHERE id=ident; RETURN jsonb_build_object('ok',true);
  ELSIF action='document' THEN
   IF payload->>'kind' IS NULL OR payload->'data' IS NULL OR jsonb_typeof(payload->'data')<>'object' OR payload->>'kind' NOT IN ('draft','template','venue','defaults') OR length((payload->'data')::text)>30000 THEN RAISE EXCEPTION 'Некорректный документ'; END IF;
   IF aid IS NOT NULL AND NOT public.is_activity_host(aid,u) THEN RAISE EXCEPTION 'Событие недоступно'; END IF;
   IF doc.published_id IS NOT NULL THEN RAISE EXCEPTION 'Этот черновик уже опубликован'; END IF;
   IF doc.id IS NOT NULL AND payload ? 'version' AND (payload->>'version')::timestamptz<>doc.updated_at THEN RAISE EXCEPTION 'Документ изменён на другом устройстве. Обновите страницу'; END IF;
   INSERT INTO public.host_documents(id,user_id,kind,name,data,activity_id) VALUES(COALESCE(ident,gen_random_uuid()),u,payload->>'kind',left(COALESCE(payload->>'name','Без названия'),120),COALESCE(payload->'data','{}'),NULLIF(payload->>'activity_id','')::uuid)
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,data=EXCLUDED.data,updated_at=clock_timestamp() RETURNING * INTO doc;
   RETURN to_jsonb(doc);
  END IF;
 END IF;
 IF action='publish' THEN
  IF doc.id IS NULL OR doc.user_id<>u OR doc.kind<>'draft' THEN RAISE EXCEPTION 'Сначала сохраните черновик'; END IF;
  IF doc.published_id IS NOT NULL THEN RETURN jsonb_build_object('id',doc.published_id); END IF;
  IF payload ? 'version' AND (payload->>'version')::timestamptz<>doc.updated_at THEN RAISE EXCEPTION 'Черновик изменён. Проверьте его перед публикацией'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') THEN RAISE EXCEPTION 'Аккаунт ограничен'; END IF;
  IF COALESCE((SELECT (value->>'activity_creation_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RAISE EXCEPTION 'Создание событий приостановлено'; END IF;
  vals:=doc.data;
  IF vals->>'type' IS NULL OR vals->>'type' NOT IN ('daily_game','tournament','league') OR (vals->>'type'<>'daily_game' AND NOT(public.has_role(u,'tournament_organizer') OR public.is_admin())) THEN RAISE EXCEPTION 'Недостаточно прав для этого формата'; END IF;
  IF COALESCE(length(trim(vals->>'title')),0) NOT BETWEEN 3 AND 120 OR COALESCE(length(trim(vals->>'location_text')),0)<3 OR NULLIF(vals->>'date_time','') IS NULL OR (vals->>'date_time')::timestamptz<=now() OR COALESCE((vals->>'max_participants')::integer,0) NOT BETWEEN 2 AND 200 OR COALESCE((vals->>'duration_minutes')::integer,0) NOT BETWEEN 15 AND 10080 OR COALESCE((vals->>'entry_fee')::numeric,-1)<0 THEN RAISE EXCEPTION 'Проверьте название, площадку, время, стоимость и количество мест'; END IF;
  IF COALESCE(vals->>'sport','') NOT IN ('Футбол','Мини-футбол','Баскетбол','Волейбол') OR COALESCE(vals->>'city','') NOT IN ('Астана','Алматы','Шымкент','Караганда') OR length(COALESCE(vals->>'description',''))>3000 OR length(COALESCE(vals->>'rules',''))>4000 OR length(COALESCE(vals->>'cover_url',''))>2000 OR (COALESCE(vals->>'cover_url','')<>'' AND vals->>'cover_url' !~ '^https://') THEN RAISE EXCEPTION 'Проверьте город, спорт, описание и обложку'; END IF;
  IF NULLIF(vals->>'registration_deadline','') IS NOT NULL AND (vals->>'registration_deadline')::timestamptz>(vals->>'date_time')::timestamptz THEN RAISE EXCEPTION 'Регистрация должна завершиться до начала'; END IF;
  IF COALESCE(vals->>'two_gis_url','')<>'' AND vals->>'two_gis_url' !~ '^https://(2gis\.kz|go\.2gis\.com)/' THEN RAISE EXCEPTION 'Проверьте ссылку 2GIS'; END IF;
  IF (vals->>'entry_fee')::numeric>0 AND (vals->>'kaspi_payment_link' IS NULL OR vals->>'kaspi_payment_link' !~ '^https://pay\.kaspi\.kz/pay/') THEN RAISE EXCEPTION 'Для платного события укажите ссылку Kaspi'; END IF;
  IF (vals->>'entry_fee')::numeric>0 AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Подтвердите контакт'; END IF;
  IF doc.activity_id IS NOT NULL THEN
   SELECT * INTO a FROM public.activities WHERE id=doc.activity_id FOR UPDATE;
   IF NOT public.is_activity_host(a.id,u) OR a.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Редактирование недоступно'; END IF;
   UPDATE public.activities SET cover_url=NULLIF(vals->>'cover_url',''),title=trim(vals->>'title'),description=vals->>'description',sport=vals->>'sport',city=vals->>'city',district=COALESCE(vals->>'district',''),location_text=vals->>'location_text',two_gis_url=NULLIF(vals->>'two_gis_url',''),date_time=(vals->>'date_time')::timestamptz,time_text=NULL,duration_minutes=(vals->>'duration_minutes')::integer,registration_deadline=NULLIF(vals->>'registration_deadline','')::timestamptz,entry_fee=(vals->>'entry_fee')::numeric,price_text=NULL,is_free=(vals->>'entry_fee')::numeric=0,max_participants=(vals->>'max_participants')::integer,skill_level=vals->>'skill_level',cancellation_policy=vals->>'cancellation_policy',notes=vals->>'notes',rules=COALESCE(vals->>'rules',''),venue_type=COALESCE(vals->>'venue_type','unknown'),kaspi_payment_link=NULLIF(vals->>'kaspi_payment_link',''),participation_mode=COALESCE(vals->>'participation_mode','individual') WHERE id=a.id RETURNING * INTO a;
  ELSE
   INSERT INTO public.activities(cover_url,title,type,manager_id,organizer_id,host_name,sport,city,district,location_text,two_gis_url,date_time,duration_minutes,registration_deadline,entry_fee,is_free,max_participants,skill_level,cancellation_policy,notes,rules,venue_type,kaspi_payment_link,payment_mode,participation_mode,is_private,invite_code,description,prize_pool,commission_percent)
   VALUES(NULLIF(vals->>'cover_url',''),trim(vals->>'title'),(vals->>'type')::public.activity_type,CASE WHEN vals->>'type'='daily_game' THEN u END,CASE WHEN vals->>'type'<>'daily_game' THEN u END,(SELECT COALESCE(NULLIF(pp.host_name,''),p.name) FROM public.profiles p LEFT JOIN public.profile_preferences pp ON pp.user_id=p.id WHERE p.id=u),vals->>'sport',vals->>'city',COALESCE(vals->>'district',''),vals->>'location_text',NULLIF(vals->>'two_gis_url',''),(vals->>'date_time')::timestamptz,(vals->>'duration_minutes')::integer,NULLIF(vals->>'registration_deadline','')::timestamptz,(vals->>'entry_fee')::numeric,(vals->>'entry_fee')::numeric=0,(vals->>'max_participants')::integer,vals->>'skill_level',vals->>'cancellation_policy',vals->>'notes',COALESCE(vals->>'rules',''),COALESCE(vals->>'venue_type','unknown'),NULLIF(vals->>'kaspi_payment_link',''),'MANAGER_DIRECT',COALESCE(vals->>'participation_mode','individual'),COALESCE((vals->>'is_private')::boolean,false),CASE WHEN COALESCE((vals->>'is_private')::boolean,false) THEN replace(gen_random_uuid()::text,'-','') END,vals->>'description','{"1":100}',10) RETURNING * INTO a;
  END IF;
  UPDATE public.host_documents SET published_id=a.id,updated_at=clock_timestamp() WHERE id=doc.id;
  PERFORM public.event_log(a.id,NULL,'Публикация',jsonb_build_object('title',a.title));
  RETURN jsonb_build_object('id',a.id,'invite_code',a.invite_code);
 END IF;
 IF rid IS NOT NULL THEN SELECT * INTO reg FROM public.registrations WHERE id=rid; IF NOT FOUND THEN RAISE EXCEPTION 'Запись не найдена'; END IF; aid:=reg.activity_id; END IF;
 IF aid IS NOT NULL THEN SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Событие не найдено'; END IF; END IF;
 ishost:=COALESCE(public.is_activity_host(aid,u),false) OR public.is_admin();
 IF rid IS NOT NULL THEN SELECT * INTO reg FROM public.registrations WHERE id=rid FOR UPDATE; END IF;
 IF action='join' THEN
  IF COALESCE((payload->>'accepted_terms')::boolean,false)=false THEN RAISE EXCEPTION 'Подтвердите условия участия'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') OR COALESCE((SELECT (value->>'registrations_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RAISE EXCEPTION 'Запись временно недоступна'; END IF;
  SELECT * INTO reg FROM public.registrations WHERE activity_id=aid AND user_id=u FOR UPDATE;
  IF reg.id IS NOT NULL AND reg.status NOT IN ('cancelled','rejected') THEN RETURN jsonb_build_object('id',reg.id,'payment_status',reg.payment_status); END IF;
  IF a.is_private AND NOT ishost AND (COALESCE(payload->>'code','')<>a.invite_code AND reg.id IS NULL) THEN RAISE EXCEPTION 'Нужен код приглашения'; END IF;
  IF a.participation_mode='team' AND (length(trim(COALESCE(payload->>'team_name','')))<2 OR COALESCE(jsonb_typeof(payload->'team_members'),'null')<>'array' OR jsonb_array_length(payload->'team_members') NOT BETWEEN 1 AND 50) THEN RAISE EXCEPTION 'Укажите команду и состав'; END IF;
  IF length(COALESCE(payload->>'team_name',''))>100 OR (payload ? 'team_members' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'team_members') member WHERE length(trim(member)) NOT BETWEEN 2 AND 100)) THEN RAISE EXCEPTION 'Проверьте название команды и имена участников'; END IF;
  IF reg.id IS NOT NULL THEN
   IF reg.status='rejected' OR EXISTS(SELECT 1 FROM public.refund_requests WHERE registration_id=reg.id AND status<>'rejected') OR reg.payment_status='refunded' THEN RAISE EXCEPTION 'По этой записи есть возврат или решение организатора. Обратитесь в поддержку для повторного участия'; END IF;
   UPDATE public.registrations SET status='registered',team_name=COALESCE(payload->>'team_name',''),team_members=COALESCE(payload->'team_members','[]') WHERE id=reg.id RETURNING * INTO reg;
  ELSE
   INSERT INTO public.registrations(activity_id,user_id,payment_status,team_name,team_members) VALUES(aid,u,CASE WHEN a.is_free THEN 'paid'::public.payment_status ELSE 'pending'::public.payment_status END,COALESCE(payload->>'team_name',''),COALESCE(payload->'team_members','[]')) RETURNING * INTO reg;
  END IF;
  RETURN jsonb_build_object('id',reg.id,'payment_status',reg.payment_status);
 ELSIF action='cancel' THEN
  IF reg.id IS NULL OR reg.user_id<>u OR reg.status<>'registered' OR a.status IN ('completed','cancelled') OR a.date_time<=now() THEN RAISE EXCEPTION 'Отмена этой записи недоступна'; END IF;
  IF EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Состав соревнования зафиксирован. Обратитесь в поддержку'; END IF;
  UPDATE public.registrations SET status='cancelled',cancellation_reason=left(_reason,600) WHERE id=rid;
 ELSIF action='proof' THEN
  IF reg.id IS NULL OR reg.user_id<>u OR reg.status<>'registered' OR reg.payment_status NOT IN ('pending','rejected') OR COALESCE(reg.amount_due,CASE WHEN a.is_free THEN 0 ELSE 1 END)=0 OR a.status='cancelled' THEN RAISE EXCEPTION 'Отправка чека недоступна'; END IF;
  IF length(trim(COALESCE(payload->>'payment_reference','')))<2 THEN RAISE EXCEPTION 'Укажите код перевода'; END IF;
  IF COALESCE(payload->>'receipt_url','')<>'' AND (payload->>'receipt_url' NOT LIKE u::text||'/'||rid::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='receipts' AND name=payload->>'receipt_url')) THEN RAISE EXCEPTION 'Чек недоступен'; END IF;
  INSERT INTO public.payment_proofs(registration_id,receipt_url,payment_reference,note) VALUES(rid,NULLIF(payload->>'receipt_url',''),left(payload->>'payment_reference',120),left(COALESCE(payload->>'note',''),400));
  UPDATE public.registrations SET payment_reference=left(payload->>'payment_reference',120),receipt_url=NULLIF(payload->>'receipt_url',''),participant_note=left(COALESCE(payload->>'note',''),400),payment_status='needs_review' WHERE id=rid;
 ELSIF action='participant' THEN
  IF NOT ishost OR reg.id IS NULL THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  IF payload->>'status' IS NULL OR payload->>'status' NOT IN ('attended','no_show','rejected') OR length(_reason)<3 THEN RAISE EXCEPTION 'Выберите отметку и укажите причину'; END IF;
  IF payload->>'status' IN ('attended','no_show') AND (a.date_time IS NULL OR a.date_time>now() OR reg.status IN ('cancelled','rejected') OR a.status='cancelled') THEN RAISE EXCEPTION 'Посещение отмечается после начала события'; END IF;
  IF payload->>'status'='rejected' AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Участник включён в сетку. Для изменения обратитесь в поддержку'; END IF;
  UPDATE public.registrations SET status=(payload->>'status')::public.registration_status,cancellation_reason=left(_reason,600) WHERE id=rid;
 ELSIF action='payment' THEN
  IF NOT ishost OR (action='payment' AND reg.id IS NULL) OR payload->>'status' IS NULL OR payload->>'status' NOT IN ('paid','rejected') OR reg.status IN ('cancelled','rejected') OR reg.payment_status='refunded' THEN RAISE EXCEPTION 'Изменение оплаты недоступно'; END IF;
  IF reg.payment_status='paid' THEN RETURN jsonb_build_object('ok',true); END IF;
  IF payload->>'status'='rejected' AND length(_reason)<3 THEN RAISE EXCEPTION 'Укажите причину отклонения'; END IF;
  UPDATE public.registrations SET payment_status=(payload->>'status')::public.payment_status,payment_note=left(_reason,600),confirmed_at=now(),confirmed_by=u,paid_at=CASE WHEN payload->>'status'='paid' THEN now() ELSE paid_at END WHERE id=rid;
  PERFORM public.event_log(aid,rid,'Решение по оплате',jsonb_build_object('status',payload->>'status','reason',_reason));
 ELSIF action='refund' THEN
  SELECT * INTO refund FROM public.refund_requests WHERE registration_id=rid FOR UPDATE;
  IF payload->>'status'='requested' THEN
   IF reg.id IS NULL OR reg.user_id<>u OR reg.payment_status NOT IN ('paid','needs_review') OR length(_reason)<3 THEN RAISE EXCEPTION 'Укажите причину возврата по оплаченной записи'; END IF;
   INSERT INTO public.refund_requests(registration_id,user_id,amount,reason) VALUES(rid,u,reg.amount_due,left(_reason,1500)) ON CONFLICT(registration_id) DO NOTHING;
  ELSE
   IF NOT ishost OR refund.id IS NULL OR payload->>'status' NOT IN ('in_progress','approved','completed','rejected') OR refund.status IN ('completed','rejected') THEN RAISE EXCEPTION 'Обработка возврата недоступна'; END IF;
   IF length(_reason)<3 THEN RAISE EXCEPTION 'Укажите пояснение решения'; END IF;
   _amount:=COALESCE(NULLIF(payload->>'amount','')::numeric,refund.amount);
   IF _amount IS NULL OR _amount<0 OR (reg.amount_due IS NOT NULL AND _amount>reg.amount_due) THEN RAISE EXCEPTION 'Проверьте сумму возврата'; END IF;
   IF payload->>'status'='completed' AND length(trim(COALESCE(payload->>'reference','')))<3 THEN RAISE EXCEPTION 'Укажите подтверждение выполненного перевода'; END IF;
   UPDATE public.refund_requests SET status=payload->>'status',amount=_amount,response=left(_reason,1500),reference=left(COALESCE(payload->>'reference',''),200),updated_at=now() WHERE id=refund.id;
   IF payload->>'status'='completed' THEN UPDATE public.registrations SET payment_status='refunded' WHERE id=rid; END IF;
   PERFORM public.profile_notify(reg.user_id,'payments','Решение по возврату',a.title||': '||_reason,'/my-games?tab=cancelled');
  END IF;
  PERFORM public.event_log(aid,rid,'Возврат',jsonb_build_object('status',payload->>'status','reason',_reason));
 ELSIF action='event_status' THEN
  IF NOT ishost OR (action='payment' AND reg.id IS NULL) OR payload->>'status' IS NULL OR payload->>'status' NOT IN ('completed','cancelled') THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  IF a.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Событие уже завершено'; END IF;
  IF payload->>'status'='completed' AND EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=aid AND status='registered') THEN RAISE EXCEPTION 'Сначала отметьте посещение участников'; END IF;
  IF payload->>'status'='completed' AND a.type<>'daily_game' THEN RAISE EXCEPTION 'Завершите соревнование публикацией результатов'; END IF;
  IF payload->>'status'='completed' AND (a.date_time IS NULL OR a.date_time>now()) THEN RAISE EXCEPTION 'Событие ещё не началось'; END IF;
  IF payload->>'status'='cancelled' AND length(_reason)<3 THEN RAISE EXCEPTION 'Укажите причину отмены'; END IF;
  UPDATE public.activities SET status=(payload->>'status')::public.activity_status,cancellation_reason=CASE WHEN payload->>'status'='cancelled' THEN _reason END WHERE id=aid;
 ELSIF action='review' THEN
  IF reg.id IS NULL OR reg.user_id<>u OR reg.status<>'attended' OR a.status<>'completed' OR COALESCE(a.manager_id,a.organizer_id)=u THEN RAISE EXCEPTION 'Отзыв доступен после подтверждённого участия'; END IF;
  INSERT INTO public.reviews(activity_id,reviewer_id,reviewed_user_id,rating,comment) VALUES(aid,u,COALESCE(a.manager_id,a.organizer_id),(payload->>'rating')::integer,left(payload->>'comment',600)) ON CONFLICT(activity_id,reviewer_id,reviewed_user_id) DO NOTHING;
 ELSIF action='review_reply' THEN
  SELECT * INTO item FROM public.reviews WHERE id=ident;
  IF NOT FOUND OR item.reviewed_user_id<>u OR NOT public.is_activity_host(item.activity_id,u) THEN RAISE EXCEPTION 'Отзыв недоступен'; END IF;
  IF COALESCE(length(trim(payload->>'body')),0) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Ответ должен содержать от 2 до 1000 символов'; END IF;
  INSERT INTO public.review_replies(review_id,author_id,body) VALUES(ident,u,trim(payload->>'body')) ON CONFLICT(review_id) DO UPDATE SET body=EXCLUDED.body,updated_at=now();
  PERFORM public.profile_notify(item.reviewer_id,'games','Организатор ответил на отзыв',left(payload->>'body',200),'/my-games?tab=reviews');
 ELSE RAISE EXCEPTION 'Неизвестное действие';
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
