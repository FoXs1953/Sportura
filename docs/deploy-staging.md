# Staging deployment (ps.kz VPS + GitHub Actions)

Every push to `dev` (or a manual run) does this. `main` keeps deploying
production to Vercel.

```
GitHub Actions                                   VPS  /opt/sportura
───────────────────────────────────────────      ─────────────────────────────
1. test    bun install, npm test
2. build   Docker image → ghcr.io (private)
3. deploy  scp compose + Caddyfile ────────────▶ docker-compose.yml, Caddyfile
           write .env from secret ─────────────▶ .env (chmod 600)
           ssh: pull, migrate, restart ────────▶ db (Postgres 16) ← migrate
                                                 app (Node) ← caddy (HTTPS :443)
4. smoke   curl https://<staging domain>
```

Files involved: [Dockerfile](../Dockerfile),
[deploy/docker-compose.yml](../deploy/docker-compose.yml),
[deploy/Caddyfile](../deploy/Caddyfile),
[deploy/staging.env.example](../deploy/staging.env.example),
[.github/workflows/deploy-staging.yml](../.github/workflows/deploy-staging.yml).

Secrets live in a GitHub **environment** named `staging`. Nobody can read a
secret back after saving it, including you, so keep a copy of each value in
your password manager.

---

## Step 1: Choose the staging domain

1. Pick a hostname, for example `staging.sportura.kz`.
2. At your DNS provider, create an **A record** pointing it at the VPS IPv4
   address from the ps.kz control panel.
3. Wait until `nslookup staging.sportura.kz` returns the VPS IP. Caddy can only
   get an HTTPS certificate once DNS resolves.

## Step 2: Prepare the VPS (once)

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
sudo install -d -o deploy -g deploy -m 750 /opt/sportura
sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
```

> Membership in the `docker` group is effectively root on this machine. That
> is acceptable for a staging box; keep the SSH key below only in GitHub.

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
`STAGING_SSH_KNOWN_HOSTS` value. In Git Bash,
`ssh-keyscan -t ed25519 <VPS_IP> 2>/dev/null` gives the same line.

Optional hardening once key login works: add your own key for `ubuntu`, then in
`/etc/ssh/sshd_config` set `PasswordAuthentication no` and run
`sudo systemctl restart ssh`.

## Step 4: Prepare the environment values

Copy [deploy/staging.env.example](../deploy/staging.env.example) to a scratch
file outside the repo and fill it in. Generate the random values with
`openssl rand -hex 24` in Git Bash (PowerShell has no `openssl`):

| Variable | Where it comes from |
|---|---|
| `STAGING_DOMAIN` | Step 1, without `https://` |
| `DB_OWNER_PASSWORD` | `openssl rand -hex 24` |
| `APP_DB_PASSWORD` | `openssl rand -hex 24` (a different one) |
| `FILE_URL_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SMTP_URL`, `MAIL_FROM` | *Optional.* Your mail provider's SMTP settings |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | *Optional.* Google Cloud Console → APIs & Services → Credentials |

**Email.** Sign-up confirmation, password reset and email change send links by
email. Without `SMTP_URL`, the app writes those emails to its log instead; read
them with `docker compose logs app | grep "\[mail\]"`. That is enough to test
staging on your own.

**Google sign-in** is hidden until both Google values are set. Create an
"OAuth client ID" of type *Web application* and add the authorized redirect
URI `https://<staging domain>/api/auth/google/callback`.

## Step 5: Configure GitHub

### 5.1 Enable Actions on the fork

The repository is a fork. Open the **Actions** tab on
`github.com/Adilet111/Sportura`; if GitHub asks, click **"I understand my
workflows, go ahead and enable them"**.

### 5.2 Create the `staging` environment

**Settings → Environments → New environment** → name it `staging` (exact,
lowercase), then:

- **Deployment branches and tags** → *Selected branches and tags* → add `dev`.
  Workflows running from any other branch then cannot read the secrets.
- *Optional:* **Required reviewers** → add yourself. Each deploy then waits for
  your click in the Actions tab.

### 5.3 Add environment secrets

In the `staging` environment → **Environment secrets → Add secret**:

| Secret | Value |
|---|---|
| `STAGING_SSH_HOST` | VPS IP (or hostname) |
| `STAGING_SSH_USER` | `deploy` |
| `STAGING_SSH_KEY` | full contents of the private key file `sportura-staging-deploy`, including the `-----BEGIN/END` lines |
| `STAGING_SSH_KNOWN_HOSTS` | the line printed by `ssh-keyscan` in Step 3 |
| `STAGING_ENV_FILE` | the whole filled-in env file from Step 4, pasted as multi-line text |

### 5.4 Add one environment variable

Still in the `staging` environment → **Environment variables → Add variable**:

| Variable | Value |
|---|---|
| `STAGING_URL` | `https://<staging domain>` |

This one is not secret. It powers the smoke check and the link on the deploy
page.

### Who can see what

- Secret values are write-only. GitHub masks them in logs, and nobody can view
  them in the UI, including you.
- Anyone with **write** access to the repo could create a workflow that uses
  them. Keep yourself as the only collaborator with write access, or enable
  *Required reviewers* (5.2) so every deploy needs your approval.
- Pull requests from other people's forks never receive secrets.

After saving everything, delete the scratch env file and the local private key
(`sportura-staging-deploy`), or move them into your password manager.

## Step 6: First deploy

1. Commit and push to `dev`, or open **Actions → Deploy staging → Run
   workflow**.
2. Watch the three jobs: `test` → `build` → `deploy`. The first build takes a
   few minutes; later ones are cached.
3. The first run creates the database, applies all migrations and creates the
   `sportura_app` database user automatically.
4. Open `https://<staging domain>`.

### Make the container image private

After the first build, open `github.com/Adilet111?tab=packages` → `sportura` →
**Package settings** and confirm the visibility is **Private**.

## Step 7: Check on the server

```sh
ssh -i sportura-staging-deploy deploy@<VPS_IP>
cd /opt/sportura
docker compose ps                 # db, app, caddy should be "running"/"healthy"
docker compose logs -f app        # application logs
docker compose logs caddy         # HTTPS certificate issues show up here
```

## Day-to-day

**Deploy:** push to `dev`.

**Change an environment value:** edit the `STAGING_ENV_FILE` secret (paste the
whole file again), then **Actions → Deploy staging → Run workflow**.

**Roll back:** open an earlier successful run in Actions → **Re-run jobs** →
choose only `deploy`. It redeploys that run's image.

**Connect to the database** from your laptop (TablePlus, DBeaver, psql, etc.):

```sh
ssh -N -L 5433:127.0.0.1:5432 deploy@<VPS_IP>
# then connect to localhost:5433, database sportura, user sportura
```

**Nightly backups** (on the VPS, `crontab -e` as `deploy`):

```
0 3 * * * cd /opt/sportura && mkdir -p backups && docker compose exec -T db pg_dump -U sportura -Fc sportura > backups/sportura-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

Copy backups off the VPS from time to time. A backup on the same disk does not
survive losing the server.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `deploy` fails with `Host key verification failed` | `STAGING_SSH_KNOWN_HOSTS` is wrong or the server was reinstalled; redo `ssh-keyscan` |
| `Permission denied (publickey)` | the public key is not in `/home/deploy/.ssh/authorized_keys`, or the private key secret is missing its BEGIN/END lines |
| `set X in .env` error from compose | a variable is missing in `STAGING_ENV_FILE` |
| `/opt/sportura: Permission denied` | the directory is not owned by `deploy` (Step 2) |
| Site does not load over HTTPS | DNS does not point at the VPS yet, or ports 80/443 are closed in the ps.kz panel; see `docker compose logs caddy` |
| Smoke check fails but containers run | `docker compose logs app`; usually a missing value in `STAGING_ENV_FILE` |
| No confirmation or reset email arrives | `SMTP_URL` is not set; the links are in `docker compose logs app` |
| Google sign-in shows `redirect_uri_mismatch` | the redirect URI in Google Cloud Console is not exactly `https://<staging domain>/api/auth/google/callback` |
