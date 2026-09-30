-- Platform layer for plain PostgreSQL.
-- The schema in supabase/migrations was written against Supabase, which
-- pre-provisions roles, the auth schema and the storage schema. This file
-- provides the parts of that platform the migrations depend on so they run
-- unchanged on a self-hosted PostgreSQL 16+ server. It is idempotent.

-- ROLES
-- anon/authenticated/service_role are never used to log in. The application
-- connects as its own login role (see db/README.md) and switches with SET ROLE
-- per request, so row-level security applies exactly as it did on Supabase.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;

-- REQUEST IDENTITY
-- The application sets these per transaction:
--   SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","session_id":"<uuid>"}', true);
--   SET LOCAL ROLE authenticated;
-- request.jwt.claim.sub is also honoured for compatibility with existing tests.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt()->>'sub'
  )::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

-- USERS AND SESSIONS
-- Column names match Supabase Auth so existing triggers and functions work.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth.sessions(user_id);

-- SELF-HOSTED AUTHENTICATION (src/lib/auth.server.ts)
-- scrypt hash; NULL for accounts that only sign in with Google.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_hash text;
-- sha256 of the session cookie value; the cookie itself is never stored.
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS token_hash text UNIQUE;

CREATE TABLE IF NOT EXISTS auth.identities (
  provider text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_id),
  UNIQUE (user_id, provider)
);

-- Email confirmation, password recovery and email change links.
CREATE TABLE IF NOT EXISTS auth.one_time_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('confirm_email', 'recovery', 'email_change')),
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS one_time_tokens_user_idx ON auth.one_time_tokens(user_id, purpose);

-- The application manages auth data through service_role only.
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;

-- FILE STORAGE METADATA
-- File bytes live outside the database; these rows record what exists so the
-- storage policies and the attachment/receipt checks in the migrations work.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid,
  owner_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects, storage.buckets TO service_role;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
