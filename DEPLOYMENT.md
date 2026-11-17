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
Open `/admin.html`, enter the secret token, then register platforms as drafts. Submit promotions; they are saved as pending and are not public. Use SQL or a future moderation workflow to publish platforms (set `status='published'`) and verify promotions only after checking official terms.

The current API supports public read-only lists and authenticated platform/promotion creation plus promotion status changes. It does not yet implement ad billing, newsletter sending, automatic news ingestion, or full role-based authentication.

## Production safety
The current live domain may still be serving the separate Education site. Do not attach this Pages project to `automatet.com` or modify DNS until the new project has been deployed and tested on its `pages.dev` address, with a rollback plan.
