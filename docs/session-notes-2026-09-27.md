# Session notes: 27–28 September 2026

Where things stand after moving Sportura off Supabase and preparing the ps.kz
staging server, and what to do next.

## Current state at a glance

| Area | Status |
|---|---|
| Code rewrite to plain Postgres | ✅ Done and tested locally, **not committed** |
| Git branch | `self-hosted-postgres` (all changes are uncommitted in the working tree) |
| Staging domain `staging.sportura.kz` | ✅ DNS points to `213.155.22.170` |
| VPS OS | ✅ Reinstalled as Ubuntu 24.04 (Debian 11 was end-of-life) |
| VPS setup (Docker, `deploy` user, firewall) | ✅ Done (step 2 of the guide) |
| Deploy SSH key | ✅ Created and installed; ⚠️ check that its passphrase was removed |
| Server host key (`STAGING_SSH_KNOWN_HOSTS`) | ⏳ Was in progress |
| GitHub environment and secrets | ⏳ Not started (guide steps 4–5) |
| First deploy | ⏳ Not started |

Full guide: [deploy-staging.md](deploy-staging.md).

## What was done

### 1. Database runs on plain Postgres
- [db/platform.sql](../db/platform.sql) recreates what Supabase provided: user
  roles, the `auth` tables, the `storage` tables, and the self-hosted sign-in
  tables.
- [scripts/db-migrate.mjs](../scripts/db-migrate.mjs) applies the platform file
  and all migrations, and creates the limited app user `sportura_app`.
  Running it again changes nothing.
- The every-5-minutes reminder job (`pg_cron`) is **turned off**, at your
  request, by migration `20260927110000_disable_profile_reminder_job.sql`.
- Local Postgres: `npm run db:up`, then `npm run db:migrate`.

### 2. App code no longer uses Supabase
- **Data:** [src/lib/db.server.ts](../src/lib/db.server.ts) runs every query as
  the signed-in user, so the existing row-level security rules still apply.
- **Sign-in:** built on your own Postgres: email and password, sessions in a
  secure cookie, confirmation and password-reset links, and optional Google
  sign-in. The code is in `src/lib/auth.*.ts` and `src/routes/api/auth/`.
- **File uploads:** saved to the server disk, opened through links that expire
  after an hour ([src/lib/files.server.ts](../src/lib/files.server.ts)).
- **Emails:** sent through SMTP if `SMTP_URL` is set. Otherwise they are
  written to the app log.
- **Removed:** `@supabase/supabase-js` and 24 unused server functions.
- **Differences you'll notice:** new users are signed in right after sign-up,
  and the SMS phone-confirmation button is gone (no SMS provider yet).

### 3. CI/CD for staging
- [.github/workflows/deploy-staging.yml](../.github/workflows/deploy-staging.yml):
  test → build Docker image → deploy to the VPS over SSH → smoke check.
- [Dockerfile](../Dockerfile) and [deploy/](../deploy/) contain the server
  stack: Postgres 16, the app, and Caddy with automatic HTTPS.

### 4. Tests that passed
- `npm test`: unit tests plus database checks.
- Browser test in Chrome with 20 checks: sign up, email confirmation, avatar
  upload, sign out, password reset, sign in, admin panel, joining a paid event,
  and Kaspi receipt upload.
- The full Docker stack locally: HTTPS, the maintenance endpoint and the health
  endpoint.

## Tomorrow: what to do, in order

### Step A: finish the SSH key (5 min)
1. Make sure the key has no passphrase. This must print a result
   **without asking for anything**:
   ```powershell
   ssh -i $HOME\.ssh\sportura-staging-deploy deploy@213.155.22.170 "docker ps"
   ```
   If it asks for a passphrase, run
   `ssh-keygen -p -f $HOME\.ssh\sportura-staging-deploy` and press Enter for an
   empty new passphrase.
2. Get the host key line for GitHub:
   ```powershell
   $k = (ssh ubuntu@213.155.22.170 "cat /etc/ssh/ssh_host_ed25519_key.pub").Split(' ')
   "213.155.22.170 $($k[0]) $($k[1])"
   ```

### Step B: which branch deploys staging ✅ decided
Pushes to **`dev`** deploy staging. `main` keeps deploying production to
Vercel/Supabase, so do not merge this work into `main` until production moves
too.

### Step C: prepare the env values (guide step 4)
In Git Bash, generate each random value with `openssl rand -hex 32`. Fill in
[deploy/staging.env.example](../deploy/staging.env.example) in a scratch file
**outside the repo**:
- `STAGING_DOMAIN=staging.sportura.kz`
- `DB_OWNER_PASSWORD`, `APP_DB_PASSWORD`, `FILE_URL_SECRET`, `CRON_SECRET`
- Optional: `SMTP_URL` and `MAIL_FROM` for real emails; `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` for Google sign-in (redirect URI
  `https://staging.sportura.kz/api/auth/google/callback`)

Keep a copy in your password manager. GitHub never shows secrets again.

### Step D: configure GitHub (guide step 5)
1. Actions tab on `github.com/Adilet111/Sportura`: enable workflows if asked.
2. Settings → Environments → create `staging` and limit it to the `dev` branch.
3. Add 5 secrets:

   | Secret | Value |
   |---|---|
   | `STAGING_SSH_HOST` | `213.155.22.170` |
   | `STAGING_SSH_USER` | `deploy` |
   | `STAGING_SSH_KEY` | copy with `Get-Content $HOME\.ssh\sportura-staging-deploy -Raw \| Set-Clipboard` |
   | `STAGING_SSH_KNOWN_HOSTS` | the line from Step A.2 |
   | `STAGING_ENV_FILE` | the whole env file from Step C |

4. Add 1 variable: `STAGING_URL` = `https://staging.sportura.kz`.

### Step E: first deploy (guide steps 6–7)
1. Push `dev`, or run **Actions → Deploy staging → Run workflow**.
2. Open https://staging.sportura.kz and create an account.
3. Without SMTP, find the confirmation link on the server:
   ```sh
   ssh -i ~/.ssh/sportura-staging-deploy deploy@213.155.22.170
   cd /opt/sportura && docker compose logs app | grep "\[mail\]" -A4
   ```
4. Make yourself admin:
   ```sh
   docker compose exec db psql -U sportura -d sportura -c \
     "INSERT INTO public.user_roles(user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'YOUR@EMAIL' ON CONFLICT DO NOTHING;"
   ```
5. After the first build, make sure the image at
   `github.com/Adilet111?tab=packages` is **Private**.

## Later
- Set up nightly database backups (guide, "Day-to-day" section) and copy them
  off the VPS.
- Connect an SMTP provider so real users receive emails.
- Turn scheduled reminders back on when needed: one crontab line calling
  `/api/public/cron/maintenance` (see [db/README.md](../db/README.md)).
- Update the old Supabase notes in `README.md` and
  [event-workspaces.md](event-workspaces.md).
