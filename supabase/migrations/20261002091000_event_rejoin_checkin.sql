-- A cancelled registration can be reused, but its previous presence confirmation
-- must not carry over. A host-confirmed replacement is checked in atomically.
CREATE OR REPLACE FUNCTION public.guard_roster_checkin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities;
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=NEW.activity_id;
 IF TG_OP='UPDATE' AND OLD.status IN ('cancelled','rejected','no_show')
  AND NEW.status='registered'
  AND NOT public.replacement_pending(NEW.activity_id,NEW.user_id) THEN
  NEW.checked_in_at:=NULL;
 END IF;
 IF a.discipline_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.disciplines WHERE id=a.discipline_id AND kind='esport') AND length(trim(NEW.game_nickname))<2 THEN RAISE EXCEPTION 'Укажите игровой ник'; END IF;
  IF a.participation_mode='team' AND (jsonb_typeof(NEW.team_members)<>'array' OR jsonb_array_length(NEW.team_members) NOT BETWEEN a.team_min AND a.team_max OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.team_members))<>(SELECT count(DISTINCT lower(trim(x))) FROM jsonb_array_elements_text(NEW.team_members) x)) THEN RAISE EXCEPTION 'Проверьте состав команды'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.team_members IS DISTINCT FROM OLD.team_members OR NEW.team_name<>OLD.team_name OR NEW.game_nickname<>OLD.game_nickname) AND EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=a.id) THEN RAISE EXCEPTION 'Состав зафиксирован после жеребьёвки'; END IF;
 IF NEW.checked_in_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at) THEN
  IF a.status IN ('cancelled','completed') OR a.date_time IS NULL OR now()<a.date_time-interval '60 minutes' OR (now()>a.date_time+interval '30 minutes' AND NOT public.replacement_pending(NEW.activity_id,NEW.user_id)) OR NEW.status<>'registered' OR (NEW.payment_status<>'paid' AND NOT a.is_free) THEN RAISE EXCEPTION 'Чек-ин сейчас недоступен'; END IF;
  NEW.checked_in_at:=now();
 END IF;
 RETURN NEW;
END $$;

-- Check-in confirms attendance for a specific start time. A weather postponement
-- or host edit must reopen that confirmation window for every participant.
CREATE FUNCTION public.reset_event_checkin_on_reschedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
 IF NEW.date_time IS DISTINCT FROM OLD.date_time THEN
  UPDATE public.registrations SET checked_in_at=NULL
   WHERE activity_id=NEW.id AND checked_in_at IS NOT NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  DELETE FROM public.event_checkin_closures WHERE activity_id=NEW.id;
  IF affected>0 THEN
   PERFORM public.event_log(NEW.id,NULL,'Чек-ин сброшен после переноса',
    jsonb_build_object('previous_start',OLD.date_time,'new_start',NEW.date_time,'registrations',affected));
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.reset_event_checkin_on_reschedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reset_event_checkin_on_reschedule AFTER UPDATE OF date_time ON public.activities
 FOR EACH ROW EXECUTE FUNCTION public.reset_event_checkin_on_reschedule();
