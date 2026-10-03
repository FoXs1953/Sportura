# Sportura

- Production website: https://sportura.kz, on its own ps.kz VPS (being set up), deployed from `main` by `.github/workflows/deploy-production.yml`. Vercel is no longer used.
- Staging: https://staging.sportura.kz, on a separate ps.kz VPS (213.155.22.170), deployed from `dev` by `.github/workflows/deploy-staging.yml`. Both share `.github/workflows/deploy-vps.yml`; see `docs/deploy.md`.
- The owner authorized a fresh independent database on 2026-09-27, and on 2026-10-04 decided production starts with a fresh database on its new VPS; earlier data, including the Vercel deployment's, does not need migration. Preserve production data once the new production server is live.
- Do not rewrite published Git history or force-push shared branches.
