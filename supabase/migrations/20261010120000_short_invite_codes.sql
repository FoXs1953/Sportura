-- Human-readable invitations use eight digits. Keep previous codes in a private
-- registry so already-shared links continue to open and join the same event.
-- The migration runner executes this file in one transaction.
DO $$ BEGIN
 LOCK TABLE public.activities IN SHARE ROW EXCLUSIVE MODE;
END $$;

CREATE TABLE public.activity_invite_codes (
 code text PRIMARY KEY CHECK (length(code)>0),
 activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_invite_codes_activity_idx ON public.activity_invite_codes(activity_id);
ALTER TABLE public.activity_invite_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activity_invite_codes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.normalize_activity_invite_code(_code text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE normalized text;
BEGIN
 -- Accept the grouped numeric form, including common nonbreaking spaces.
 normalized:=lower(regexp_replace(translate(COALESCE(_code,''),chr(160)||chr(8239),'  '),'^[[:space:]]+|[[:space:]]+$','','g'));
 IF normalized ~ '^[0-9[:space:]-]+$' THEN
  RETURN regexp_replace(normalized,'[[:space:]-]','','g');
 END IF;
 -- Preserve the previous case-insensitive lookup for nonnumeric legacy codes.
 RETURN normalized;
END $$;
REVOKE ALL ON FUNCTION public.normalize_activity_invite_code(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.remember_activity_invite_code(aid uuid,_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE normalized text:=public.normalize_activity_invite_code(_code); existing uuid;
BEGIN
 IF normalized='' THEN RETURN; END IF;
 INSERT INTO public.activity_invite_codes(code,activity_id) VALUES(normalized,aid)
  ON CONFLICT(code) DO NOTHING;
 SELECT activity_id INTO existing FROM public.activity_invite_codes WHERE code=normalized;
 IF existing IS DISTINCT FROM aid THEN RAISE EXCEPTION 'Код приглашения уже используется'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.remember_activity_invite_code(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserve_activity_invite_code(aid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate text; reserved text; attempt integer;
BEGIN
 FOR attempt IN 1..100 LOOP
  -- UUID randomness is available on both PostgreSQL and the local test runtime;
  -- the unique registry reservation handles simultaneous generation safely.
  candidate:=(10000000+(('x'||left(replace(gen_random_uuid()::text,'-',''),12))::bit(48)::bigint%90000000))::text;
  INSERT INTO public.activity_invite_codes(code,activity_id) VALUES(candidate,aid)
   ON CONFLICT(code) DO NOTHING RETURNING code INTO reserved;
  IF reserved IS NOT NULL THEN RETURN reserved; END IF;
 END LOOP;
 RAISE EXCEPTION 'Не удалось создать код приглашения. Повторите попытку';
END $$;
REVOKE ALL ON FUNCTION public.reserve_activity_invite_code(uuid) FROM PUBLIC,anon,authenticated;

-- Reserve every existing code before generating any new ones. Canonical and
-- legacy codes share one namespace, so neither can point at a different event.
INSERT INTO public.activity_invite_codes(code,activity_id)
 SELECT public.normalize_activity_invite_code(invite_code),id FROM public.activities
 WHERE public.normalize_activity_invite_code(invite_code)<>'';

CREATE FUNCTION public.guard_activity_invite_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE proposed text:=public.normalize_activity_invite_code(NEW.invite_code);
BEGIN
 IF TG_OP='UPDATE' THEN PERFORM public.remember_activity_invite_code(NEW.id,OLD.invite_code); END IF;
 IF NOT NEW.is_private AND proposed='' THEN NEW.invite_code:=NULL; RETURN NEW; END IF;
 -- Also retain explicit codes sent by older publishing/admin clients.
 PERFORM public.remember_activity_invite_code(NEW.id,NEW.invite_code);
 IF proposed ~ '^[1-9][0-9]{7}$' THEN NEW.invite_code:=proposed;
 ELSE NEW.invite_code:=public.reserve_activity_invite_code(NEW.id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_activity_invite_code() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER activity_short_invite_code BEFORE INSERT OR UPDATE OF invite_code,is_private
 ON public.activities FOR EACH ROW EXECUTE FUNCTION public.guard_activity_invite_code();

UPDATE public.activities SET invite_code=invite_code
 WHERE (is_private AND invite_code IS NULL)
  OR (invite_code IS NOT NULL AND invite_code !~ '^[1-9][0-9]{7}$');

CREATE FUNCTION public.resolve_activity_invite_code(aid uuid,_code text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.invite_code FROM public.activity_invite_codes c
 JOIN public.activities a ON a.id=c.activity_id
 WHERE c.activity_id=aid AND c.code=public.normalize_activity_invite_code(_code);
$$;
REVOKE ALL ON FUNCTION public.resolve_activity_invite_code(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.find_activity_by_invite(_code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.id FROM public.activity_invite_codes c
 JOIN public.activities a ON a.id=c.activity_id
 WHERE c.code=public.normalize_activity_invite_code(_code) AND a.invite_code IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.find_activity_by_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_activity_by_invite(text) TO anon,authenticated,service_role;

-- Resolve aliases only for the requested event, then let the existing functions
-- enforce all host, participant, registration and waitlist permissions.
ALTER FUNCTION public.event_workspace(text,jsonb) RENAME TO event_workspace_invite_base;
REVOKE ALL ON FUNCTION public.event_workspace_invite_base(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_workspace(action text,payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; canonical text;
BEGIN
 IF action IN ('join','waitlist_join') AND NULLIF(payload->>'activity_id','') IS NOT NULL THEN
  aid:=(payload->>'activity_id')::uuid;
  canonical:=public.resolve_activity_invite_code(aid,payload->>'code');
  payload:=jsonb_set(payload,'{code}',to_jsonb(COALESCE(canonical,'')),true);
 END IF;
 RETURN public.event_workspace_invite_base(action,payload);
END $$;
REVOKE ALL ON FUNCTION public.event_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_workspace(text,jsonb) TO authenticated;

ALTER FUNCTION public.event_public(uuid,text) RENAME TO event_public_invite_base;
REVOKE ALL ON FUNCTION public.event_public_invite_base(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.event_public(aid uuid,code text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.event_public_invite_base(aid,COALESCE(public.resolve_activity_invite_code(aid,code),''));
END $$;
REVOKE ALL ON FUNCTION public.event_public(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public(uuid,text) TO anon,authenticated;
