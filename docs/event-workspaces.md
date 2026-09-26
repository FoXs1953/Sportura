# Event workspaces — release notes

## Prepared routes

- `/`: database filtering and pagination, city, dates, venue, price, saved events and reminders.
- `/my-games`: upcoming/live participation, payment proof resubmission, cancellations/refunds, history, reviews, contextual support.
- `/host`: seven sections, account drafts and seven-step publishing, participants, attendance, payment review, refunds, competition fixtures/results, analytics, templates and venues.
- `/activity/:id`: invitation access, individual/team sign-up, terms confirmation, conflicts, payments and competition results.

## Storage and authorization

Four additive migrations dated `20260927` implement owner-scoped event workspaces, event history, payment proof history, refunds, saved events, drafts/templates/venues, matches and contextual support. Registration prices are immutable snapshots. Legacy amounts remain unknown. Capacity is allocated while holding an activity row lock.

Payment confirmation, refunds and prize payouts record manual transfers. They do not execute transfers. Email/push and a waitlist are not connected. Existing in-app notifications and cron reminders are used.

## Verified locally

- TypeScript check passes.
- Ten existing unit tests pass.
- Profile and event integration tests pass against an isolated PostgreSQL-compatible database, including migrations, row permissions, private invitations, capacity, price snapshots, payment resubmission, refunds, league results and support deduplication.
- Production build succeeds with standard Vite, TanStack Start and Nitro targeting Vercel. No vendor build wrapper or private package mirror is required.

## Release state

The changes have not been deployed to the production Vercel site in this task. Browser verification of authenticated workflows remains required after provisioning the independent database.

A schema update was submitted to the previous database before the user requested an immediate stop of work with that provider. Its final transaction outcome was not inspected. Do not assume it committed or replay it without checking migration history through an authorized migration path.

Before switching production:

1. Provision the user's independent Supabase project.
2. Export/import existing users, application rows and storage objects through an authorized backup path. Preserve user UUIDs and relationships; confirm password-hash migration support before promising password continuity.
3. Apply the repository migrations according to the target migration history.
4. Configure auth URLs for `https://sportura.vercel.app`, SMTP/provider configuration and storage policies.
5. Set matching public/server Supabase variables in Vercel. Set `CRON_SECRET` only if using the HTTP maintenance endpoint; database cron reminders already have a SQL migration.
6. Check counts, roles, permissions, sample files, password reset and the end-to-end participant/organizer flows, then deploy and verify desktop/mobile pages.
7. Confirm old repository integration is revoked. Its browser uninstall confirmation did not complete reliably and was handed off to the user.
