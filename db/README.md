# Self-hosted PostgreSQL

The schema lives in `supabase/migrations` and runs unchanged on plain
PostgreSQL 16+. `db/platform.sql` supplies what Supabase used to provision:

- roles `anon`, `authenticated`, `service_role` (no login)
- `auth.users`, `auth.sessions`, `auth.uid()`, `auth.jwt()`
- `storage.buckets`, `storage.objects`, `storage.foldername()`

## Local

```sh
npm run db:up                  # PostgreSQL 16 in Docker on localhost:5432
# .env: DATABASE_URL=postgres://sportura:sportura@localhost:5432/sportura
npm run db:migrate             # applies platform.sql, then pending migrations
```

Applied migrations are recorded in `public.schema_migrations`; re-running is safe.

It also adds the self-hosted auth tables (`auth.identities`,
`auth.one_time_tokens`, password and session-token columns) used by
`src/lib/auth.server.ts`. Uploaded files are stored under `STORAGE_DIR`;
`storage.objects` records them so the storage policies still apply.

## Request identity

Row-level security depends on the role and claims set for each transaction.
`src/lib/db.server.ts` (`asUser`, `asAnon`, `asService`) does this for the app:

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"<user uuid>","session_id":"<uuid>"}', true);
SET LOCAL ROLE authenticated;   -- or anon for signed-out visitors
-- queries / function calls
COMMIT;
```

Server-only maintenance (for example `profile_maintenance()`) runs as the
connection owner or `SET LOCAL ROLE service_role`.

## Servers

Migrations run as the database owner. The application should connect as a
separate login role that can only switch into the request roles:

```sql
CREATE ROLE sportura_app LOGIN PASSWORD '<secret>' NOINHERIT;
GRANT anon, authenticated, service_role TO sportura_app;
```

Scheduled maintenance (game reminders, restriction expiry) is currently
disabled. To enable it later, schedule `GET /api/public/cron/maintenance`
from system cron.
