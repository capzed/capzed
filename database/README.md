# Database setup (Neon PostgreSQL)

## Why this design
- PostgreSQL-compatible schema with UUID identifiers and standard SQL.
- Database access belongs on a private server/API only. Do not put credentials in HTML, JavaScript bundles, GitHub commits, or Cloudflare Pages public variables.
- Keep the website usable if the database/API is temporarily unavailable: show a clear unavailable state, never fabricated offers or headlines.
- No images or full publisher articles are stored in the database. Store image URLs, publisher attribution, short original summaries, and canonical links.

## Initial setup
1. Create a free PostgreSQL project in Neon.
2. Copy the pooled connection string into a server-side secret named `DATABASE_URL` (do not commit it).
3. Open Neon's SQL Editor and execute `database/schema.sql`.
4. Confirm that `schema_migrations` contains `0001_initial_schema` and that the tables exist.
5. Keep the owner/admin account mapped to an external authentication identity. This schema intentionally stores no passwords.

## Publishing rules
- Promotions must remain `pending` until an editor verifies the official source, eligibility, terms, dates, and promo code.
- Only `verified` promotions should appear in public offer listings.
- Sponsored promotions and ad campaigns must carry a visible `Sponsored` label and must not be mixed into organic rankings without disclosure.
- News items must link to the original publisher and show source + publication time. Store only a short original summary, not copied article text.
- Expire offers automatically in application logic when `ends_at` has passed; keep records for audit/history.

## Privacy and analytics
- Do not store raw IP addresses by default. Use short-lived, salted/rotating anonymous identifiers only if needed.
- Collect newsletter or Telegram contact details only with clear consent and a withdrawal path.
- Aggregate ad impressions/clicks where possible; define retention and deletion rules before launch.
- Restrict database access by separate least-privilege roles for migrations, API runtime, and read-only reporting.

## Free-tier guardrails
Free tiers have quotas and may change. Monitor compute, storage, and network transfer; avoid frequent polling. Cache public listings and refresh external feeds on a modest schedule. Export periodic SQL backups outside the database provider. A free plan is a $0 starting point, not a guarantee of unlimited or permanent free operation.

## Next implementation milestone
Create a small server-side API that reads published platforms, verified promotions, and published news. Add an authenticated admin workflow for moderation before enabling public live data. Do not connect the public static page directly to PostgreSQL.
