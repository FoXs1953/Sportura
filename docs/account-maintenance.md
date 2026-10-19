# Staging account maintenance

The **Staging account maintenance** GitHub Actions workflow uses the existing
`staging` environment and its SSH secrets. Run it on `dev` only. It shares the
`vps-staging` concurrency group with deployment, and verifies the remote stack
is `/opt/sportura` with the staging domain before accessing the database.
Pushing a change to this workflow on `dev` also runs mail diagnostics only,
without querying accounts. This bootstraps diagnostics while manual workflow
registration on the default branch is pending.

1. Run `inspect` with the requested email. The report shows the number of
   case-insensitive exact matches, account UUID, email confirmation status and
   roles. Copy the UUID for any subsequent change. SMTP preflight checks
   connectivity/provider configuration without sending email; recent sanitized
   delivery error codes are included. SMTP acceptance does not prove delivery
   to an inbox.
2. If account deletion and re-registration have been authorized, run `reset`
   with the same email and the inspected `expected_user_id`. It requires exactly
   one matching account and refuses to delete the last administrator. Before
   deletion it saves a full custom-format PostgreSQL backup under
   `/opt/sportura/backups/account-maintenance/` with private filesystem
   permissions. It rechecks the guards inside the deletion transaction. Related
   data follows the database's existing foreign-key delete rules.
3. Register again through the website and open the confirmation link. Run
   `inspect` again: re-registration creates a new UUID.
4. Run `grant-admin` with that new UUID and email. It grants the existing `admin`
   role only when the account's email is confirmed. The operation is idempotent.
   The application has no separate `superadmin` role.

Neither operation creates an account/password, confirms an email, sends a message,
or touches production. Granting admin does not repair SMTP delivery.

The workflow never prints credentials, SMTP responses, confirmation links,
password hashes or email message content. Email inputs are still visible to
people who can inspect workflow dispatch metadata. Backups contain sensitive
data; they stay on the VPS and are never uploaded as Actions artifacts. Keep
them until the requested account recovery is verified, then remove them through
the normal server backup policy. Restore into a separate database for review;
do not overwrite the running database as an account recovery shortcut.

For local validation, run:

```sh
bash -n scripts/staging-account-maintenance.sh
node --test tests/staging-account-maintenance.test.ts
```
