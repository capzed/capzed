# AUTOMATET — Crypto Deals & Exchange Comparison

A lightweight, responsive static website for discovering crypto exchange promotions, comparing CEX/DEX platforms, and reading sourced crypto news.

## Deploy on Cloudflare Pages (free tier)

1. Open the Cloudflare dashboard and select **Workers & Pages → Create → Pages → Connect to Git**.
2. Connect the GitHub repository `capzed/capzed`.
3. Select branch `main`.
4. Framework preset: **None**.
5. Build command: leave empty.
6. Build output directory: `/`.
7. Deploy.
8. In the Pages project, open **Custom domains** and attach `automatet.com` (and `www.automatet.com` if desired). Follow Cloudflare's DNS instructions.

Important: do not change DNS records or the current production Pages project until you have confirmed which project currently serves automatet.com and have a rollback path. The new page is committed in this separate repository; it has not yet been attached to the live domain.

## Current implementation

- Responsive futuristic landing page
- CEX and DEX discovery cards with category filters
- Comparison overview
- Latest News section connected to the sourced-news API (honest placeholder until data exists)
- Verified promotions feed; unverified bonuses and codes are not shown
- Private editorial console at `/admin.html` for platforms, promotions, promo-code checks and sourced headlines
- Advertising and clearly labelled sponsored-placement slots
- Draft privacy, terms and partnership pages
- Telegram: https://t.me/automatetrades
- X: https://x.com/automatetdotcom
- No paid runtime dependencies; static hosting only

## Next production steps

- Connect a verified RSS/news source and store headline, publisher, timestamp, and canonical URL.
- Add an offer-management database and admin workflow before publishing live bonus amounts or promo codes.
- Verify every promotion, expiry date, eligibility condition, and affiliate disclosure.
- Add privacy policy, terms, contact/partnership page, and cookie controls if analytics or advertising technologies require them.
- Replace the reserved ad slots with approved ad-network or direct-partner placements only after account approval.

Do not publish invented bonus amounts, promo codes, or unsourced news. Label sponsored placements clearly.


## Backend architecture

- Cloudflare Pages serves the static website and Pages Functions API.
- Neon PostgreSQL stores platform, promotion, promo-code, news, partner, ad campaign and audit data.
- Public API routes: `/api/health`, `/api/platforms`, `/api/promotions`, `/api/news`.
- Admin API uses the server-side `ADMIN_API_TOKEN` secret. Never expose it in client code or commit it.
- Apply `database/schema.sql` before configuring the API secrets. See `DEPLOYMENT.md`.

The project is not deployed to the production domain. The existing AUTOMATET Education site must remain untouched until the new Pages deployment is tested and a rollback is ready.


## Automatic promotion discovery (new)

- Scheduled GitHub Action checks configured official announcement RSS feeds every 20 minutes.
- New offer-like announcements are inserted into Neon as **pending** promotions, never published automatically.
- Every candidate keeps the original official article URL as source, terms and landing URL.
- The editorial console remains the approval gate; expired offers are already excluded by the public promotions API.
- The first configured feed is Binance's official blog RSS. Add further feeds only after confirming the publisher owns the domain and permits automated access.

### Enable the discovery worker

1. Apply `migrations/0005_automatic_promotion_discovery.sql` to the same Neon database used by the isolated AUTOMATET Crypto Deals Pages project.
2. Add GitHub Actions secret `DATABASE_URL` to repository `capzed/capzed` (use the Neon pooled connection string; never commit it).
3. Ensure the `platforms` table contains a published or draft platform with slug `binance`.
4. Open Actions → AUTOMATET promotion discovery → Run workflow once to test. The scheduled run then repeats every 20 minutes.
5. Review candidates in the Editorial console and verify the exact campaign terms, eligibility, dates and destination before publishing.

This worker only discovers candidates. It does not claim a reward amount, infer eligibility, bypass bot protections, or publish unverified promotions.
