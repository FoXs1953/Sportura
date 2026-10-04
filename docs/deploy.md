# Deployment (ps.kz VPS + GitHub Actions)

Production and staging run on separate ps.kz VPS servers, each a Docker stack
with its own database and uploaded files. On each server a Caddy proxy in
`/opt/sportura-proxy` serves HTTPS for the stacks deployed there; every deploy
uploads only its own site file, so the same setup also works if both stacks
ever share one server.

| | Production | Staging |
|---|---|---|
| Server | production VPS (`PRODUCTION_SSH_HOST`) | staging VPS `213.155.22.170` |
| Site | https://sportura.kz | https://staging.sportura.kz |
| Deployed from | `main` | `dev` |
| Workflow | Deploy production | Deploy staging |
| Stack directory | `/opt/sportura-production` | `/opt/sportura` |
| GitHub environment | `production` | `staging` |
| Secret prefix | `PRODUCTION_` | `STAGING_` |
| Database tunnel port | `5433` | `5432` |

Staging deploys through GitHub Actions to the VPS. `vercel.json` disables the
retired Vercel Git deployment for `dev`, which would otherwise report unrelated
build failures after a successful VPS deployment.

Every push to the branch (or a manual run) does this:

```
GitHub Actions                                   VPS
───────────────────────────────────────────      ─────────────────────────────────
1. test    bun install, npm test
2. build   Docker image → ghcr.io (private)
3. deploy  scp compose files ──────────────────▶ <stack dir>/docker-compose.yml
                                                 /opt/sportura-proxy/{docker-compose.yml,Caddyfile}
           scp this environment's site ────────▶ /opt/sportura-proxy/sites/<env>.caddy
           write .env from secret ─────────────▶ <stack dir>/.env (chmod 600)
           ssh: pull, migrate, restart ────────▶ db (Postgres 16) ← migrate
                                                 app (Node) ← caddy (HTTPS :443)
4. smoke   curl https://<site>
```

Files involved: [Dockerfile](../Dockerfile),
[deploy/docker-compose.yml](../deploy/docker-compose.yml) (one stack),
[deploy/proxy/](../deploy/proxy/) (proxy and per-environment site files),
[deploy/env.example](../deploy/env.example),
[.github/workflows/deploy-vps.yml](../.github/workflows/deploy-vps.yml) (shared steps),
[deploy-production.yml](../.github/workflows/deploy-production.yml),
[deploy-staging.yml](../.github/workflows/deploy-staging.yml).

Secrets live in the GitHub **environments** `production` and `staging`. Nobody
can read a secret back after saving it, including you, so keep a copy of each
value in your password manager.

---

## Step 1: DNS

Each hostname needs an **A record** in the PS.kz DNS zone pointing at the IPv4
address of the server that runs it:

| Record | Points at |
|---|---|
| `staging.sportura.kz` A | staging VPS `213.155.22.170` |
| `sportura.kz` A | production VPS. It still points at the staging VPS; change it to the new server's IP before the first production deploy |
| `www.sportura.kz` CNAME | `sportura.kz` (follows it automatically and redirects there) |

Caddy can only get an HTTPS certificate once DNS resolves to its server;
check with `nslookup sportura.kz`. DNS changes can take up to an hour (TTL).

## Step 2: Prepare each VPS (once per server)

Do this on the staging server and again on the production server.

Use Ubuntu 24.04 LTS (or Debian 13); reinstall from the ps.kz panel if the
server runs an end-of-life release. The ps.kz Ubuntu image logs in as the
`ubuntu` user with `sudo` rather than as root:

```sh
ssh ubuntu@<VPS_IP>
```

Update the system and install Docker:

```sh
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
```

Create a `deploy` user that GitHub Actions will log in as:

```sh
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
```

The deploy user cannot create directories in `/opt`, so create the stack and
proxy directories for that server:

```sh
# staging server
sudo install -d -o deploy -g deploy -m 750 /opt/sportura /opt/sportura-proxy
# production server
sudo install -d -o deploy -g deploy -m 750 /opt/sportura-production /opt/sportura-proxy
```

> Membership in the `docker` group is effectively root on that machine. Keep
> the SSH key below only in GitHub, and use a separate key for each server.

Firewall. Also open ports 22, 80 and 443 in the ps.kz panel firewall if one is
enabled there.

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

PostgreSQL is not exposed: the compose file binds it to `127.0.0.1` only.

## Step 3: Create the deploy SSH key (on your laptop)

Commands below are for Windows PowerShell; run them from your `.ssh` folder,
never inside the repository (the private key must not be committed).

Use a dedicated key without a passphrase, only for GitHub Actions (press Enter
twice at the passphrase prompt):

```powershell
New-Item -ItemType Directory -Force $HOME\.ssh
cd $HOME\.ssh
ssh-keygen -t ed25519 -f sportura-staging-deploy -C "github-actions-staging"
```

Install the public half on the VPS. Copy it to a temporary file, then move it
into place with `sudo` (`-t` lets sudo ask for the `ubuntu` password):

```powershell
Get-Content sportura-staging-deploy.pub | ssh ubuntu@<VPS_IP> "cat > /tmp/deploy.pub"
ssh -t ubuntu@<VPS_IP> "sudo sh -c 'cat /tmp/deploy.pub >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys' && rm /tmp/deploy.pub"
```

Check that it works (no password prompt, prints a `CONTAINER ID ...` header):

```powershell
ssh -i $HOME\.ssh\sportura-staging-deploy deploy@<VPS_IP> "docker ps"
```

Record the server's host key. It stops the workflow from connecting to an
impostor. Read it from the server itself over your existing SSH login (the
`ssh-keyscan` bundled with Windows is too old for Ubuntu 24.04's OpenSSH):

```powershell
$k = (ssh ubuntu@<VPS_IP> "cat /etc/ssh/ssh_host_ed25519_key.pub").Split(' ')
"<VPS_IP> $($k[0]) $($k[1])"
```

The printed line (`<VPS_IP> ssh-ed25519 AAAA...`) is the
`<PREFIX>_SSH_KNOWN_HOSTS` value. In Git Bash,
`ssh-keyscan -t ed25519 <VPS_IP> 2>/dev/null` gives the same line.

Repeat this step for the production server with its own key
(`ssh-keygen -t ed25519 -f sportura-production-deploy -C "github-actions-production"`)
and its own host line. Those become the `PRODUCTION_*` values; the staging
server's key and host line are the `STAGING_*` values.

Optional hardening once key login works: add your own key for `ubuntu`, then in
`/etc/ssh/sshd_config` set `PasswordAuthentication no` and run
`sudo systemctl restart ssh`.

## Step 4: Prepare the environment values

Do this once per environment, with **different values** for production and
staging. Copy [deploy/env.example](../deploy/env.example) to a scratch file
outside the repo and fill it in. Generate the random values with
`openssl rand -hex 24` in Git Bash (PowerShell has no `openssl`):

| Variable | Where it comes from |
|---|---|
| `DB_OWNER_PASSWORD` | `openssl rand -hex 24` |
| `APP_DB_PASSWORD` | `openssl rand -hex 24` (a different one) |
| `FILE_URL_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SMTP_URL`, `MAIL_FROM` | Required for email actions; see below |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | *Optional.* Google Cloud Console → APIs & Services → Credentials |

The workflow adds `IMAGE`, `DEPLOY_ENV`, `SITE_DOMAIN` (which sets `APP_URL`)
and `DB_TUNNEL_PORT` itself; do not put them in the secret.

**Email.** Registration, password reset, confirmation resend and email change
require SMTP. Without `SMTP_URL`, these actions are unavailable and return an
explicit error. Auth capabilities expose only whether email is configured;
confirmation links, credentials and recipient addresses are never logged.
SMTP connection failures return an error instead of reporting that a message
was sent. Registration, confirmation resend and email change also report a
recipient rejection. Password recovery acknowledges the request neutrally
after checking SMTP availability, so its response does not reveal whether an
account exists; any failed token transaction is rolled back.

Any SMTP provider works. With Resend (domain `sportura.kz` verified through
the DKIM and SPF records in the PS.kz DNS zone), create one API key per
environment and use
`SMTP_URL=smtps://resend:<API key>@smtp.resend.com:465` with
`MAIL_FROM=Sportura <noreply@sportura.kz>`. URL-encode the username and
password of any other provider when building `SMTP_URL`.

**Google sign-in** is hidden until both Google values are set. Create an
"OAuth client ID" of type *Web application* and add the authorized redirect
URIs `https://sportura.kz/api/auth/google/callback` and
`https://staging.sportura.kz/api/auth/google/callback`.

## Step 5: Configure GitHub

### 5.1 Enable Actions on the fork

The repository is a fork. Open the **Actions** tab on
`github.com/Adilet111/Sportura`; if GitHub asks, click **"I understand my
workflows, go ahead and enable them"**.

### 5.2 Create the environments

**Settings → Environments → New environment**, twice:

| Environment (exact, lowercase) | Deployment branches and tags |
|---|---|
| `production` | *Selected branches and tags* → `main` |
| `staging` | *Selected branches and tags* → `dev` |

Workflows running from any other branch then cannot read the secrets.
**Required reviewers** → add yourself on `production`, so every production
deploy waits for your click in the Actions tab. It is optional for staging.

### 5.3 Add environment secrets

In each environment → **Environment secrets → Add secret**, with
`PRODUCTION_` in `production` and `STAGING_` in `staging`:

| Secret | Value |
|---|---|
| `<PREFIX>_SSH_HOST` | VPS IP (or hostname) |
| `<PREFIX>_SSH_USER` | `deploy` |
| `<PREFIX>_SSH_KEY` | full contents of the private key file, including the `-----BEGIN/END` lines |
| `<PREFIX>_SSH_KNOWN_HOSTS` | the line printed in Step 3 |
| `<PREFIX>_ENV_FILE` | that environment's filled-in env file from Step 4, pasted as multi-line text |

Sites, directories and database ports are set in the workflow files, so no
environment variables are needed. A `STAGING_URL` variable left over from the
earlier setup is no longer used and can be deleted.

### Who can see what

- Secret values are write-only. GitHub masks them in logs, and nobody can view
  them in the UI, including you.
- Anyone with **write** access to the repo could create a workflow that uses
  them. Keep yourself as the only collaborator with write access, and keep
  *Required reviewers* on `production` (5.2).
- Pull requests from other people's forks never receive secrets.

After saving everything, delete the scratch env files and the local private
keys, or move them into your password manager.

## Step 6: First deploy

**Staging.** Push to `dev`, or open **Actions → Deploy staging → Run
workflow**. The first deploy after the move to `/opt/sportura-proxy` replaces
the old per-stack Caddy on the staging server. Staging keeps its database and
uploads; the site is unavailable for a few seconds while the proxy takes over
ports 80/443 and gets a new certificate.

**Production**, once its server, DNS record and `production` environment are
ready:

1. Merge `dev` into `main` (or open **Actions → Deploy production → Run
   workflow** on `main`). The first run creates an empty production database,
   applies all migrations and creates the `sportura_app` database user.
2. Watch the jobs: `test` → `build` → `deploy`. The first build takes a few
   minutes; later ones are cached. With *Required reviewers* on, approve the
   `deploy` job in the Actions tab.
3. Open https://sportura.kz.
4. Register, confirm the email, then make yourself admin (see Day-to-day →
   Make someone admin).

Until `production` exists in GitHub, pushes to `main` start **Deploy
production** and it fails at the SSH step without touching any server.

### Make the container image private

After the first build, open `github.com/Adilet111?tab=packages` → `sportura` →
**Package settings** and confirm the visibility is **Private**.

## Step 7: Check on the server

```sh
ssh deploy@<VPS_IP>
cd /opt/sportura-production       # or /opt/sportura for staging
docker compose ps                 # db and app should be "running"/"healthy"
docker compose logs -f app        # application logs
cd /opt/sportura-proxy
docker compose logs caddy         # HTTPS certificate issues show up here
```

## Day-to-day

**Deploy:** push to `dev` for staging; merge into `main` for production.

**Change an environment value:** edit that environment's `<PREFIX>_ENV_FILE`
secret (paste the whole file again), then run its deploy workflow.

**Roll back:** open an earlier successful run in Actions → **Re-run jobs** →
choose only `deploy`. It redeploys that run's image.

**Make someone admin** (the account must exist and have a confirmed email):

```sh
cd /opt/sportura-production       # or /opt/sportura for staging
docker compose exec db psql -U sportura -d sportura -c \
  "INSERT INTO public.user_roles(user_id, role) SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'name@example.com' ON CONFLICT DO NOTHING;"
```

**Connect to a database** from your laptop (TablePlus, DBeaver, psql, etc.).
Each stack listens on a loopback port on its server:

```sh
ssh -N -L 6433:127.0.0.1:5433 deploy@<PRODUCTION_IP>   # production → localhost:6433
ssh -N -L 6432:127.0.0.1:5432 deploy@213.155.22.170    # staging    → localhost:6432
# database sportura, user sportura, password DB_OWNER_PASSWORD of that stack
```

**Nightly backups** (on the VPS, `crontab -e` as `deploy`):

```
0 3 * * * cd /opt/sportura-production && mkdir -p backups && docker compose exec -T db pg_dump -U sportura -Fc sportura > backups/sportura-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
30 3 * * * cd /opt/sportura && mkdir -p backups && docker compose exec -T db pg_dump -U sportura -Fc sportura > backups/sportura-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

Copy production backups off the VPS regularly. A backup on the same disk does
not survive losing the server. Uploaded files live in each stack's `uploads`
Docker volume and need their own copy.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `deploy` fails with `Host key verification failed` | `<PREFIX>_SSH_KNOWN_HOSTS` is wrong or the server was reinstalled; redo Step 3 |
| `Permission denied (publickey)` | the public key is not in `/home/deploy/.ssh/authorized_keys`, or the private key secret is missing its BEGIN/END lines |
| `... is missing or not writable` | run the `sudo install -d ...` command printed in the error (Step 2) |
| `set X in .env` error from compose | a variable is missing in `<PREFIX>_ENV_FILE` |
| `Bind for 0.0.0.0:443 failed: port is already allocated` | something else holds 80/443; `docker ps` and stop it (an old staging `caddy` container is removed automatically) |
| `502 Bad Gateway` | that stack is not running or not deployed yet; `docker compose ps` in its directory |
| Site does not load over HTTPS | DNS does not point at the VPS yet, or ports 80/443 are closed in the ps.kz panel; see `docker compose logs caddy` in `/opt/sportura-proxy` |
| Smoke check fails but containers run | `docker compose logs app`; usually a missing value in `<PREFIX>_ENV_FILE` |
| Email actions are unavailable | set `SMTP_URL` and `MAIL_FROM` in `<PREFIX>_ENV_FILE`, then deploy again |
| Email sending returns an error | check the SMTP credentials, sender domain verification and port 465; app logs contain diagnostic codes, never confirmation links |
| Google sign-in shows `redirect_uri_mismatch` | the redirect URI in Google Cloud Console is not exactly `https://<site>/api/auth/google/callback` |
