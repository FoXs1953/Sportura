-- ENUMS
CREATE TYPE public.app_role AS ENUM ('participant','sports_manager','tournament_organizer','admin');
CREATE TYPE public.activity_type AS ENUM ('daily_game','tournament','league');
CREATE TYPE public.activity_status AS ENUM ('open','nearly_full','full','completed','cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','needs_review','rejected','refunded');
CREATE TYPE public.registration_status AS ENUM ('registered','cancelled','no_show','attended','rejected');
CREATE TYPE public.account_status AS ENUM ('active','flagged','suspended','banned');
CREATE TYPE public.application_status AS ENUM ('pending','approved','rejected');

-- UPDATED_AT HELPER
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Игрок',
  phone text,
  email text,
  avatar_url text,
  sports text[] NOT NULL DEFAULT '{}',
  city text NOT NULL DEFAULT 'Астана',
  verified boolean NOT NULL DEFAULT false,
  kaspi_payment_link text,
  rating numeric(3,2),
  rating_count integer NOT NULL DEFAULT 0,
  reliability_rating numeric(3,2),
  no_show_count integer NOT NULL DEFAULT 0,
  dispute_count integer NOT NULL DEFAULT 0,
  cancellation_count integer NOT NULL DEFAULT 0,
  account_status public.account_status NOT NULL DEFAULT 'active',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- AUTO PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone, avatar_url, verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,'Игрок'),'@',1)),
    NEW.email,
    NEW.phone,
    NEW.raw_user_meta_data->>'avatar_url',
    (NEW.email_confirmed_at IS NOT NULL OR NEW.phone_confirmed_at IS NOT NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'participant')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "user_roles_read_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- MANAGER APPLICATIONS
CREATE TABLE public.manager_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL DEFAULT 'sports_manager',
  motivation text,
  status public.application_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.manager_applications TO authenticated;
GRANT ALL ON public.manager_applications TO service_role;
ALTER TABLE public.manager_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications_read_own_or_admin" ON public.manager_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "applications_insert_own" ON public.manager_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "applications_update_admin" ON public.manager_applications FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ACTIVITIES
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type public.activity_type NOT NULL,
  status public.activity_status NOT NULL DEFAULT 'open',
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organizer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  host_name text NOT NULL DEFAULT 'Организатор',
  host_rating numeric(3,2),
  sport text NOT NULL,
  city text NOT NULL DEFAULT 'Астана',
  location_text text NOT NULL,
  two_gis_url text,
  date_time timestamptz,
  time_text text,
  price_text text,
  entry_fee numeric(12,2),
  is_free boolean NOT NULL DEFAULT false,
  max_participants integer NOT NULL CHECK (max_participants > 0),
  registered_count integer NOT NULL DEFAULT 0,
  is_private boolean NOT NULL DEFAULT false,
  invite_code text UNIQUE,
  kaspi_payment_link text,
  payment_mode text NOT NULL DEFAULT 'MANAGER_DIRECT',
  prize_pool jsonb,
  format text,
  age_division text,
  skill_division text,
  skill_level text,
  recurrence text,
  cancellation_policy text,
  notes text,
  registration_deadline timestamptz,
  results_submitted_at timestamptz,
  dispute_window_ends_at timestamptz,
  commission_percent numeric(5,2) NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_type_idx ON public.activities(type);
CREATE INDEX activities_status_idx ON public.activities(status);
CREATE INDEX activities_sport_idx ON public.activities(sport);
CREATE INDEX activities_date_idx ON public.activities(date_time);
CREATE INDEX activities_city_idx ON public.activities(city);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT SELECT ON public.activities TO anon;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activities_public_read" ON public.activities FOR SELECT USING (is_private = false);
CREATE POLICY "activities_owner_read" ON public.activities FOR SELECT TO authenticated
  USING (auth.uid() = manager_id OR auth.uid() = organizer_id OR public.is_admin());
CREATE POLICY "activities_insert_host" ON public.activities FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = manager_id AND public.has_role(auth.uid(),'sports_manager'))
    OR (auth.uid() = organizer_id AND public.has_role(auth.uid(),'tournament_organizer'))
    OR public.is_admin()
  );
CREATE POLICY "activities_update_host" ON public.activities FOR UPDATE TO authenticated
  USING (auth.uid() = manager_id OR auth.uid() = organizer_id OR public.is_admin())
  WITH CHECK (auth.uid() = manager_id OR auth.uid() = organizer_id OR public.is_admin());
CREATE POLICY "activities_delete_host" ON public.activities FOR DELETE TO authenticated
  USING (auth.uid() = manager_id OR auth.uid() = organizer_id OR public.is_admin());
CREATE TRIGGER activities_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_activity_host(_activity_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.id = _activity_id AND (a.manager_id = _user_id OR a.organizer_id = _user_id)
  );
$$;

-- REGISTRATIONS
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.registration_status NOT NULL DEFAULT 'registered',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_reference text,
  receipt_url text,
  participant_note text,
  paid_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);
CREATE INDEX registrations_activity_idx ON public.registrations(activity_id);
CREATE INDEX registrations_user_idx ON public.registrations(user_id);
CREATE INDEX registrations_payment_idx ON public.registrations(payment_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registrations_read" ON public.registrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());
CREATE POLICY "registrations_insert_own" ON public.registrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "registrations_update" ON public.registrations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_activity_host(activity_id, auth.uid()) OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());
CREATE TRIGGER registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COUNT + STATUS SYNC
CREATE OR REPLACE FUNCTION public.sync_activity_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  aid uuid;
  cnt integer;
  cap integer;
  cur public.activity_status;
BEGIN
  aid := COALESCE(NEW.activity_id, OLD.activity_id);
  SELECT count(*) INTO cnt FROM public.registrations r
    WHERE r.activity_id = aid AND r.status NOT IN ('cancelled','rejected');
  SELECT max_participants, status INTO cap, cur FROM public.activities WHERE id = aid;
  UPDATE public.activities SET registered_count = cnt,
    status = CASE
      WHEN cur IN ('cancelled','completed') THEN cur
      WHEN cnt >= cap THEN 'full'
      WHEN cap > 0 AND cnt::numeric / cap >= 0.8 THEN 'nearly_full'
      ELSE 'open' END
  WHERE id = aid;
  RETURN NULL;
END; $$;

CREATE TRIGGER registrations_sync_counts
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.sync_activity_counts();

-- CAPACITY GUARD
CREATE OR REPLACE FUNCTION public.guard_activity_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cap integer; cnt integer; st public.activity_status;
BEGIN
  SELECT max_participants, status INTO cap, st FROM public.activities WHERE id = NEW.activity_id;
  IF st = 'cancelled' THEN RAISE EXCEPTION 'Активность отменена'; END IF;
  SELECT count(*) INTO cnt FROM public.registrations
    WHERE activity_id = NEW.activity_id AND status NOT IN ('cancelled','rejected');
  IF cnt >= cap THEN RAISE EXCEPTION 'Мест больше нет'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER registrations_guard_capacity
BEFORE INSERT ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.guard_activity_capacity();

-- PAYMENT STATUS HISTORY (audit)
CREATE TABLE public.payment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  previous_status public.payment_status,
  new_status public.payment_status NOT NULL,
  changed_by uuid,
  changed_by_role text,
  payment_reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_history_reg_idx ON public.payment_status_history(registration_id);
GRANT SELECT, INSERT ON public.payment_status_history TO authenticated;
GRANT ALL ON public.payment_status_history TO service_role;
ALTER TABLE public.payment_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_history_read" ON public.payment_status_history FOR SELECT TO authenticated
  USING (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid()));
CREATE POLICY "payment_history_insert" ON public.payment_status_history FOR INSERT TO authenticated
  WITH CHECK (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = registration_id AND r.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.log_payment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO public.payment_status_history
      (registration_id, activity_id, previous_status, new_status, changed_by, payment_reference)
    VALUES (NEW.id, NEW.activity_id, OLD.payment_status, NEW.payment_status, auth.uid(), NEW.payment_reference);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER registrations_log_payment
AFTER UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.log_payment_status_change();

-- RESULTS
CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_name text,
  placement integer NOT NULL,
  prize_amount numeric(12,2),
  paid_out boolean NOT NULL DEFAULT false,
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX results_activity_idx ON public.results(activity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;
GRANT SELECT ON public.results TO anon;
GRANT ALL ON public.results TO service_role;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results_public_read" ON public.results FOR SELECT USING (true);
CREATE POLICY "results_write_host" ON public.results FOR INSERT TO authenticated
  WITH CHECK (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());
CREATE POLICY "results_update_host" ON public.results FOR UPDATE TO authenticated
  USING (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin())
  WITH CHECK (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());
CREATE POLICY "results_delete_host" ON public.results FOR DELETE TO authenticated
  USING (public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());

-- REVIEWS
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, reviewer_id, reviewed_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reviewer_id AND auth.uid() <> reviewed_user_id);
CREATE POLICY "reviews_delete_own_or_admin" ON public.reviews FOR DELETE TO authenticated
  USING (auth.uid() = reviewer_id OR public.is_admin());

CREATE OR REPLACE FUNCTION public.recalc_user_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; avg_r numeric; cnt integer;
BEGIN
  target := COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  SELECT round(avg(rating)::numeric,2), count(*) INTO avg_r, cnt FROM public.reviews WHERE reviewed_user_id = target;
  UPDATE public.profiles SET rating = avg_r, rating_count = COALESCE(cnt,0) WHERE id = target;
  RETURN NULL;
END; $$;

CREATE TRIGGER reviews_recalc_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalc_user_rating();

-- DISPUTES
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disputes_read" ON public.disputes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_activity_host(activity_id, auth.uid()) OR public.is_admin());
CREATE POLICY "disputes_insert_own" ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "disputes_update_admin" ON public.disputes FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- PAYMENT EVENTS (webhooks)
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_event_id text,
  external_payment_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean,
  processed boolean NOT NULL DEFAULT false,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_events_external_event_idx ON public.payment_events(provider, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX payment_events_payment_idx ON public.payment_events(external_payment_id);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_events_admin_read" ON public.payment_events FOR SELECT TO authenticated USING (public.is_admin());

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_activity_idx ON public.transactions(activity_id);
CREATE INDEX transactions_reference_idx ON public.transactions(provider_reference);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_read" ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- DEMO DATA
INSERT INTO public.activities
  (title, description, type, sport, location_text, two_gis_url, time_text, price_text, entry_fee, max_participants, host_name, host_rating, kaspi_payment_link, date_time, skill_level, format)
VALUES
  ('Мини-футбол 7×7', 'Дружеская игра на искусственном поле. Форма светлая/тёмная.', 'daily_game', 'Мини-футбол', 'Стадион «Тарлан», Астана', 'https://2gis.kz/astana', 'Сегодня, 20:00–22:00', '3 500 ₸', 3500, 14, 'Данияр С.', 4.80, 'https://pay.kaspi.kz/pay/demo-daniyar', now() + interval '6 hours', 'Средний', '7×7'),
  ('Уличная пятёрка', 'Баскетбол 5×5, играем до 21 очка.', 'daily_game', 'Баскетбол', 'Арена «Алма», Астана', 'https://2gis.kz/astana', 'Сегодня, 21:00–22:30', '2 000 ₸', 2000, 10, 'Алишер К.', 4.60, 'https://pay.kaspi.kz/pay/demo-alisher', now() + interval '7 hours', 'Любой', '5×5'),
  ('Сет у бассейна', 'Волейбол в зале, 6×6.', 'daily_game', 'Волейбол', 'СК «Коктал», Астана', 'https://2gis.kz/astana', 'Завтра, 18:30–20:00', '2 500 ₸', 2500, 12, 'Мадина Т.', 4.90, 'https://pay.kaspi.kz/pay/demo-madina', now() + interval '1 day', 'Средний', '6×6'),
  ('Футбол по субботам', 'Регулярная игра каждую субботу утром.', 'daily_game', 'Футбол', 'Astana Arena, поле №2', 'https://2gis.kz/astana', 'Каждую субботу, 10:00', 'Бесплатно', NULL, 20, 'Ержан Б.', 4.30, NULL, now() + interval '3 days', 'Любой', '11×11'),
  ('Кубок дворов Астаны', 'Однодневный турнир на выбывание, 8 команд.', 'tournament', 'Мини-футбол', 'Спортцентр «Астана Спорт»', 'https://2gis.kz/astana', '30 мая, 10:00–18:00', '5 000 ₸', 5000, 64, 'Sportura Cup', 4.70, NULL, now() + interval '10 days', 'Средний', 'Плей-офф'),
  ('Баскет-лига Астана', 'Лига на 6 недель, призовой фонд 300 000 ₸.', 'league', 'Баскетбол', 'Astana Hall', 'https://2gis.kz/astana', 'Каждое воскресенье, 12:00', '7 000 ₸', 7000, 48, 'Astana Hoops', 4.50, NULL, now() + interval '14 days', 'Продвинутый', 'Круговая');

UPDATE public.activities SET is_free = true WHERE entry_fee IS NULL;
UPDATE public.activities SET prize_pool = '{"1":60,"2":30,"3":10}'::jsonb WHERE type IN ('tournament','league');