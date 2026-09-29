ALTER TABLE public.registrations ADD COLUMN game_nickname text NOT NULL DEFAULT '' CHECK(length(game_nickname)<=80), ADD COLUMN checked_in_at timestamptz;
CREATE TABLE public.teams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid UNIQUE NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,captain_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,name text NOT NULL);
CREATE TABLE public.team_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,position integer NOT NULL,display_name text NOT NULL,game_nickname text NOT NULL DEFAULT '',UNIQUE(team_id,position));
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.teams,public.team_members TO authenticated;
CREATE POLICY teams_read ON public.teams FOR SELECT TO authenticated USING(captain_id=auth.uid() OR public.is_staff() OR EXISTS(SELECT 1 FROM public.registrations r WHERE r.id=registration_id AND public.is_activity_host(r.activity_id,auth.uid())));
CREATE POLICY team_members_read ON public.team_members FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.teams t WHERE t.id=team_id));
CREATE FUNCTION public.sync_team_roster() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid; cyber boolean;
BEGIN
 IF NEW.team_name='' THEN RETURN NEW; END IF;
 SELECT d.kind='esport' INTO cyber FROM public.activities a JOIN public.disciplines d ON d.id=a.discipline_id WHERE a.id=NEW.activity_id;
 INSERT INTO public.teams(registration_id,captain_id,name) VALUES(NEW.id,NEW.user_id,NEW.team_name) ON CONFLICT(registration_id) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO tid;
 DELETE FROM public.team_members WHERE team_id=tid;
 INSERT INTO public.team_members(team_id,position,display_name,game_nickname) SELECT tid,n::integer,value,CASE WHEN cyber THEN value ELSE '' END FROM jsonb_array_elements_text(NEW.team_members) WITH ORDINALITY x(value,n);
 RETURN NEW;
END $$;
CREATE TRIGGER sync_team_roster AFTER INSERT OR UPDATE OF team_members,team_name ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.sync_team_roster();
INSERT INTO public.teams(registration_id,captain_id,name) SELECT id,user_id,team_name FROM public.registrations WHERE team_name<>'';
INSERT INTO public.team_members(team_id,position,display_name) SELECT t.id,n::integer,value FROM public.teams t JOIN public.registrations r ON r.id=t.registration_id CROSS JOIN jsonb_array_elements_text(r.team_members) WITH ORDINALITY x(value,n);
ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_v1;
REVOKE ALL ON FUNCTION public.event_workspace_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); a public.activities; result jsonb; nick text:=trim(COALESCE(payload->>'game_nickname',''));
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND account_status='active') THEN RAISE EXCEPTION 'Нужен активный аккаунт'; END IF;
 IF action='checkin' THEN
  SELECT * INTO a FROM public.activities WHERE id=(payload->>'activity_id')::uuid;
  IF a.id IS NULL OR a.status IN ('cancelled','completed') OR a.date_time IS NULL OR now()<a.date_time-interval '60 minutes' OR now()>a.date_time+interval '30 minutes' THEN RAISE EXCEPTION 'Отметка доступна за час до старта и в первые 30 минут'; END IF;
  UPDATE public.registrations SET checked_in_at=COALESCE(checked_in_at,now()) WHERE activity_id=a.id AND user_id=u AND status='registered' AND (payment_status='paid' OR a.is_free);
  IF NOT FOUND THEN RAISE EXCEPTION 'Нужна действующая оплаченная запись'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='join' THEN
  SELECT * INTO a FROM public.activities WHERE id=(payload->>'activity_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.disciplines WHERE id=a.discipline_id AND kind='esport') AND length(nick) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Укажите игровой ник капитана или участника'; END IF;
 END IF;
 result:=public.event_workspace_v1(action,payload);
 IF action='join' AND a.discipline_id IS NOT NULL THEN UPDATE public.registrations SET game_nickname=nick WHERE id=(result->>'id')::uuid AND user_id=u; END IF;
 RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.event_workspace_v1(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'INSERT INTO public.registrations(activity_id,user_id,payment_status,team_name,team_members) VALUES(aid,u,','INSERT INTO public.registrations(activity_id,user_id,game_nickname,payment_status,team_name,team_members) VALUES(aid,u,left(trim(COALESCE(payload->>''game_nickname'','''')),80),');
 EXECUTE definition;
END $$;
CREATE FUNCTION public.guard_roster_checkin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities;
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id;
 IF a.discipline_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.disciplines WHERE id=a.discipline_id AND kind='esport') AND length(trim(NEW.game_nickname))<2 THEN RAISE EXCEPTION 'Укажите игровой ник'; END IF;
  IF a.participation_mode='team' AND (jsonb_typeof(NEW.team_members)<>'array' OR jsonb_array_length(NEW.team_members) NOT BETWEEN a.team_min AND a.team_max OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.team_members))<>(SELECT count(DISTINCT lower(trim(x))) FROM jsonb_array_elements_text(NEW.team_members) x)) THEN RAISE EXCEPTION 'Проверьте состав команды'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.team_members IS DISTINCT FROM OLD.team_members OR NEW.team_name<>OLD.team_name OR NEW.game_nickname<>OLD.game_nickname) AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=a.id) THEN RAISE EXCEPTION 'Состав зафиксирован после жеребьёвки'; END IF;
 IF NEW.checked_in_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at) THEN
  IF a.status IN ('cancelled','completed') OR a.date_time IS NULL OR now()<a.date_time-interval '60 minutes' OR now()>a.date_time+interval '30 minutes' OR NEW.status<>'registered' OR (NEW.payment_status<>'paid' AND NOT a.is_free) THEN RAISE EXCEPTION 'Чек-ин сейчас недоступен'; END IF;
  NEW.checked_in_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_roster_checkin BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.guard_roster_checkin();
