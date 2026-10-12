-- An explicit registration deadline may follow the existing event start by
-- at most 30 elapsed days. Unset deadlines retain the start-time cutoff.
-- Keep previously published migrations and all start/check-in rules intact.
CREATE FUNCTION public.guard_registration_deadline_window() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.date_time IS NOT DISTINCT FROM OLD.date_time
  AND NEW.registration_deadline IS NOT DISTINCT FROM OLD.registration_deadline THEN RETURN NEW; END IF;
 IF NEW.registration_deadline IS NOT NULL AND NEW.date_time IS NOT NULL
  AND NEW.registration_deadline>NEW.date_time+interval '720 hours' THEN
  RAISE EXCEPTION 'Не позже 30 дней после начала';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_registration_deadline_window() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_registration_deadline_window
 BEFORE INSERT OR UPDATE OF date_time,registration_deadline ON public.activities
 FOR EACH ROW EXECUTE FUNCTION public.guard_registration_deadline_window();

-- Update the authoritative functions in place so the existing permission,
-- queue, replacement and competition wrappers continue to apply. Fail the
-- migration if a future schema no longer has the exact guard being replaced.
DO $patch$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.event_workspace_v1(text,jsonb)',
   $old$IF NULLIF(vals->>'registration_deadline','') IS NOT NULL AND (vals->>'registration_deadline')::timestamptz>(vals->>'date_time')::timestamptz THEN RAISE EXCEPTION 'Регистрация должна завершиться до начала'; END IF;$old$,
   $new$IF NULLIF(vals->>'registration_deadline','') IS NOT NULL AND (vals->>'registration_deadline')::timestamptz>(vals->>'date_time')::timestamptz+interval '720 hours' THEN RAISE EXCEPTION 'Не позже 30 дней после начала'; END IF;$new$),
  ('public.guard_activity_capacity()',
   $old$a.date_time<=now() OR a.registration_deadline<=now()$old$,
   $new$COALESCE(a.registration_deadline,a.date_time)<=now()$new$),
  ('public.event_workspace_queue_base(text,jsonb)',
   $old$a.date_time<=now() OR a.registration_deadline<=now()$old$,
   $new$COALESCE(a.registration_deadline,a.date_time)<=now()$new$),
  ('public.notify_waitlist(uuid)',
   $old$cutoff:=LEAST(a.registration_deadline,a.date_time);$old$,
   $new$cutoff:=COALESCE(a.registration_deadline,a.date_time);$new$),
  ('public.notify_waitlist(uuid)',
   $old$но не позже закрытия регистрации или начала события$old$,
   $new$но не позже закрытия регистрации$new$),
  ('public.event_lifecycle_maintenance()',
   $old$LEAST(x.registration_deadline,x.date_time)<=now()$old$,
   $new$COALESCE(x.registration_deadline,x.date_time)<=now()$new$),
  ('public.event_feed(jsonb,integer)',
   $old$ELSE a.status NOT IN ('completed','cancelled') AND (a.date_time IS NULL OR a.date_time>now()) END$old$,
   $new$ELSE a.status NOT IN ('completed','cancelled') AND (a.date_time IS NULL OR a.date_time>now() OR a.registration_deadline>now()) END$new$),
  ('public.event_feed(jsonb,integer)',
   $old$(a.registration_deadline IS NULL OR a.registration_deadline>now()) AND (a.date_time IS NULL OR a.date_time>now())$old$,
   $new$(COALESCE(a.registration_deadline,a.date_time) IS NULL OR COALESCE(a.registration_deadline,a.date_time)>now())$new$),
  ('public.event_feed(jsonb,integer)',
   $old$(registration_deadline IS NULL OR registration_deadline>now())$old$,
   $new$(COALESCE(registration_deadline,date_time) IS NULL OR COALESCE(registration_deadline,date_time)>now())$new$)
 ) AS replacements(signature,old_guard,new_guard) LOOP
  definition:=pg_get_functiondef(item.signature::regprocedure);
  IF length(definition)-length(replace(definition,item.old_guard,''))<>length(item.old_guard) THEN
   RAISE EXCEPTION 'Review registration deadline guard in %',item.signature;
  END IF;
  EXECUTE replace(definition,item.old_guard,item.new_guard);
 END LOOP;
END $patch$;
