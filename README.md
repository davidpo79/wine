# vinho.prendadenatal.com

Christmas direct-sales landing page for Wine Portugal (Trilogia 2160), with Stripe Checkout, admin and Meta/GA4 tracking.
Brief: see the project brief. Status and open items: [PROGRESS.md](PROGRESS.md). Gate 1 checklist: [docs/GATE1.md](docs/GATE1.md).

## Stack
Next.js 15 (App Router, TypeScript) · Tailwind 4 · Drizzle + Postgres · Railway Bucket (S3) · Stripe Checkout · Resend · Meta Pixel + CAPI · GA4.

## Local development
```bash
npm install
cp .env.example .env          # set DATABASE_URL at least
npm run db:migrate && npm run db:seed
npm run admin:create -- you@example.com 'a-long-password'
npm run dev                   # http://localhost:3000, admin at /admin
```

## Scripts
| Command | What it does |
|---|---|
| `npm run db:generate` | New migration from `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` | Apply migrations / idempotent seed (also run on every Railway deploy) |
| `npm run admin:create -- email [pw]` | Create or reset an admin |
| `npm test` | Unit tests |
| `npx tsx scripts/test-webhooks.ts [url]` | Signed Stripe webhook integration test (needs `STRIPE_WEBHOOK_SECRET` matching the server) |
| `npm run ebook:previews -- file.pdf 1,5,9,14` | Upload e-book to `private/` and page previews to `public/ebook/` |
| `npm run report:daily` | Daily sales report (Postgres). `/report-daily` in Claude Code adds Meta data |
| `npx tsx scripts/screenshot.ts <url> <dir>` | Mobile 390px + desktop 1440px screenshots |

## Where things live
- `src/app/(site)` public pages · `src/app/admin` admin · `src/app/api` checkout, webhook, tracking, health
- `src/lib` business logic (orders, Stripe, emails, tracking, settings, auth)
- `src/components/landing/content.ts` customer-facing copy (pt-PT)
- Prices, shipping, badges, cutoff date, banner text: **admin**, never in code.
