# Sportura

- Production website: https://sportura.kz, on the ps.kz VPS, deployed from `main` by `.github/workflows/deploy-production.yml`. Vercel is no longer used.
- Staging: https://staging.sportura.kz, on the same VPS, deployed from `dev` by `.github/workflows/deploy-staging.yml`. Both share `.github/workflows/deploy-vps.yml`; see `docs/deploy.md`.
- The owner authorized a fresh independent database on 2026-09-27, and production started with a fresh database on the VPS on 2026-10-04; earlier data does not need migration. Preserve new production data from then on.
- Do not rewrite published Git history or force-push shared branches.
