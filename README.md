# Sportura

A mobile-first web app for finding and joining pickup games, tournaments and amateur leagues in Astana. Players look for a game by sport, city, time and level and sign up. Organizers post games, run tournaments and mark who showed up.

Live: https://sportura.vercel.app

## What it does

- Sports: football, mini-football, basketball (5x5 and 3x3), volleyball, beach volleyball
- Game feed with filters, and a notification when an organizer posts a new game in your city and sport
- Organizers can create one-off or weekly games and private games that open with an invite code
- Tournaments with brackets and standings: single and double elimination, round robin, groups plus playoff, Swiss, league with a final four
- Player profiles with ratings from other players and a reliability score based on no-shows and cancellations
- Paid games link to the organizer's Kaspi payment page. Sportura itself doesn't take the money
- Kazakh and Russian interface, sign-in with email or Google

## Stack

- React 19, TypeScript, TanStack Start (Router and Query) on Vite
- Tailwind CSS 4, Radix UI
- PostgreSQL 16 via [postgres.js](https://github.com/porsager/postgres), with access rules written as row-level security policies
- Docker and GitHub Actions for deploys to a VPS, see [docs/deploy.md](docs/deploy.md)

## Running locally

You need Node.js 24, [Bun](https://bun.sh) for installing packages (the lockfile is `bun.lock`) and Docker for the database.

```sh
git clone https://github.com/FoXs1953/Sportura.git
cd Sportura
cp .env.example .env
bun install
npm run db:up        # Postgres 16 in Docker on localhost:5432
npm run db:migrate   # db/platform.sql, then everything in supabase/migrations
npm run dev
```

Emails (sign-up confirmation, password reset) only work with `SMTP_URL` and `MAIL_FROM` set in `.env`. Google sign-in is optional and needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Other scripts: `npm test`, `npm run lint`, `npm run build`. More on the database setup in [db/README.md](db/README.md).

The original product brief is in [docs/product-brief.md](docs/product-brief.md).
