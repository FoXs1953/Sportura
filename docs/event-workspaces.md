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

## Release state — 2026-09-27

- Published to https://sportura.vercel.app using the independent Supabase project `tuwudsketceekclbnqhi` in the Sportura organization.
- The owner authorized a fresh installation without migrating prelaunch accounts or content. Sixteen migrations are applied; public tables have RLS and the required private storage buckets exist.
- Production and preview configuration use the new database. Site URL and auth redirects point to the Vercel site.
- Verified live organizer sections, profile, participant permissions, registration and cancellation, and generated recovery-link destination. Temporary verification accounts and event were removed.
- Fixed protected-route redirection after client hydration and translated event history statuses.
- TypeScript, unit/database integration tests and production build passed. Desktop browser flows were checked; mobile verification was not completed in this release pass.

## Remaining external setup

- Custom SMTP is required for registration and password-reset email delivery to ordinary users. The default Supabase mail service restricts delivery to project-team addresses. Delivery is not yet verified. Accounts in the fresh database must be registered again.
- The old provider is disconnected from the application and its GitHub App removal was verified. Physical deletion of its old cloud project/data was not performed because that project is inaccessible through the available independent Supabase account.
