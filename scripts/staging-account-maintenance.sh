#!/usr/bin/env bash
# Executed on the staging VPS through SSH. Never source the deployment .env.
set -euo pipefail
umask 077

operation=${operation:-${1:-}}
account_email=${account_email:-${2:-}}
expected_user_id=${expected_user_id:-${3:-}}

refuse() { printf '%s\n' "Maintenance refused: $1" >&2; exit 1; }
case "$operation" in
  diagnostics) [[ -z "$account_email$expected_user_id" ]] || refuse 'diagnostics takes no account inputs' ;;
  inspect|reset|grant-admin)
    # No control characters, whitespace or multiple addresses. SQL quoting is
    # still delegated to psql variables, including apostrophes in valid emails.
    [[ ${#account_email} -le 254 && "$account_email" != *[[:cntrl:]]* \
      && "$account_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
      || refuse 'provide one email address'
    if [[ "$operation" != inspect ]]; then
      [[ "$expected_user_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
        || refuse 'reset and grant-admin require the inspected account UUID'
    fi
    ;;
  *) refuse 'unknown operation' ;;
esac

cd /opt/sportura
[[ -f .env ]] && grep -qx 'DEPLOY_ENV=staging' .env \
  && grep -qx 'SITE_DOMAIN=staging.sportura.kz' .env \
  || refuse 'this is not the staging stack'

psql_account() {
  # Interactive stdin is intentional here: it contains ONLY this command's SQL
  # heredoc, never the outer bash script streamed over SSH.
  docker compose exec -T db psql -X --no-password --quiet --tuples-only --no-align \
    --username=sportura --dbname=sportura --set=ON_ERROR_STOP=1 \
    --set=VERBOSITY=terse --set=operation="$operation" \
    --set=account_email="$account_email" --set=expected_user_id="$expected_user_id" \
    --set=apply_change="${1:-false}"
}

guarded_account_change() {
  psql_account "$1" <<'SQL_MAINTENANCE'
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE maintenance_request ON COMMIT DROP AS
SELECT :'operation'::text AS operation, :'account_email'::text AS email,
       :'expected_user_id'::uuid AS expected_user_id, :'apply_change'::boolean AS apply_change;
LOCK TABLE auth.users, public.user_roles IN SHARE ROW EXCLUSIVE MODE;
DO $maintenance$
DECLARE
  request record;
  account record;
  matches integer;
BEGIN
  SELECT * INTO STRICT request FROM maintenance_request;
  IF request.operation NOT IN ('reset', 'grant-admin') THEN
    RAISE EXCEPTION 'Unsupported account change';
  END IF;
  SELECT count(*) INTO matches FROM auth.users WHERE lower(email) = lower(request.email);
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one matching account; inspect again';
  END IF;
  SELECT id, email_confirmed_at INTO STRICT account
  FROM auth.users WHERE lower(email) = lower(request.email);
  IF account.id <> request.expected_user_id THEN
    RAISE EXCEPTION 'Account UUID changed; inspect again';
  END IF;
  IF request.operation = 'reset' THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = account.id AND role = 'admin')
       AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Cannot delete the last administrator';
    END IF;
    IF request.apply_change THEN
      DELETE FROM auth.users WHERE id = account.id;
    END IF;
  ELSE
    IF account.email_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Confirm the email through the normal signup flow before granting admin';
    END IF;
    IF request.apply_change THEN
      INSERT INTO public.user_roles(user_id, role) VALUES (account.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END
$maintenance$;
SELECT json_build_object('operation', operation, 'applied', apply_change,
                         'user_id', expected_user_id) FROM maintenance_request;
COMMIT;
SQL_MAINTENANCE
}

case "$operation" in
  inspect)
    psql_account false <<'SQL_INSPECT'
BEGIN READ ONLY;
SELECT json_build_object('matched_accounts', count(*))
FROM auth.users WHERE lower(email) = lower(:'account_email');
SELECT json_build_object('user_id', u.id,
  'email_confirmed', u.email_confirmed_at IS NOT NULL,
  'roles', COALESCE((SELECT json_agg(role::text ORDER BY role::text)
                    FROM public.user_roles WHERE user_id = u.id), '[]'::json))
FROM auth.users u WHERE lower(u.email) = lower(:'account_email');
COMMIT;
SQL_INSPECT
    ;;
  reset)
    guarded_account_change false
    # The backup contains private auth/application data and stays on this VPS.
    backup_directory=/opt/sportura/backups/account-maintenance
    install -d -m 700 "$backup_directory"
    backup=$(mktemp "$backup_directory/reset-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump")
    if ! docker compose exec -T --interactive=false db \
      pg_dump --username=sportura --dbname=sportura --format=custom --no-owner --no-acl \
      < /dev/null > "$backup"; then
      rm -f "$backup"
      refuse 'database backup failed; account has not been deleted'
    fi
    [[ -s "$backup" ]] || refuse 'database backup is empty; account has not been deleted'
    printf 'Private staging backup saved: %s\n' "$backup"
    # Recheck email, UUID and last-admin protection after backup, under DB locks.
    guarded_account_change true
    ;;
  grant-admin) guarded_account_change true ;;
esac

if [[ "$operation" == diagnostics || "$operation" == inspect ]]; then
  # Override the migrate service command: no migrations and no mail is sent.
  docker compose run --rm -T --interactive=false --no-deps migrate \
    node scripts/check-mail.mjs < /dev/null
  # Match the known sanitized diagnostic shape only; no messages or tokens.
  docker compose logs --no-color --no-log-prefix --tail=300 app < /dev/null \
    | awk '/^\[mail\] delivery failed \{ code: '\''[A-Z0-9_]+'\'', responseCode: (undefined|[0-9][0-9][0-9]) \}$/ { print }'
fi
