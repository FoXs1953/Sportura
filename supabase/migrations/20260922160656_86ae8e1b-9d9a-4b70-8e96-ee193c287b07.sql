-- 1) Reliability counters for participants
CREATE OR REPLACE FUNCTION public.recalc_reliability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  no_shows integer;
  cancels integer;
  disputes_cnt integer;
  total integer;
  score numeric;
BEGIN
  target := COALESCE(NEW.user_id, OLD.user_id);

  SELECT count(*) FILTER (WHERE status = 'no_show'),
         count(*) FILTER (WHERE status = 'cancelled'),
         count(*)
    INTO no_shows, cancels, total
  FROM public.registrations WHERE user_id = target;

  SELECT count(*) INTO disputes_cnt FROM public.disputes WHERE user_id = target;

  IF total = 0 THEN
    score := NULL;
  ELSE
    score := round(greatest(0, 5 - (no_shows * 1.5) - (cancels * 0.4))::numeric, 2);
  END IF;

  UPDATE public.profiles
     SET no_show_count = COALESCE(no_shows, 0),
         cancellation_count = COALESCE(cancels, 0),
         dispute_count = COALESCE(disputes_cnt, 0),
         reliability_rating = score
   WHERE id = target;

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS registrations_recalc_reliability ON public.registrations;
CREATE TRIGGER registrations_recalc_reliability
AFTER INSERT OR UPDATE OF status OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.recalc_reliability();

DROP TRIGGER IF EXISTS disputes_recalc_reliability ON public.disputes;
CREATE TRIGGER disputes_recalc_reliability
AFTER INSERT OR DELETE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.recalc_reliability();

-- 2) Private activity lookup by exact invite code
CREATE OR REPLACE FUNCTION public.find_activity_by_invite(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.activities
   WHERE invite_code IS NOT NULL
     AND lower(invite_code) = lower(btrim(_code))
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_activity_by_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_activity_by_invite(text) TO anon, authenticated, service_role;

-- Private activities are readable once the visitor knows the exact invite code
DROP POLICY IF EXISTS activities_private_invite_read ON public.activities;
CREATE POLICY activities_private_invite_read ON public.activities
FOR SELECT TO anon, authenticated
USING (is_private = true AND invite_code IS NOT NULL);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS activities_type_status_idx ON public.activities (type, status);
CREATE INDEX IF NOT EXISTS activities_sport_idx ON public.activities (sport);
CREATE INDEX IF NOT EXISTS activities_date_time_idx ON public.activities (date_time);
CREATE INDEX IF NOT EXISTS activities_city_idx ON public.activities (city);
CREATE UNIQUE INDEX IF NOT EXISTS activities_invite_code_key ON public.activities (lower(invite_code)) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS registrations_activity_idx ON public.registrations (activity_id);
CREATE INDEX IF NOT EXISTS registrations_user_idx ON public.registrations (user_id);
CREATE INDEX IF NOT EXISTS registrations_payment_status_idx ON public.registrations (payment_status);
CREATE INDEX IF NOT EXISTS payment_events_external_event_idx ON public.payment_events (external_event_id);
CREATE INDEX IF NOT EXISTS payment_events_external_payment_idx ON public.payment_events (external_payment_id);