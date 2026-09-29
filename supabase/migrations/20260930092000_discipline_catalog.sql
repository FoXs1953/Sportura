CREATE TABLE public.disciplines(id text PRIMARY KEY,name text UNIQUE NOT NULL,kind text NOT NULL CHECK(kind IN ('sport','esport')),team_min integer NOT NULL,team_max integer NOT NULL,rules_template text NOT NULL);
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
CREATE POLICY disciplines_read ON public.disciplines FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.disciplines TO anon,authenticated;
INSERT INTO public.disciplines VALUES
('football','Футбол','sport',11,18,'11×11, 2 тайма по 45 минут. Замены и пенальти — по регламенту. Судья обязателен.'),
('futsal','Мини-футбол','sport',5,12,'5×5, 2 тайма по 20 минут, летучие замены. Укажите зал или открытую площадку.'),
('basketball','Баскетбол','sport',5,12,'5×5, 4 периода по 10 минут, овертайм 5 минут.'),
('basketball3','Баскетбол 3×3','sport',3,4,'3×3, 10 минут или до 21 очка, 1 запасной.'),
('volleyball','Волейбол','sport',6,12,'6×6, до 3 выигранных сетов. Сет до 25, решающий до 15.'),
('beach','Пляжный волейбол','sport',2,2,'2×2, до 2 выигранных сетов. Сет до 21, решающий до 15.'),
('cs2','CS2','esport',5,6,'5×5 + запасной. Укажите пул карт, BO1/BO3/BO5, вето, регион, античит. Обязательны demo и скриншот результата.'),
('dota2','Dota 2','esport',5,6,'5×5, Captains Mode. Укажите BO1/BO3/BO5, регион сервера, правила пауз и переигровки.'),
('pubgm','PUBG Mobile','esport',4,4,'Сквад из 4 игроков. Укажите карты, число матчей и очки за место и киллы. Формат battle royale требует отдельного подсчёта результатов.'),
('mlbb','Mobile Legends','esport',5,6,'5×5, Draft Pick, BO3, финал BO5. Укажите правила банов и пауз.'),
('eafc','EA FC','esport',1,1,'1×1, тайм 6 минут. Укажите платформу, кроссплей, допустимые составы и правила дисконнекта. Скриншот результата обязателен.');
ALTER TABLE public.activities ADD COLUMN tier text CHECK(tier IN ('spark','blitz')), ADD COLUMN competition_format text NOT NULL DEFAULT 'single_elimination' CHECK(competition_format IN ('single_elimination','round_robin')), ADD COLUMN min_participants integer NOT NULL DEFAULT 2 CHECK(min_participants BETWEEN 2 AND 200), ADD COLUMN team_min integer NOT NULL DEFAULT 1 CHECK(team_min BETWEEN 1 AND 50), ADD COLUMN team_max integer NOT NULL DEFAULT 50 CHECK(team_max BETWEEN 1 AND 50), ADD COLUMN discipline_id text REFERENCES public.disciplines(id);
UPDATE public.activities SET competition_format='round_robin' WHERE type='league';
UPDATE public.activities a SET discipline_id=d.id FROM public.disciplines d WHERE d.name=a.sport;
ALTER TABLE public.activities ADD CONSTRAINT team_limits CHECK(team_max>=team_min);
CREATE OR REPLACE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  IF NOT EXISTS(SELECT 1 FROM public.disciplines WHERE name=vals->>'sport') OR COALESCE(vals->>'city','') NOT IN ('Астана','Алматы','Шымкент','Караганда') OR length(COALESCE(vals->>'description',''))>3000 OR length(COALESCE(vals->>'rules',''))>4000 OR length(COALESCE(vals->>'cover_url',''))>2000 OR (COALESCE(vals->>'cover_url','')<>'' AND vals->>'cover_url' !~ '^https://') THEN RAISE EXCEPTION 'Проверьте город, спорт, описание и обложку'; END IF;
  IF NULLIF(vals->>'registration_deadline','') IS NOT NULL AND (vals->>'registration_deadline')::timestamptz>(vals->>'date_time')::timestamptz THEN RAISE EXCEPTION 'Регистрация должна завершиться до начала'; END IF;
  IF COALESCE(vals->>'two_gis_url','')<>'' AND vals->>'two_gis_url' !~ '^https://(2gis\.kz|go\.2gis\.com)/' THEN RAISE EXCEPTION 'Проверьте ссылку 2GIS'; END IF;
  IF (vals->>'entry_fee')::numeric>0 AND (vals->>'kaspi_payment_link' IS NULL OR vals->>'kaspi_payment_link' !~ '^https://pay\.kaspi\.kz/pay/') THEN RAISE EXCEPTION 'Для платного события укажите ссылку Kaspi'; END IF;
  IF (vals->>'entry_fee')::numeric>0 AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Подтвердите контакт'; END IF;
  IF vals->>'type'<>'daily_game' THEN
   IF COALESCE(vals->>'tier',CASE WHEN (vals->>'entry_fee')::numeric=0 THEN 'spark' ELSE 'blitz' END) NOT IN ('spark','blitz') THEN RAISE EXCEPTION 'Выберите Spark или Blitz'; END IF;
   IF vals->>'tier'='spark' AND (vals->>'entry_fee')::numeric>0 THEN RAISE EXCEPTION 'Spark всегда бесплатный'; END IF;
   IF COALESCE((vals->>'min_participants')::integer,2)>(vals->>'max_participants')::integer OR (vals->>'max_participants')::integer>32 THEN RAISE EXCEPTION 'Для первого этапа доступны соревнования до 32 участников'; END IF;
   IF vals->>'sport'='PUBG Mobile' THEN RAISE EXCEPTION 'Battle royale пока доступен как обычная игра без турнирной сетки'; END IF;
  END IF;
  IF doc.activity_id IS NOT NULL THEN
   SELECT * INTO a FROM public.activities WHERE id=doc.activity_id FOR UPDATE;
   IF NOT public.is_activity_host(a.id,u) OR a.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Редактирование недоступно'; END IF;
   UPDATE public.activities SET cover_url=NULLIF(vals->>'cover_url',''),title=trim(vals->>'title'),description=vals->>'description',sport=vals->>'sport',city=vals->>'city',district=COALESCE(vals->>'district',''),location_text=vals->>'location_text',two_gis_url=NULLIF(vals->>'two_gis_url',''),date_time=(vals->>'date_time')::timestamptz,time_text=NULL,duration_minutes=(vals->>'duration_minutes')::integer,registration_deadline=NULLIF(vals->>'registration_deadline','')::timestamptz,entry_fee=(vals->>'entry_fee')::numeric,price_text=NULL,is_free=(vals->>'entry_fee')::numeric=0,max_participants=(vals->>'max_participants')::integer,skill_level=vals->>'skill_level',cancellation_policy=vals->>'cancellation_policy',notes=vals->>'notes',rules=COALESCE(vals->>'rules',''),venue_type=COALESCE(vals->>'venue_type','unknown'),kaspi_payment_link=NULLIF(vals->>'kaspi_payment_link',''),participation_mode=COALESCE(vals->>'participation_mode','individual') WHERE id=a.id RETURNING * INTO a;
  ELSE
   INSERT INTO public.activities(cover_url,title,type,manager_id,organizer_id,host_name,sport,city,district,location_text,two_gis_url,date_time,duration_minutes,registration_deadline,entry_fee,is_free,max_participants,skill_level,cancellation_policy,notes,rules,venue_type,kaspi_payment_link,payment_mode,participation_mode,is_private,invite_code,description,prize_pool,commission_percent)
   VALUES(NULLIF(vals->>'cover_url',''),trim(vals->>'title'),(vals->>'type')::public.activity_type,CASE WHEN vals->>'type'='daily_game' THEN u END,CASE WHEN vals->>'type'<>'daily_game' THEN u END,(SELECT COALESCE(NULLIF(pp.host_name,''),p.name) FROM public.profiles p LEFT JOIN public.profile_preferences pp ON pp.user_id=p.id WHERE p.id=u),vals->>'sport',vals->>'city',COALESCE(vals->>'district',''),vals->>'location_text',NULLIF(vals->>'two_gis_url',''),(vals->>'date_time')::timestamptz,(vals->>'duration_minutes')::integer,NULLIF(vals->>'registration_deadline','')::timestamptz,(vals->>'entry_fee')::numeric,(vals->>'entry_fee')::numeric=0,(vals->>'max_participants')::integer,vals->>'skill_level',vals->>'cancellation_policy',vals->>'notes',COALESCE(vals->>'rules',''),COALESCE(vals->>'venue_type','unknown'),NULLIF(vals->>'kaspi_payment_link',''),'MANAGER_DIRECT',COALESCE(vals->>'participation_mode','individual'),COALESCE((vals->>'is_private')::boolean,false),CASE WHEN COALESCE((vals->>'is_private')::boolean,false) THEN replace(gen_random_uuid()::text,'-','') END,vals->>'description','{"1":100}',10) RETURNING * INTO a;
  END IF;
  IF vals ? 'prize_pool' AND vals->'prize_pool' NOT IN ('{"1":100}'::jsonb,'{"1":60,"2":30,"3":10}'::jsonb,'{"1":50,"2":25,"3":15,"4":10}'::jsonb) THEN RAISE EXCEPTION 'Выберите шаблон призов'; END IF;
  UPDATE public.activities SET prize_pool=COALESCE(vals->'prize_pool',prize_pool) WHERE id=a.id;
  UPDATE public.activities SET discipline_id=(SELECT id FROM public.disciplines WHERE name=vals->>'sport'),tier=CASE WHEN type='daily_game' THEN NULL ELSE COALESCE(vals->>'tier',CASE WHEN entry_fee=0 THEN 'spark' ELSE 'blitz' END) END,competition_format=CASE WHEN type='league' THEN 'round_robin' ELSE COALESCE(vals->>'competition_format','single_elimination') END,min_participants=COALESCE((vals->>'min_participants')::integer,2),team_min=COALESCE((vals->>'team_min')::integer,1),team_max=COALESCE((vals->>'team_max')::integer,50) WHERE id=a.id;
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
  IF a.participation_mode='team' AND (jsonb_array_length(payload->'team_members') NOT BETWEEN a.team_min AND a.team_max OR (SELECT count(*) FROM jsonb_array_elements_text(payload->'team_members'))<>(SELECT count(DISTINCT lower(trim(x))) FROM jsonb_array_elements_text(payload->'team_members') x)) THEN RAISE EXCEPTION 'Проверьте размер состава и повторяющиеся имена'; END IF;
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
CREATE OR REPLACE FUNCTION public.event_competition(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); aid uuid:=(payload->>'activity_id')::uuid; a public.activities; m public.event_matches; ids uuid[]; i integer; j integer; n integer; roundno integer; pos integer; winner uuid; reason text:=trim(COALESCE(payload->>'reason','')); item record; r public.registrations; starts timestamptz; duration integer; result jsonb; fund numeric; allocated numeric:=0; amount numeric; placement integer; selected uuid;
BEGIN
 IF u IS NULL OR NOT(public.is_activity_host(aid,u) OR public.is_admin()) THEN RAISE EXCEPTION 'Соревнование недоступно'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF a.type='daily_game' OR a.status='cancelled' THEN RAISE EXCEPTION 'Это не действующее соревнование'; END IF;
 IF action='generate' THEN
  IF EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN RAISE EXCEPTION 'Расписание уже создано'; END IF;
  SELECT array_agg(id ORDER BY created_at,id) INTO ids FROM public.registrations WHERE activity_id=aid AND status IN ('registered','attended');
  n:=cardinality(ids);
  IF n IS NULL OR n<a.min_participants OR n>32 THEN RAISE EXCEPTION 'Для сетки нужно от 2 до 32 команд или участников'; END IF;
  IF a.competition_format='round_robin' THEN
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
  IF a.competition_format<>'single_elimination' THEN RAISE EXCEPTION 'Следующий раунд доступен для турнира'; END IF;
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
  IF a.competition_format='single_elimination' AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND round>m.round) AND ((payload->>'home_score')::integer IS DISTINCT FROM m.home_score OR (payload->>'away_score')::integer IS DISTINCT FROM m.away_score) THEN RAISE EXCEPTION 'Результат связан со следующим раундом. Исправление требует обращения в поддержку'; END IF;
  starts:=NULLIF(payload->>'starts_at','')::timestamptz;duration:=COALESCE((payload->>'duration_minutes')::integer,60);
  IF duration NOT BETWEEN 5 AND 600 THEN RAISE EXCEPTION 'Проверьте длительность матча'; END IF;
  IF starts IS NOT NULL AND EXISTS(SELECT 1 FROM public.event_matches x WHERE x.activity_id=aid AND x.id<>m.id AND x.starts_at IS NOT NULL AND (x.home_id IN (m.home_id,m.away_id) OR x.away_id IN (m.home_id,m.away_id) OR (length(trim(COALESCE(payload->>'location','')))>0 AND x.location=payload->>'location')) AND tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.duration_minutes),'[)') && tstzrange(starts,starts+make_interval(mins=>duration),'[)')) THEN RAISE EXCEPTION 'Команда или площадка уже занята в это время'; END IF;
  winner:=CASE WHEN (payload->>'home_score')::integer>(payload->>'away_score')::integer THEN m.home_id WHEN (payload->>'away_score')::integer>(payload->>'home_score')::integer THEN m.away_id ELSE CASE WHEN a.competition_format='single_elimination' AND payload->>'home_score' IS NOT NULL THEN NULLIF(payload->>'winner_id','')::uuid END END;
  IF winner IS NOT NULL AND winner NOT IN (m.home_id,m.away_id) THEN RAISE EXCEPTION 'Победитель не участвует в матче'; END IF;
  IF a.competition_format='single_elimination' AND payload->>'home_score' IS NOT NULL AND winner IS NULL THEN RAISE EXCEPTION 'При равном счёте выберите победителя по дополнительному правилу'; END IF;
  UPDATE public.event_matches SET starts_at=starts,duration_minutes=duration,location=left(COALESCE(payload->>'location',''),200),home_score=(payload->>'home_score')::integer,away_score=(payload->>'away_score')::integer,winner_id=winner,updated_at=now() WHERE id=m.id;
  -- Published results must be explicitly republished after corrections.
  IF a.results_submitted_at IS NOT NULL THEN UPDATE public.activities SET results_submitted_at=NULL WHERE id=aid; END IF;
  PERFORM public.event_log(aid,NULL,'Матч изменён',jsonb_build_object('match',m.id,'home_score',payload->'home_score','away_score',payload->'away_score','reason',reason));
 ELSIF action='publish_results' THEN
  IF a.results_submitted_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  IF a.date_time>now() THEN RAISE EXCEPTION 'Соревнование ещё не началось'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid AND home_score IS NULL) THEN RAISE EXCEPTION 'Заполните все результаты'; END IF;
  IF a.competition_format='single_elimination' THEN
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
  SELECT round(COALESCE(sum(COALESCE(amount_due,0)) FILTER(WHERE payment_status='paid' AND status NOT IN ('cancelled','rejected')),0)*(1-a.commission_percent/100),2) INTO fund FROM public.registrations WHERE activity_id=aid;
  IF a.prize_pool NOT IN ('{"1":100}'::jsonb,'{"1":60,"2":30,"3":10}'::jsonb,'{"1":50,"2":25,"3":15,"4":10}'::jsonb) THEN RAISE EXCEPTION 'Некорректный шаблон призов'; END IF;
  SELECT count(*) INTO n FROM jsonb_object_keys(a.prize_pool);
  IF n>1 AND length(reason)<3 THEN RAISE EXCEPTION 'Укажите основание распределения призовых мест'; END IF;
  FOR placement IN 1..n LOOP
   selected:=CASE WHEN placement=1 THEN winner ELSE NULLIF(payload->'placements'->>placement::text,'')::uuid END;
   SELECT * INTO r FROM public.registrations WHERE id=selected AND activity_id=aid AND status IN ('registered','attended');
   IF r.id IS NULL OR EXISTS(SELECT 1 FROM public.results WHERE activity_id=aid AND user_id=r.user_id) THEN RAISE EXCEPTION 'Выберите разных участников для каждого призового места'; END IF;
   amount:=CASE WHEN placement=n THEN fund-allocated ELSE round(fund*(a.prize_pool->>placement::text)::numeric/100,2) END;allocated:=allocated+amount;
   INSERT INTO public.results(activity_id,user_id,participant_name,placement,prize_amount) VALUES(aid,r.user_id,COALESCE(NULLIF(r.team_name,''),(SELECT name FROM public.profiles WHERE id=r.user_id)),placement,amount);
  END LOOP;
  UPDATE public.activities SET status='completed',results_submitted_at=now(),dispute_window_ends_at=now()+CASE WHEN a.tier IN ('spark','blitz') THEN interval '2 hours' ELSE interval '48 hours' END WHERE id=aid;
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
CREATE OR REPLACE FUNCTION public.competition_standings(aid uuid) RETURNS TABLE(registration_id uuid,name text,played bigint,won bigint,drawn bigint,lost bigint,scored bigint,conceded bigint,difference bigint,points bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scores AS (
 SELECT home_id id,home_score scored,away_score conceded FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL
 UNION ALL SELECT away_id,away_score,home_score FROM public.event_matches WHERE activity_id=aid AND home_score IS NOT NULL)
 SELECT r.id,COALESCE(NULLIF(r.team_name,''),p.name),count(s.id),count(s.id) FILTER(WHERE s.scored>s.conceded),count(s.id) FILTER(WHERE s.scored=s.conceded),count(s.id) FILTER(WHERE s.scored<s.conceded),COALESCE(sum(s.scored),0),COALESCE(sum(s.conceded),0),COALESCE(sum(s.scored-s.conceded),0),COALESCE(sum(CASE WHEN s.scored>s.conceded THEN a.win_points WHEN s.scored=s.conceded THEN a.draw_points ELSE 0 END),0)
 FROM public.registrations r JOIN public.profiles p ON p.id=r.user_id JOIN public.activities a ON a.id=r.activity_id LEFT JOIN scores s ON s.id=r.id WHERE r.activity_id=aid AND r.status IN ('registered','attended') GROUP BY r.id,p.name;
$$;
CREATE OR REPLACE FUNCTION public.guard_competition_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=OLD.id) AND (NEW.tier IS DISTINCT FROM OLD.tier OR NEW.competition_format<>OLD.competition_format OR NEW.team_min<>OLD.team_min OR NEW.team_max<>OLD.team_max OR NEW.discipline_id IS DISTINCT FROM OLD.discipline_id OR NEW.min_participants<>OLD.min_participants) THEN RAISE EXCEPTION 'После регистрации участников формат и состав зафиксированы'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_competition_configuration BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_competition_configuration();
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.profile_workspace_v1(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,$old$skill_row.value->>'sport' NOT IN ('Футбол','Мини-футбол','Баскетбол','Волейбол')$old$,$new$NOT EXISTS(SELECT 1 FROM public.disciplines WHERE name=skill_row.value->>'sport')$new$);
 EXECUTE definition;
END $$;
