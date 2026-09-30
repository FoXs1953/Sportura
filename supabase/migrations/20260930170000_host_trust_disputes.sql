ALTER TABLE public.activities DROP CONSTRAINT activities_duration_minutes_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_duration_minutes_check CHECK(duration_minutes BETWEEN 15 AND CASE WHEN type='league' THEN 100800 ELSE 10080 END);
CREATE TABLE public.organizer_partners(user_id uuid PRIMARY KEY REFERENCES public.profiles(id),approved_by uuid NOT NULL REFERENCES public.profiles(id),approved_at timestamptz NOT NULL DEFAULT now(),note text NOT NULL);
ALTER TABLE public.organizer_partners ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.organizer_trust(uid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH stats AS(SELECT count(*) done FROM public.activities a WHERE public.is_activity_host(a.id,uid) AND a.type<>'daily_game' AND a.status='completed' AND a.results_submitted_at IS NOT NULL AND a.dispute_window_ends_at<=now() AND NOT EXISTS(SELECT 1 FROM public.disputes d WHERE d.activity_id=a.id AND d.status IN ('open','approved'))), score AS(SELECT COALESCE(avg(r.rating),0) rating FROM public.reviews r WHERE r.reviewed_user_id=uid AND public.is_activity_host(r.activity_id,uid)), level AS(SELECT CASE WHEN EXISTS(SELECT 1 FROM public.organizer_partners WHERE user_id=uid) OR public.has_role(uid,'admin') THEN 'partner' WHEN stats.done>=3 AND score.rating>=4.5 THEN 'verified' ELSE 'novice' END name,stats.done,score.rating FROM stats,score) SELECT jsonb_build_object('level',name,'limit',CASE WHEN name='novice' THEN 32 ELSE 128 END,'completed',done,'rating',round(rating,2)) FROM level;
$$;
REVOKE ALL ON FUNCTION public.organizer_trust(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_trust(uuid) TO authenticated,service_role;
CREATE FUNCTION public.set_organizer_partner(uid uuid,enabled boolean,note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Нужны права администратора'; END IF;
 IF length(trim(note)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Укажите основание'; END IF;
 IF enabled THEN
  IF NOT public.has_role(uid,'tournament_organizer') THEN RAISE EXCEPTION 'Сначала одобрите роль организатора турниров'; END IF;
  INSERT INTO public.organizer_partners VALUES(uid,auth.uid(),now(),trim(note)) ON CONFLICT(user_id) DO UPDATE SET approved_by=auth.uid(),approved_at=now(),note=excluded.note;
 ELSE DELETE FROM public.organizer_partners WHERE user_id=uid; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_organizer_partner(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_organizer_partner(uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.guard_organizer_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE trust jsonb; uid uuid;
BEGIN
 IF NEW.type='daily_game' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.type=OLD.type AND NEW.max_participants<=OLD.max_participants THEN RETURN NEW; END IF;
 uid:=COALESCE(NEW.organizer_id,NEW.manager_id);trust:=public.organizer_trust(uid);
 IF NEW.max_participants>(trust->>'limit')::integer THEN RAISE EXCEPTION 'Лимит вашего уровня: % участников',trust->>'limit'; END IF;
 IF NEW.type='league' AND trust->>'level'<>'partner' THEN RAISE EXCEPTION 'Лиги доступны организаторам-партнёрам. Обратитесь в поддержку'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER organizer_limits BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_organizer_limit();
CREATE TABLE public.dispute_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dispute_id uuid NOT NULL REFERENCES public.disputes(id),author_id uuid NOT NULL REFERENCES public.profiles(id),body text NOT NULL CHECK(length(body) BETWEEN 3 AND 2000),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.guard_dispute_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities;
BEGIN
 IF auth.uid() IS NULL OR NEW.user_id<>auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.registrations WHERE activity_id=a.id AND user_id=auth.uid() AND status IN ('registered','attended','no_show')) THEN RAISE EXCEPTION 'Спор доступен участнику события'; END IF;
 IF a.results_submitted_at IS NULL OR a.dispute_window_ends_at IS NULL OR now()>a.dispute_window_ends_at THEN RAISE EXCEPTION 'Окно споров закрыто. Обратитесь в поддержку'; END IF;
 IF length(trim(NEW.reason)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Опишите спор: от 10 до 2000 символов'; END IF;
 IF EXISTS(SELECT 1 FROM public.disputes WHERE activity_id=a.id AND user_id=auth.uid() AND status='open') THEN RAISE EXCEPTION 'Открытый спор уже существует'; END IF;
 NEW.status:='open';NEW.admin_notes:=NULL;NEW.resolved_by:=NULL;NEW.resolved_at:=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_dispute BEFORE INSERT ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.guard_dispute_entry();
CREATE FUNCTION public.event_disputes(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid:=NULLIF(payload->>'activity_id','')::uuid; ident uuid:=NULLIF(payload->>'id','')::uuid; d public.disputes; host boolean; u uuid:=auth.uid(); msg text:=trim(payload->>'body');
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 IF action='list' THEN RETURN COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT entry.*,a.title,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,'from_host',public.is_activity_host(a.id,m.author_id) OR public.has_role(m.author_id,'admin')) ORDER BY m.created_at,m.id) FROM public.dispute_messages m WHERE m.dispute_id=entry.id),'[]') messages FROM public.disputes entry JOIN public.activities a ON a.id=entry.activity_id WHERE (aid IS NULL OR a.id=aid) AND (entry.user_id=u OR public.is_activity_host(a.id,u) OR public.is_admin()) ORDER BY entry.created_at DESC) x),'[]'); END IF;
 IF action='open' THEN
  INSERT INTO public.disputes(activity_id,user_id,reason) VALUES(aid,u,msg) RETURNING * INTO d;
  PERFORM public.profile_notify(COALESCE((SELECT organizer_id FROM public.activities WHERE id=aid),(SELECT manager_id FROM public.activities WHERE id=aid)),'host','Открыт спор','Участник просит проверить результат.','/host?tab=disputes','dispute:'||d.id);
  RETURN jsonb_build_object('id',d.id);
 END IF;
 SELECT * INTO d FROM public.disputes WHERE id=ident FOR UPDATE;
 host:=public.is_activity_host(d.activity_id,u) OR public.is_admin();
 IF d.id IS NULL OR NOT(host OR d.user_id=u) THEN RAISE EXCEPTION 'Спор недоступен'; END IF;
 IF d.status<>'open' THEN RAISE EXCEPTION 'Спор уже рассмотрен. Обратитесь в поддержку для обжалования'; END IF;
 IF msg IS NULL OR length(msg) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'Напишите сообщение: от 3 до 2000 символов'; END IF;
 IF action='resolve' THEN
  IF NOT host OR payload->>'status' NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Решение принимает организатор'; END IF;
  UPDATE public.disputes SET status=payload->>'status',admin_notes=msg,resolved_by=u,resolved_at=now() WHERE id=ident;
 ELSIF action<>'reply' THEN RAISE EXCEPTION 'Неизвестное действие'; END IF;
 INSERT INTO public.dispute_messages(dispute_id,author_id,body) VALUES(ident,u,msg);
 PERFORM public.profile_notify(CASE WHEN host THEN d.user_id ELSE COALESCE((SELECT organizer_id FROM public.activities WHERE id=d.activity_id),(SELECT manager_id FROM public.activities WHERE id=d.activity_id)) END,'support','Обновление спора',left(msg,150),'/activity/'||d.activity_id,'dispute-message:'||gen_random_uuid());
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.event_disputes(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_disputes(text,jsonb) TO authenticated;
DO $patch$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.event_competition_sports_base(text,jsonb)'::regprocedure);
 definition:=replace(definition,'CASE WHEN a.tier IN (''spark'',''blitz'') THEN interval ''2 hours'' ELSE interval ''48 hours'' END','CASE WHEN a.type=''league'' THEN interval ''24 hours'' WHEN a.tier=''marathon'' THEN interval ''12 hours'' ELSE interval ''2 hours'' END');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.event_workspace_v1(text,jsonb)'::regprocedure);
 definition:=replace(definition,'NOT BETWEEN 15 AND 10080','NOT BETWEEN 15 AND (CASE WHEN vals->>''type''=''league'' THEN 100800 ELSE 10080 END)');
 EXECUTE definition;
END $patch$;
