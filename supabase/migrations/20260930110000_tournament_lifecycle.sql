-- Timed offers use the same activity lock as registration, so a reserved place
-- cannot be claimed by another participant through either RPC or direct REST.
ALTER TABLE public.event_waitlist
 ADD COLUMN offered_at timestamptz,
 ADD COLUMN offer_expires_at timestamptz,
 ADD CONSTRAINT waitlist_offer_dates CHECK (
  (offered_at IS NULL AND offer_expires_at IS NULL) OR
  (offered_at IS NOT NULL AND offer_expires_at IS NOT NULL AND offer_expires_at > offered_at)
 );
CREATE INDEX waitlist_queue_order ON public.event_waitlist(activity_id,created_at,id);

CREATE OR REPLACE FUNCTION public.notify_waitlist(aid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; w public.event_waitlist; cutoff timestamptz; available integer;
BEGIN
 SELECT * INTO a FROM public.activities WHERE id=aid FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 cutoff:=LEAST(a.registration_deadline,a.date_time);
 -- Expiry is recorded once; deleting the queue entry also allows a fresh
 -- application at the end of the queue if the participant still wants to play.
 FOR w IN DELETE FROM public.event_waitlist
  WHERE activity_id=aid AND offer_expires_at<=now() RETURNING * LOOP
  PERFORM public.event_log(aid,NULL,'Срок предложения места истёк',jsonb_build_object('waitlist_id',w.id));
  PERFORM public.profile_notify(w.user_id,'games','Время подтверждения истекло',
   a.title||': предложение места больше не действует. При открытой регистрации можно записаться в очередь снова.',
   '/activity/'||aid,'waitlist-expired:'||w.id);
 END LOOP;
 IF a.status IN ('cancelled','completed') OR cutoff<=now()
  OR EXISTS(SELECT 1 FROM public.event_matches WHERE activity_id=aid) THEN
  UPDATE public.event_waitlist SET offered_at=NULL,offer_expires_at=NULL WHERE activity_id=aid AND offered_at IS NOT NULL;
  RETURN;
 END IF;
 IF COALESCE((SELECT (value->>'registrations_enabled')::boolean FROM public.site_settings WHERE key='business'),true)=false THEN RETURN; END IF;
 SELECT a.max_participants-count(*) INTO available FROM public.registrations
  WHERE activity_id=aid AND status NOT IN ('cancelled','rejected');
 SELECT available-count(*) INTO available FROM public.event_waitlist
  WHERE activity_id=aid AND offer_expires_at>now();
 IF available<=0 THEN RETURN; END IF;
 FOR w IN SELECT * FROM public.event_waitlist WHERE activity_id=aid AND offered_at IS NULL
  ORDER BY created_at,id LIMIT available FOR UPDATE LOOP
  UPDATE public.event_waitlist SET offered_at=now(),offer_expires_at=LEAST(now()+interval '15 minutes',cutoff) WHERE id=w.id;
  PERFORM public.profile_notify(w.user_id,'games','Освободилось место',
   a.title||': подтвердите участие в течение 15 минут, но не позже закрытия регистрации или начала события. Точный срок указан в карточке.',
   '/activity/'||aid,'waitlist-offer:'||w.id);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.notify_waitlist(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_waitlist_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT(NEW.status='registered' AND OLD.status IN ('cancelled','rejected')) THEN RETURN NEW; END IF;
 PERFORM public.notify_waitlist(NEW.activity_id);
 IF EXISTS(SELECT 1 FROM public.event_waitlist WHERE activity_id=NEW.activity_id)
  AND NOT EXISTS(SELECT 1 FROM public.event_waitlist WHERE activity_id=NEW.activity_id AND user_id=NEW.user_id AND offer_expires_at>now()) THEN
  RAISE EXCEPTION 'Свободные места сначала предлагаются участникам листа ожидания. Дождитесь предложения или встаньте в очередь';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.guard_waitlist_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.max_participants<OLD.max_participants AND NEW.max_participants<
  (SELECT count(*) FROM public.registrations WHERE activity_id=NEW.id AND status NOT IN ('cancelled','rejected'))+
  (SELECT count(*) FROM public.event_waitlist WHERE activity_id=NEW.id AND offer_expires_at>now()) THEN
  RAISE EXCEPTION 'Лимит меньше числа записанных участников и действующих предложений места. Дождитесь их подтверждения или истечения';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_waitlist_capacity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_waitlist_capacity BEFORE UPDATE OF max_participants ON public.activities
 FOR EACH ROW EXECUTE FUNCTION public.guard_waitlist_capacity();

-- Check the minimum once, at the registration deadline (or the start if there
-- is no separate deadline). Do not retroactively cancel historical events.
CREATE TABLE public.event_minimum_checks (
 activity_id uuid PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
 checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_minimum_checks ENABLE ROW LEVEL SECURITY;
INSERT INTO public.event_minimum_checks(activity_id)
 SELECT id FROM public.activities WHERE LEAST(registration_deadline,date_time)<=now();

CREATE FUNCTION public.event_lifecycle_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.activities; count_active integer; queued record;
BEGIN
 FOR a IN SELECT x.* FROM public.activities x
  WHERE x.type IN ('tournament','league') AND x.is_free AND COALESCE(x.entry_fee,0)=0
   AND EXISTS(SELECT 1 FROM public.disciplines d WHERE d.name=x.sport AND d.kind='sport')
   AND x.status NOT IN ('cancelled','completed') AND LEAST(x.registration_deadline,x.date_time)<=now()
   AND NOT EXISTS(SELECT 1 FROM public.event_minimum_checks c WHERE c.activity_id=x.id)
   AND NOT EXISTS(SELECT 1 FROM public.event_matches m WHERE m.activity_id=x.id)
  ORDER BY x.id FOR UPDATE OF x SKIP LOCKED LOOP
  -- Recheck after acquiring the lock in case another worker just handled it.
  IF EXISTS(SELECT 1 FROM public.event_minimum_checks WHERE activity_id=a.id) THEN CONTINUE; END IF;
  SELECT count(*) INTO count_active FROM public.registrations
   WHERE activity_id=a.id AND status IN ('registered','attended');
  INSERT INTO public.event_minimum_checks(activity_id) VALUES(a.id) ON CONFLICT DO NOTHING;
  IF count_active<a.min_participants THEN
   UPDATE public.activities SET status='cancelled',cancellation_reason=
    format('Недобор участников к закрытию регистрации: %s из необходимых %s.',count_active,a.min_participants) WHERE id=a.id;
   PERFORM public.event_log(a.id,NULL,'Автоматическая отмена при недоборе',
    jsonb_build_object('participants',count_active,'minimum',a.min_participants));
   PERFORM public.profile_notify(COALESCE(a.organizer_id,a.manager_id),'host','Турнир отменён: недобор',
    a.title||format(' — записались %s из необходимых %s.',count_active,a.min_participants),
    '/host','minimum-cancelled:'||a.id);
  END IF;
 END LOOP;
 FOR queued IN SELECT DISTINCT activity_id FROM public.event_waitlist ORDER BY activity_id LOOP
  PERFORM public.notify_waitlist(queued.activity_id);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.event_lifecycle_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_lifecycle_maintenance() TO service_role;

-- Reuse the existing five-minute database job and authenticated maintenance
-- endpoint. Calling either repeatedly is safe and does not resend offers.
CREATE OR REPLACE FUNCTION public.profile_maintenance() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.profiles SET account_status='active',restriction_reason=NULL,restriction_until=NULL
  WHERE account_status IN ('flagged','suspended') AND restriction_until IS NOT NULL AND restriction_until<=now();
 PERFORM public.event_lifecycle_maintenance();
 PERFORM public.profile_generate_reminders();
END $$;

-- Refresh offers when their owner opens the workspace as well as in the job.
ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_queue_base;
REVOKE ALL ON FUNCTION public.event_workspace_queue_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); queued record; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Войдите в аккаунт'; END IF;
 IF action IN ('player','host') THEN
  FOR queued IN SELECT DISTINCT activity_id FROM public.event_waitlist
   WHERE CASE WHEN action='player' THEN user_id=u ELSE public.is_activity_host(activity_id,u) END
   ORDER BY activity_id LOOP
   PERFORM public.notify_waitlist(queued.activity_id);
  END LOOP;
 END IF;
 result:=public.event_workspace_queue_base(action,payload);
 IF action='waitlist_join' THEN PERFORM public.notify_waitlist((payload->>'activity_id')::uuid); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;

-- Only expose a count, and only after the existing private-event access check.
ALTER FUNCTION public.event_public(uuid,text) RENAME TO event_public_queue_base;
REVOKE ALL ON FUNCTION public.event_public_queue_base(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_public(aid uuid,code text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=public.event_public_queue_base(aid,code);
 IF result IS NULL THEN RETURN NULL; END IF;
 RETURN result||jsonb_build_object('waitlist_count',
  (SELECT count(*) FROM public.event_waitlist WHERE activity_id=aid AND (offer_expires_at IS NULL OR offer_expires_at>now())));
END $$;
REVOKE ALL ON FUNCTION public.event_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public(uuid,text) TO anon,authenticated;
