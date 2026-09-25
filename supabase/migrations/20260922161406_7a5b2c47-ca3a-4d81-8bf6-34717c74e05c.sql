-- 1. Content blocks (CMS)
CREATE TABLE public.content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL DEFAULT 'home',
  kind text NOT NULL DEFAULT 'text',
  title text,
  subtitle text,
  body text,
  image_url text,
  cta_label text,
  cta_url text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.content_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_blocks TO authenticated;
GRANT ALL ON public.content_blocks TO service_role;

ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_blocks_public_read ON public.content_blocks
  FOR SELECT USING (published = true);
CREATE POLICY content_blocks_admin_read ON public.content_blocks
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY content_blocks_admin_insert ON public.content_blocks
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY content_blocks_admin_update ON public.content_blocks
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY content_blocks_admin_delete ON public.content_blocks
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER content_blocks_updated_at BEFORE UPDATE ON public.content_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX content_blocks_page_position_idx ON public.content_blocks (page, position);

-- 2. Site settings
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_settings_public_read ON public.site_settings
  FOR SELECT USING (true);
CREATE POLICY site_settings_admin_insert ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY site_settings_admin_update ON public.site_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY site_settings_admin_delete ON public.site_settings
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_settings (key, value) VALUES
  ('general', '{"site_name":"Sportura","tagline":"Игры и турниры в Астане","announcement":"","announcement_enabled":false,"maintenance_mode":false,"maintenance_message":"Идут технические работы. Скоро вернёмся.","support_contact":"","default_city":"Астана"}'::jsonb),
  ('catalog', '{"sports":["Футбол","Мини-футбол","Баскетбол","Волейбол"],"cities":["Астана"]}'::jsonb),
  ('business', '{"commission_percent":10,"free_paid_competitions":10,"dispute_window_hours":48,"registrations_enabled":true,"activity_creation_enabled":true}'::jsonb);

-- 3. Admin audit log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_audit_insert ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND actor_id = auth.uid());

CREATE INDEX admin_audit_created_idx ON public.admin_audit_log (created_at DESC);

-- 4. Admins manage roles
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin());

-- 5. Bootstrap admin account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF lower(COALESCE(NEW.email,'')) IN ('alibek_alisher@icloud.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE lower(u.email) = 'alibek_alisher@icloud.com'
ON CONFLICT (user_id, role) DO NOTHING;