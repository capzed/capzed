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
- Latest News section reserved for attributed headlines
- Advertising and sponsored-placement slots
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
