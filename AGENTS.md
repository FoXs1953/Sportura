# Sportura

- Production website: https://sportura.vercel.app.
- Deploy the application to Vercel from this repository.
- Staging runs on a ps.kz VPS, deployed from the `dev` branch by `.github/workflows/deploy-staging.yml`; see `docs/deploy-staging.md`.
- The owner authorized a fresh independent database on 2026-09-27; prelaunch data does not need migration. Preserve new production data after this reset.
- Do not rewrite published Git history or force-push shared branches.
