# Cloudflare Pages + Neon deployment notes

This repository is designed for Cloudflare Pages static hosting with Pages Functions.

## Required Pages settings
- Framework preset: None
- Build command: `npm install`
- Build output directory: `.`
- Root directory: `/`

## Required runtime secrets
In Cloudflare Pages → Settings → Variables and Secrets, add these as encrypted secrets for Production (and Preview only if needed):
- `DATABASE_URL`: Neon pooled PostgreSQL connection string.
- `ADMIN_API_TOKEN`: long random token used by the editorial console.

Do not place either value in `.env.example`, HTML, frontend JavaScript, or GitHub.

## Database
Run `database/schema.sql` once in the Neon SQL Editor. Confirm the schema migration row exists.

## Local preview
```sh
npm install
npm run check
npm run dev
```

## Admin
Open `/admin.html`, enter the `ADMIN_API_TOKEN`, then register platforms as drafts. Check their official identity and website before publishing. Submit promotions; they are saved as pending and are not public until you verify them from the pending queue. Sourced headlines can be entered manually with the publisher and original article URL.

The current API supports public read-only lists and authenticated platform registration, platform publication, promotion submission/moderation, promo-code checks, and manual sourced-news publishing. It does not yet implement ad billing, newsletter sending, automatic news ingestion, or full role-based authentication. The editorial token is a single shared secret; add individual admin identities and role-based access before inviting external editors.

## Production safety
The current live domain may still be serving the separate Education site. Do not attach this Pages project to `automatet.com` or modify DNS until the new project has been deployed and tested on its isolated `pages.dev` address, with a rollback plan.

## GitHub Actions deployment (manual, isolated Pages project)
A manual workflow is available at **Actions → Deploy AUTOMATET Crypto Deals → Run workflow**. It deploys the `main` branch to the separate `automatet-crypto-deals` Pages project and never changes `automatet.com`.

Before running it, add these repository Actions secrets in GitHub:
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to the target account with Cloudflare Pages edit permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

The workflow validates JavaScript, deploys the isolated Pages project, then runs production smoke tests against `https://automatet-crypto-deals.pages.dev`. The tests check the homepage, Neon health, public API response shapes, and that the admin API rejects requests without a bearer token. The workflow is manual-only; pushes to `main` do not publish automatically.

After the first deployment, add these encrypted variables/secrets in Cloudflare Pages → Settings → Variables and Secrets for the Production environment:
- `DATABASE_URL`: the pooled connection string for the dedicated Neon `automatet-crypto-deals` database.
- `ADMIN_API_TOKEN`: a long random secret used only by the editorial console.

Never paste credentials into chat or commit them to GitHub. Keep `automatet.com` untouched until the isolated preview, database API and admin workflow have all been tested.
