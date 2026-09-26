-- Profile workspace. All writes go through authenticated, ownership-checked RPCs.
CREATE TABLE public.profile_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 bio text NOT NULL DEFAULT '', district text NOT NULL DEFAULT '',
 skills jsonb NOT NULL DEFAULT '[]', days integer[] NOT NULL DEFAULT '{}',
 time_from text NOT NULL DEFAULT '18:00', time_to text NOT NULL DEFAULT '22:00',
 event_types text[] NOT NULL DEFAULT '{}',
 privacy jsonb NOT NULL DEFAULT '{"bio":true,"sports":true,"stats":true}',
 notifications jsonb NOT NULL DEFAULT '{"games":true,"payments":true,"applications":true,"support":true,"host":true,"recommendations":false,"reminder":60}',
 host_name text NOT NULL DEFAULT '', host_bio text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profile_preferences TO authenticated;
GRANT ALL ON public.profile_preferences TO service_role;
CREATE POLICY preferences_own ON public.profile_preferences FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE TABLE public.profile_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 category text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', href text NOT NULL DEFAULT '/profile?tab=overview',
 dedupe text UNIQUE, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_notifications_user ON public.profile_notifications(user_id,created_at DESC);
ALTER TABLE public.profile_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profile_notifications TO authenticated;
GRANT ALL ON public.profile_notifications TO service_role;
CREATE POLICY notifications_own ON public.profile_notifications FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE TABLE public.support_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 topic text NOT NULL CHECK(topic IN ('general','payment','attendance','review','restriction','deletion')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 120),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','in_progress','needs_user','resolved')),
 registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
 review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
 author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, is_staff boolean NOT NULL DEFAULT false,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000), attachments text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user ON public.support_tickets(user_id,updated_at DESC);
CREATE INDEX support_messages_ticket ON public.support_messages(ticket_id,created_at);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.support_tickets, public.support_messages TO authenticated;
GRANT ALL ON public.support_tickets, public.support_messages TO service_role;
CREATE POLICY tickets_access ON public.support_tickets FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY messages_access ON public.support_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND (t.user_id=auth.uid() OR public.is_admin())));

ALTER TABLE public.registrations ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN restriction_reason text;
ALTER TABLE public.profiles ADD COLUMN restriction_until timestamptz;
-- Preserve old cancellation timestamps as unknown; do not infer them from updated_at.
CREATE FUNCTION public.stamp_registration_cancellation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN NEW.cancelled_at=now(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER registration_cancel_time BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.stamp_registration_cancellation();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('support','support',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY support_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='support' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY support_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='support' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.is_admin()));
CREATE POLICY support_remove ON storage.objects FOR DELETE TO authenticated USING(bucket_id='support' AND (storage.foldername(name))[1]=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.support_messages m WHERE name=ANY(m.attachments)));

CREATE FUNCTION public.profile_notify(_user uuid,_category text,_title text,_body text,_href text,_dedupe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _user IS NULL THEN RETURN; END IF;
 IF COALESCE((SELECT (notifications->>_category)::boolean FROM public.profile_preferences WHERE user_id=_user),true)=false THEN RETURN; END IF;
 INSERT INTO public.profile_notifications(user_id,category,title,body,href,dedupe) VALUES(_user,_category,_title,_body,_href,_dedupe) ON CONFLICT(dedupe) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.profile_notify(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.profile_event_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; r record; recipient uuid;
BEGIN
 IF TG_TABLE_NAME='registrations' THEN
  SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id;
  recipient:=COALESCE(a.manager_id,a.organizer_id);
  IF TG_OP='INSERT' THEN
   PERFORM public.profile_notify(NEW.user_id,'games','Запись подтверждена',a.title,'/activity/'||a.id);
   PERFORM public.profile_notify(recipient,'host','Новый участник',a.title,'/host');
  ELSE
   IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    PERFORM public.profile_notify(NEW.user_id,'payments','Статус оплаты изменён',a.title||': '||CASE NEW.payment_status WHEN 'paid' THEN 'оплачено' WHEN 'rejected' THEN 'отклонено' WHEN 'needs_review' THEN 'на проверке' WHEN 'refunded' THEN 'возвращено' ELSE 'ожидает оплаты' END,'/my-games');
   END IF;
   IF NEW.receipt_url IS DISTINCT FROM OLD.receipt_url OR (NEW.payment_status='needs_review' AND OLD.payment_status<>'needs_review') THEN
    PERFORM public.profile_notify(recipient,'host','Проверьте оплату участника',a.title,'/host');
   END IF;
   IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.profile_notify(NEW.user_id,'games','Статус участия изменён',a.title,'/my-games');
    IF NEW.status='cancelled' THEN PERFORM public.profile_notify(recipient,'host','Участник отменил запись',a.title,'/host'); END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='activities' THEN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.date_time IS DISTINCT FROM OLD.date_time OR NEW.location_text IS DISTINCT FROM OLD.location_text OR NEW.results_submitted_at IS DISTINCT FROM OLD.results_submitted_at THEN
   FOR r IN SELECT user_id FROM public.registrations WHERE activity_id=NEW.id AND status IN ('registered','attended') LOOP
    PERFORM public.profile_notify(r.user_id,'games',CASE WHEN NEW.status='cancelled' THEN 'Событие отменено' WHEN NEW.results_submitted_at IS DISTINCT FROM OLD.results_submitted_at THEN 'Опубликованы результаты' ELSE 'Изменения в событии' END,NEW.title,'/activity/'||NEW.id);
   END LOOP;
  END IF;
 ELSIF TG_TABLE_NAME='manager_applications' THEN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   PERFORM public.profile_notify(NEW.user_id,'applications','Решение по заявке организатора',CASE WHEN NEW.status='approved' THEN 'Заявка одобрена' ELSE COALESCE(NEW.admin_notes,'Заявка отклонена') END,'/profile?tab=organizer');
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.profile_event_notification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER profile_reg_notification AFTER INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.profile_event_notification();
CREATE TRIGGER profile_activity_notification AFTER UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.profile_event_notification();
CREATE TRIGGER profile_application_notification AFTER UPDATE ON public.manager_applications FOR EACH ROW EXECUTE FUNCTION public.profile_event_notification();

-- Returns only intentionally public fields. Contact data, restrictions and admin roles never leave this function.
CREATE FUNCTION public.public_player_profile(_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'created_at',p.created_at,'avatar_url',p.avatar_url,'stats_visible',COALESCE((s.privacy->>'stats')::boolean,true),
 'bio',CASE WHEN COALESCE((s.privacy->>'bio')::boolean,true) THEN COALESCE(s.bio,'') ELSE '' END,
 'sports',CASE WHEN COALESCE((s.privacy->>'sports')::boolean,true) THEN to_jsonb(p.sports) ELSE '[]'::jsonb END,
 'rating',CASE WHEN COALESCE((s.privacy->>'stats')::boolean,true) THEN p.rating ELSE null END,
 'rating_count',CASE WHEN COALESCE((s.privacy->>'stats')::boolean,true) THEN p.rating_count ELSE null END,
 'host_name',COALESCE(s.host_name,''),'host_bio',COALESCE(s.host_bio,''))
 FROM public.profiles p LEFT JOIN public.profile_preferences s ON s.user_id=p.id WHERE p.id=_id;
$$;
REVOKE ALL ON FUNCTION public.public_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_player_profile(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.profile_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); _ticket public.support_tickets; prefs public.profile_preferences; body text; rid uuid; tid uuid; attachments text[]; result jsonb; auth_user auth.users; skill_row record;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 SELECT * INTO auth_user FROM auth.users WHERE id=u;
 IF auth_user.id IS NULL THEN RAISE EXCEPTION 'Аккаунт недоступен'; END IF;
 IF octet_length(payload::text)>40000 THEN RAISE EXCEPTION 'Слишком много данных'; END IF;
 INSERT INTO public.profile_preferences(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 IF action='get' THEN
  -- Reminders are generated when the inbox is opened and by the maintenance job.
  PERFORM public.profile_generate_reminders();
  RETURN jsonb_build_object(
   'preferences',(SELECT to_jsonb(p) FROM public.profile_preferences p WHERE user_id=u),
   'created_at',auth_user.created_at,'email_confirmed',auth_user.email_confirmed_at IS NOT NULL,
   'phone_confirmed',auth_user.phone_confirmed_at IS NOT NULL,'auth_phone',auth_user.phone,
   'restriction',(SELECT jsonb_build_object('reason',restriction_reason,'until',restriction_until) FROM public.profiles WHERE id=u),
   'registrations',COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('activity',(SELECT to_jsonb(a) - 'invite_code' FROM public.activities a WHERE a.id=r.activity_id)) ORDER BY r.created_at DESC) FROM public.registrations r WHERE r.user_id=u),'[]'),
   'reviews',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'rating',v.rating,'comment',v.comment,'created_at',v.created_at,'reviewer',COALESCE(p.name,'Участник'),'activity_id',a.id,'activity_title',a.title,'sport',a.sport,'as_host',a.manager_id=u OR a.organizer_id=u) ORDER BY v.created_at DESC) FROM public.reviews v LEFT JOIN public.profiles p ON p.id=v.reviewer_id JOIN public.activities a ON a.id=v.activity_id WHERE v.reviewed_user_id=u),'[]'),
   'applications',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.manager_applications a WHERE a.user_id=u),'[]'),
   'notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (SELECT * FROM public.profile_notifications WHERE user_id=u ORDER BY created_at DESC LIMIT 200) n),'[]'),
   'tickets',COALESCE((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('messages',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at) FROM public.support_messages m WHERE m.ticket_id=t.id),'[]')) ORDER BY t.updated_at DESC) FROM public.support_tickets t WHERE t.user_id=u),'[]'),
   'host_stats',(SELECT jsonb_build_object('total',count(*),'completed',count(*) FILTER(WHERE status='completed'),'cancelled',count(*) FILTER(WHERE status='cancelled'),'participants',COALESCE(sum(registered_count),0)) FROM public.activities WHERE manager_id=u OR organizer_id=u)
  );
 ELSIF action='basic' THEN
  IF length(trim(payload->>'name')) NOT BETWEEN 2 AND 80 OR length(payload->>'bio')>600 OR length(payload->>'district')>80 OR length(trim(payload->>'city')) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Проверьте имя, город и описание'; END IF;
  UPDATE public.profiles SET name=trim(payload->>'name'), city=trim(payload->>'city') WHERE id=u;
  UPDATE public.profile_preferences SET bio=payload->>'bio',district=payload->>'district',updated_at=now() WHERE user_id=u;
 ELSIF action='sports' THEN
  IF jsonb_typeof(payload->'skills')<>'array' OR jsonb_array_length(payload->'skills')>10 THEN RAISE EXCEPTION 'Некорректные виды спорта'; END IF;
  FOR skill_row IN SELECT * FROM jsonb_array_elements(payload->'skills') LOOP
   IF skill_row.value->>'sport' NOT IN ('Футбол','Мини-футбол','Баскетбол','Волейбол') OR skill_row.value->>'level' NOT IN ('beginner','amateur','experienced','advanced') OR length(skill_row.value->>'position')>40 THEN RAISE EXCEPTION 'Проверьте спортивный профиль'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'days') d WHERE d::int NOT BETWEEN 0 AND 6) OR (payload->>'time_from')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (payload->>'time_to')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (payload->>'time_from') >= (payload->>'time_to') THEN RAISE EXCEPTION 'Проверьте дни и время'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'event_types') v WHERE v NOT IN ('daily_game','tournament','league')) THEN RAISE EXCEPTION 'Некорректный формат'; END IF;
  UPDATE public.profile_preferences SET skills=payload->'skills',days=ARRAY(SELECT value::int FROM jsonb_array_elements_text(payload->'days')),time_from=payload->>'time_from',time_to=payload->>'time_to',event_types=ARRAY(SELECT jsonb_array_elements_text(payload->'event_types')),updated_at=now() WHERE user_id=u;
  UPDATE public.profiles SET sports=ARRAY(SELECT DISTINCT value->>'sport' FROM jsonb_array_elements(payload->'skills')) WHERE id=u;
 ELSIF action='privacy' THEN
  IF jsonb_typeof(payload->'bio')<>'boolean' OR jsonb_typeof(payload->'sports')<>'boolean' OR jsonb_typeof(payload->'stats')<>'boolean' THEN RAISE EXCEPTION 'Некорректные настройки'; END IF;
  UPDATE public.profile_preferences SET privacy=jsonb_build_object('bio',payload->'bio','sports',payload->'sports','stats',payload->'stats'),updated_at=now() WHERE user_id=u;
 ELSIF action='notifications' THEN
  IF (payload->>'reminder')::int NOT IN (0,30,60,180,1440) THEN RAISE EXCEPTION 'Некорректное время напоминания'; END IF;
  FOREACH body IN ARRAY ARRAY['games','payments','applications','support','host','recommendations'] LOOP
   IF jsonb_typeof(payload->body)<>'boolean' THEN RAISE EXCEPTION 'Некорректные настройки уведомлений'; END IF;
  END LOOP;
  UPDATE public.profile_preferences SET notifications=payload,updated_at=now() WHERE user_id=u;
 ELSIF action='read' THEN
  UPDATE public.profile_notifications SET read_at=now() WHERE user_id=u AND read_at IS NULL AND (payload->>'id' IS NULL OR id=(payload->>'id')::uuid);
 ELSIF action='host' THEN
  IF NOT (public.has_role(u,'sports_manager') OR public.has_role(u,'tournament_organizer') OR public.is_admin()) THEN RAISE EXCEPTION 'Сначала получите роль организатора'; END IF;
  IF length(payload->>'host_name')>80 OR length(payload->>'host_bio')>1000 THEN RAISE EXCEPTION 'Слишком длинное описание'; END IF;
  IF COALESCE(payload->>'kaspi','')<>'' AND (payload->>'kaspi')!~'^https://pay\.kaspi\.kz/pay/[A-Za-z0-9/_?=&%.-]+$' THEN RAISE EXCEPTION 'Укажите ссылку pay.kaspi.kz'; END IF;
  UPDATE public.profile_preferences SET host_name=trim(payload->>'host_name'),host_bio=trim(payload->>'host_bio') WHERE user_id=u;
  UPDATE public.profiles SET kaspi_payment_link=NULLIF(payload->>'kaspi','') WHERE id=u;
 ELSIF action IN ('ticket','reply','moderate') THEN
  body:=trim(payload->>'body');
  IF length(body) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Напишите сообщение (до 4000 символов)'; END IF;
  attachments:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(payload->'attachments','[]')));
  IF cardinality(attachments)>3 OR EXISTS(SELECT 1 FROM unnest(attachments) a WHERE a NOT LIKE u::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='support' AND o.name=a)) THEN RAISE EXCEPTION 'Некорректное вложение'; END IF;
  IF action='ticket' THEN
   IF length(trim(payload->>'subject')) NOT BETWEEN 3 AND 120 OR length(body)<10 THEN RAISE EXCEPTION 'Укажите тему и описание (от 10 символов)'; END IF;
   IF (SELECT count(*) FROM public.support_tickets WHERE user_id=u AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'Слишком много обращений. Попробуйте позже'; END IF;
   rid:=NULLIF(payload->>'registration_id','')::uuid;
   IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.registrations WHERE id=rid AND user_id=u) THEN RAISE EXCEPTION 'Запись недоступна'; END IF;
   IF NULLIF(payload->>'review_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reviews WHERE id=(payload->>'review_id')::uuid AND reviewed_user_id=u) THEN RAISE EXCEPTION 'Отзыв недоступен'; END IF;
   INSERT INTO public.support_tickets(user_id,topic,subject,registration_id,review_id) VALUES(u,payload->>'topic',trim(payload->>'subject'),rid,NULLIF(payload->>'review_id','')::uuid) RETURNING * INTO _ticket;
  ELSE
   SELECT * INTO _ticket FROM public.support_tickets WHERE id=(payload->>'id')::uuid FOR UPDATE;
   IF _ticket.id IS NULL OR (_ticket.user_id<>u AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Обращение недоступно'; END IF;
   IF action='moderate' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Только для администратора'; END IF;
   IF action='moderate' THEN
    IF payload->>'resolution'='correct_attendance' THEN
     IF _ticket.topic<>'attendance' OR _ticket.registration_id IS NULL THEN RAISE EXCEPTION 'Нет отметки для исправления'; END IF;
     UPDATE public.registrations SET status='attended' WHERE id=_ticket.registration_id AND user_id=_ticket.user_id;
    ELSIF payload->>'resolution'='remove_review' THEN
     IF _ticket.topic<>'review' OR _ticket.review_id IS NULL THEN RAISE EXCEPTION 'Отзыв не найден'; END IF;
     DELETE FROM public.reviews WHERE id=_ticket.review_id AND reviewed_user_id=_ticket.user_id;
    END IF;
    UPDATE public.support_tickets SET status=payload->>'status',updated_at=now() WHERE id=_ticket.id;
   ELSE UPDATE public.support_tickets SET status='submitted',updated_at=now() WHERE id=_ticket.id;
   END IF;
  END IF;
  INSERT INTO public.support_messages(ticket_id,author_id,is_staff,body,attachments) VALUES(_ticket.id,u,action='moderate',body,attachments);
  IF action='moderate' THEN PERFORM public.profile_notify(_ticket.user_id,'support','Ответ поддержки','Обращение №'||_ticket.number,'/profile?tab=help&ticket='||_ticket.id); END IF;
  RETURN jsonb_build_object('ok',true,'id',_ticket.id);
 ELSIF action='admin_tickets' THEN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Доступ запрещён'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('name',(SELECT name FROM public.profiles WHERE id=t.user_id),'messages',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at) FROM public.support_messages m WHERE ticket_id=t.id),'[]')) ORDER BY t.updated_at DESC) FROM public.support_tickets t),'[]');
 ELSIF action='export' THEN
  RETURN jsonb_build_object('exported_at',now(),'profile',(SELECT to_jsonb(p)-'admin_notes' FROM public.profiles p WHERE id=u),'workspace',public.profile_workspace('get','{}'),'written_reviews',COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.reviews v WHERE reviewer_id=u),'[]'),'disputes',COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.disputes d WHERE user_id=u),'[]'),'payment_history',COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM public.payment_status_history h JOIN public.registrations r ON r.id=h.registration_id WHERE r.user_id=u),'[]'));
 ELSE RAISE EXCEPTION 'Неизвестное действие';
 END IF;
 RETURN '{"ok":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.profile_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_workspace(text,jsonb) TO authenticated;

CREATE FUNCTION public.profile_generate_reminders() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 FOR r IN SELECT reg.user_id,a.id,a.title,a.date_time,COALESCE((p.notifications->>'reminder')::int,60) minutes
 FROM public.registrations reg JOIN public.activities a ON a.id=reg.activity_id LEFT JOIN public.profile_preferences p ON p.user_id=reg.user_id
 WHERE reg.status='registered' AND a.status IN ('open','nearly_full','full') AND a.date_time>now()
 AND a.date_time<=now()+make_interval(mins=>COALESCE((p.notifications->>'reminder')::int,60))
 AND (auth.uid() IS NULL OR reg.user_id=auth.uid()) LOOP
  PERFORM public.profile_notify(r.user_id,'games','Скоро игра',r.title,'/activity/'||r.id,'reminder:'||r.user_id||':'||r.id||':'||r.date_time);
 END LOOP;
 FOR r IN SELECT p.user_id, pick.id, pick.title FROM public.profile_preferences p
 JOIN public.profiles owner ON owner.id=p.user_id
 CROSS JOIN LATERAL (SELECT a.id,a.title FROM public.activities a WHERE NOT a.is_private AND a.status IN ('open','nearly_full') AND a.date_time>now() AND a.city=owner.city AND (cardinality(owner.sports)=0 OR a.sport=ANY(owner.sports)) AND NOT EXISTS(SELECT 1 FROM public.registrations reg WHERE reg.user_id=p.user_id AND reg.activity_id=a.id) AND NOT EXISTS(SELECT 1 FROM public.profile_notifications n WHERE n.dedupe='recommendation:'||p.user_id||':'||a.id) ORDER BY a.date_time LIMIT 1) pick
 WHERE (p.notifications->>'recommendations')::boolean=true AND (auth.uid() IS NULL OR p.user_id=auth.uid()) AND NOT EXISTS(SELECT 1 FROM public.profile_notifications n WHERE n.user_id=p.user_id AND n.category='recommendations' AND n.created_at>now()-interval '24 hours') LOOP
  PERFORM public.profile_notify(r.user_id,'recommendations','Игра по вашим интересам',r.title,'/activity/'||r.id,'recommendation:'||r.user_id||':'||r.id);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.profile_generate_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profile_generate_reminders() TO service_role;
-- Synchronise confirmed identity data. Never infer verification from a nonempty address.
CREATE FUNCTION public.sync_profile_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.profiles SET email=NEW.email, verified=(NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL) WHERE id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_profile_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_profile_identity AFTER UPDATE OF email,email_confirmed_at,phone_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.sync_profile_identity();
UPDATE public.profiles p SET verified=(u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL),email=u.email FROM auth.users u WHERE p.id=u.id;

CREATE FUNCTION public.profile_sessions(action text DEFAULT 'list',session_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); current_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF action='list' THEN
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'user_agent',s.user_agent,'created_at',s.created_at,'last_active',COALESCE(s.refreshed_at,s.updated_at,s.created_at),'current',s.id=current_session) ORDER BY s.created_at DESC) FROM auth.sessions s WHERE s.user_id=u AND (s.not_after IS NULL OR s.not_after>now())),'[]');
 ELSIF action='revoke' THEN
  IF session_id=current_session THEN RAISE EXCEPTION 'Для текущего устройства используйте «Выйти»'; END IF;
  DELETE FROM auth.sessions WHERE id=session_id AND user_id=u;
 ELSE RAISE EXCEPTION 'Неизвестное действие'; END IF;
 RETURN '{"ok":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.profile_sessions(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_sessions(text,uuid) TO authenticated;

CREATE FUNCTION public.profile_deletion_check() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); blockers text[]:='{}';
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF EXISTS(SELECT 1 FROM public.registrations r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=u AND r.status='registered' AND a.status NOT IN ('completed','cancelled')) THEN blockers:=array_append(blockers,'Завершите или отмените активные записи на игры'); END IF;
 IF EXISTS(SELECT 1 FROM public.registrations r JOIN public.activities a ON a.id=r.activity_id WHERE r.user_id=u AND NOT a.is_free AND (r.payment_status='needs_review' OR (r.payment_status='paid' AND (a.status='cancelled' OR r.status='cancelled')))) THEN blockers:=array_append(blockers,'Дождитесь проверки оплаты или завершения возврата'); END IF;
 IF EXISTS(SELECT 1 FROM public.activities WHERE (manager_id=u OR organizer_id=u) AND status NOT IN ('completed','cancelled')) THEN blockers:=array_append(blockers,'Завершите события, которые вы организуете'); END IF;
 IF EXISTS(SELECT 1 FROM public.support_tickets WHERE user_id=u AND status<>'resolved' AND topic<>'deletion') OR EXISTS(SELECT 1 FROM public.disputes WHERE user_id=u AND status='open') THEN blockers:=array_append(blockers,'Дождитесь решения открытых обращений и споров'); END IF;
 IF public.has_role(u,'admin') AND (SELECT count(*) FROM public.user_roles WHERE role='admin')<=1 THEN blockers:=array_append(blockers,'Передайте роль администратора другому пользователю'); END IF;
 RETURN jsonb_build_object('allowed',cardinality(blockers)=0,'blockers',blockers);
END $$;
REVOKE ALL ON FUNCTION public.profile_deletion_check() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_deletion_check() TO authenticated;
CREATE FUNCTION public.profile_preferences_for_feed() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('city',p.city,'sports',p.sports,'days',COALESCE(s.days,'{}'),'time_from',COALESCE(s.time_from,'18:00'),'time_to',COALESCE(s.time_to,'22:00'),'event_types',COALESCE(s.event_types,'{}')) FROM public.profiles p LEFT JOIN public.profile_preferences s ON s.user_id=p.id WHERE p.id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.profile_preferences_for_feed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.profile_preferences_for_feed() TO authenticated;
-- Counters and restrictions cannot be forged by updating the profile directly.
CREATE FUNCTION public.protect_profile_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND pg_trigger_depth()=1 THEN
  IF NEW.account_status IS DISTINCT FROM OLD.account_status OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes OR NEW.restriction_reason IS DISTINCT FROM OLD.restriction_reason OR NEW.restriction_until IS DISTINCT FROM OLD.restriction_until OR NEW.rating IS DISTINCT FROM OLD.rating OR NEW.rating_count IS DISTINCT FROM OLD.rating_count OR NEW.reliability_rating IS DISTINCT FROM OLD.reliability_rating OR NEW.no_show_count IS DISTINCT FROM OLD.no_show_count OR NEW.cancellation_count IS DISTINCT FROM OLD.cancellation_count OR NEW.dispute_count IS DISTINCT FROM OLD.dispute_count THEN RAISE EXCEPTION 'Показатели профиля изменяются только по результатам событий'; END IF;
  NEW.verified:=(SELECT email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL FROM auth.users WHERE id=NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_profile_state() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_profile_state BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_state();

CREATE FUNCTION public.guard_profile_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() THEN RETURN NEW; END IF;
 IF NEW.reviewer_id<>auth.uid() OR NEW.reviewer_id=NEW.reviewed_user_id OR NOT EXISTS(SELECT 1 FROM public.activities a WHERE a.id=NEW.activity_id AND a.status='completed') THEN RAISE EXCEPTION 'Отзыв доступен после завершённого события'; END IF;
 IF NOT (public.is_activity_host(NEW.activity_id,NEW.reviewer_id) OR EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=NEW.activity_id AND user_id=NEW.reviewer_id AND status='attended')) OR NOT (public.is_activity_host(NEW.activity_id,NEW.reviewed_user_id) OR EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=NEW.activity_id AND user_id=NEW.reviewed_user_id AND status='attended')) THEN RAISE EXCEPTION 'Оценивать можно только участников своего события'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_profile_review BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.guard_profile_review();

CREATE FUNCTION public.guard_registration_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE free_game boolean;
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() OR public.is_activity_host(NEW.activity_id,auth.uid()) THEN RETURN NEW; END IF;
 IF NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Запись недоступна'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT is_free INTO free_game FROM public.activities WHERE id=NEW.activity_id;
  IF NEW.status<>'registered' OR NEW.payment_status<>(CASE WHEN free_game THEN 'paid'::public.payment_status ELSE 'pending'::public.payment_status END) THEN RAISE EXCEPTION 'Некорректный статус новой записи'; END IF;
 ELSE
  IF NEW.activity_id<>OLD.activity_id OR NEW.user_id<>OLD.user_id OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN RAISE EXCEPTION 'Подтверждение доступно организатору'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='registered' AND NEW.status='cancelled') THEN RAISE EXCEPTION 'Отметку участия меняет организатор'; END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NOT(OLD.payment_status IN ('pending','rejected','needs_review') AND NEW.payment_status='needs_review' AND OLD.status='registered') THEN RAISE EXCEPTION 'Статус оплаты меняет организатор'; END IF;
  NEW.cancelled_at:=OLD.cancelled_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_registration_state() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_registration_state BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_registration_state();
CREATE FUNCTION public.guard_host_application() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() THEN RETURN NEW; END IF;
 IF NEW.user_id<>auth.uid() OR NEW.requested_role NOT IN ('sports_manager','tournament_organizer') OR NEW.status<>'pending' OR NEW.admin_notes IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Некорректная заявка'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.user_id AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Подтвердите контакт'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND account_status='active' AND length(trim(name))>=2 AND phone IS NOT NULL) THEN RAISE EXCEPTION 'Заполните профиль и проверьте статус аккаунта'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));
 IF EXISTS(SELECT 1 FROM public.manager_applications WHERE user_id=NEW.user_id AND status='pending') OR public.has_role(NEW.user_id,NEW.requested_role) THEN RAISE EXCEPTION 'Роль уже активна или заявка рассматривается'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_host_application() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_host_application BEFORE INSERT ON public.manager_applications FOR EACH ROW EXECUTE FUNCTION public.guard_host_application();
