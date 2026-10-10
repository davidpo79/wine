# PROGRESS · vinho.prendadenatal.com

Last updated: 10/10/2026 (session 1)

## 10/10 (session 1, later): landing page rebuilt from David's reference (trilogia-2160-claude-code-spec.html): exact markup/CSS/interactions, real photos, prices 45,90 / 82,62 / 117,05, Stripe as main CTA + WhatsApp secondary. Admin in English.

## 10/10 (later): exit popup (5% code NATAL5, step 2 mobile → NATALMAIS free shipping), countdown, sticky checkout, smart checkout (details step before Stripe) with abandoned-checkout follow-up: 20 min message (WhatsApp/SMS + email), AI call via Telnyx at 2 h in call hours, final email next day. Setup: docs/RECOVERY-SETUP.md. Waiting for Telnyx + WhatsApp credentials.

## 10/10 (later): Stripe replaced by ifthenpay (MB WAY, card, Apple/Google Pay, Multibanco). One-time offer moved before payment (ifthenpay has no stored cards / pre-authorization). Telnyx WhatsApp + Telnyx Email added as providers (nothing activated in Telnyx). Setup: docs/IFTHENPAY.md.

## Status: Phases 1 to 5 built. Waiting for Gate 1 inputs (ifthenpay keys, email, Meta/GA4 IDs) before the tracking checklist can be completed. Stopped at GATE 1.

## Done

### Phase 1: Foundation
- Next.js 15 (App Router, TypeScript), Tailwind 4, Drizzle ORM with committed migrations (`drizzle/`).
- Schema per brief section 3, plus: `login_attempts` (admin rate limit), `orders.bundle_key`, `client_ip`/`user_agent`/`ga_client_id` (CAPI and GA4, stored only with consent), `purchase_reported_at` (Purchase sent exactly once), `delivered_at`.
- Idempotent seed (`npm run db:seed`): Trilogia 2160 product, bundles x1/x2/x3, default settings. Never overwrites admin edits.
- Bucket client (S3 SDK), `public/` served through `/media/...`, `private/` only by presigned URL.
- Hosting (per David, 10/10, final): Railway project **vinho-prendadenatal**, environment `staging`, service `web` (branch `claude/wine-portugal-natal-df8491`), with `Postgres` and `Bucket` (ams). Custom domain `vinho.prendadenatal.com` attached to `web`; DNS must point CNAME `vinho` → `7feenjry.up.railway.app` plus TXT `_railway-verify.vinho` (David, at the DNS provider). `SITE_NOINDEX=1` until launch.
- The temporary `wine` service and `wine-bucket` in Dropshipping v2 were removed. Removal of the extra `Postgres` there is staged and needs David's 2FA approval in the Railway dashboard.
- Migrations and seed run as Railway pre-deploy command (`railway.json`). Health check `/api/health`.

### Phase 2: Landing page
- All 17 sections of brief section 4, pt-PT, no em-dashes, mobile first. Reviews section omitted (no real reviews).
- Consent banner (slim bottom bar; age gate removed per David, 18+ stated at checkout and in footer), marquee, sticky mobile CTA, real countdown to `settings.cutoff_at`, post-cutoff modes (closed / after Christmas / sold out).
- Bundles always read from DB; x2 preselected; per-bottle price; savings vs. compare-at.
- Illustrated placeholders (abstract bottles with blank labels, clearly tagged) until real photos arrive. Real photos uploaded in admin replace them automatically.
- E-book section uses styled placeholder cards; real page previews replace them once `npm run ebook:previews` is run and the keys are set in admin.
- Legal templates: `/termos`, `/privacidade`, `/envios-devolucoes` (14-day withdrawal, DL 24/2014, opened-bottle note, withdrawal form).
- Product JSON-LD with real prices, OG image 1200x630, robots, sitemap.
- Lighthouse (local production build, mobile): Performance 91, Accessibility 100, Best Practices 100, SEO 100. Desktop: 100/100/100/100.

### Phase 3: Checkout and webhooks
- `POST /api/checkout`: only `bundle_key`, gift fields and event id from the client; price, shipping and availability from DB; stock cap and closed-sales checks; order row `pending_payment` created before redirect.
- (Superseded 10/10 by ifthenpay, see below.) Stripe Checkout: card (Apple/Google Pay), MB WAY, Multibanco (`allowed_payment_method_types`, configurable via `STRIPE_PAYMENT_METHODS`), PT shipping only, phone, optional NIF (9 digits), optional newsletter opt-in, locale pt, 2h expiry.
- Webhook: signature verified, idempotent via `webhook_log`, compare-and-set status transitions (no double emails on concurrent events). Handles completed (paid / unpaid Multibanco), async succeeded/failed, expired, charge.refunded.
- Emails (Resend): confirmation with 7-day e-book link, Multibanco pending with entity/reference, shipped with CTT link, admin alert. Skipped and logged if Resend is not configured.
- `/obrigado`: order number, next steps, Multibanco reference, e-book download when paid.
- Signed-webhook integration test: `npx tsx scripts/test-webhooks.ts [url]` (15 checks, all passing locally).

### Phase 4: Admin
- `/admin`: argon2 login, httpOnly signed cookie (12h), 5 failures / 15 min rate limit per IP and per email. First admin: `npm run admin:create -- email [password]`.
- Dashboard (today / 7 days / total, by bundle, pending Multibanco, funnel), orders list with filters and search, order detail with timeline and actions (preparing, shipped with CTT + email, delivered, cancel, note, resend confirmation, new e-book link, invoice number).
- CSV exports (shipping for CTT labels, accounting), product/bundle editor with the €39,00 per-box floor, image upload to bucket, settings, creatives review board with ZIP export.

### Phase 5: Tracking
- Consent banner (Accept all / Reject all / Preferences), Google Consent Mode v2 defaults denied, Pixel loaded only after Marketing consent.
- Browser + server events share event ids: PageView, ViewContent, SelectBundle, AddToCart (browser + `/api/track` mirror), InitiateCheckout (server at session creation + browser), Purchase (server on webhook paid + browser on thank-you page). CAPI only for sessions with Marketing consent.
- CAPI user_data hashed and normalized (SHA-256), fbp/fbc, IP, UA. `META_TEST_EVENT_CODE` supported.
- GA4: gtag with consent mode, `purchase` server-side via Measurement Protocol (`transaction_id` = order number).
- UTMs: first touch, 30 days cookie, saved on the order.
- Every send logged in `tracking_events`; anonymous `internal` rows feed the admin funnel.

### Phase 8 groundwork
- `npm run report:daily` (Postgres part) and `/report-daily` Claude Code command (adds Meta data read only, proposes actions, never applies).

## Done: own checkout + ifthenpay + one-time offer
- `/checkout`: Shopify-style page (form left, summary right, collapsible summary on mobile). Payment methods: MB WAY (push + 4 min countdown, status polling), card (ifthenpay hosted page, HMAC-signed return), Apple/Google Pay (Pay by Link, only if keys set), Multibanco (reference on thank-you page + email). Each method shows only when its key is set.
- Every field autosaves to the order draft (800 ms debounce + flush on blur/pagehide), "Guardado" indicator, resume via `/checkout?o=&t=` and localStorage. Recovery starts once email + mobile exist.
- Server-side pricing only, PT mainland postal code validation, NIF optional.
- Payments: `payments` table (one row per attempt, ref <= 15 chars), callback `/api/ifthenpay/callback` (anti-phishing key, exact amount, idempotent via `webhook_log`, double payment flagged), reconciliation via List of Payments every 5 min, expiry of stale attempts, admin refund (API for MB WAY/card, manual for Multibanco).
- One-time offer (before payment, once per order): "Oferta única", big discount, full product photo, "Ainda pode juntar à sua encomenda". Main: complete to the next tier (x1 +36,72 €, x2 +34,43 €, x3 +39,02 €); extras: Espumante 14,90 €, Porto Vintage 15,90 € (prices and photos in admin). Paid in the same payment.
- Trust list in the summary; reviews only when real ones are entered in admin.
- Tests: unit 14/14, payments 32/32 (mock ifthenpay), recovery 7/7, landing + checkout + offer browser checks pass.

## In progress
- Nothing; waiting for Gate 1 inputs.

## Blocked (waiting for David)
See "Gate 1 inputs" below. Without ifthenpay keys the end-to-end checkout and the Meta Test Events checklist cannot be run on staging.

## Gate 1 inputs needed
| Item | Where it goes |
|---|---|
| ifthenpay keys: MB WAY, Multibanco, CCARD (+ test keys; MB WAY has no sandbox), Backoffice key; optional Gateway/Apple/Google keys → `IFTHENPAY_*` | Railway (web service), see docs/IFTHENPAY.md |
| ifthenpay callbacks: set `IFTHENPAY_ANTI_PHISHING_KEY`, then `npx tsx scripts/ifthenpay-callbacks.ts --activate` (or send ifthenpay the printed URLs) | ifthenpay |
| Photos of the Espumante and Porto Vintage for the offer (URL in Admin → Settings) | admin |
| Email: Resend key, or Telnyx Email (`EMAIL_PROVIDER=telnyx`) with a verified domain → `EMAIL_FROM`, `ADMIN_ALERT_EMAIL` | Railway (web service) |
| Meta Pixel ID, CAPI token, Test Event Code → `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_TEST_EVENT_CODE` | Railway (web service) |
| GA4 Measurement ID + Measurement Protocol API secret → `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` (new, not in brief) | Railway (web service) |
| Admin email + first password: set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` (12+ chars) on the web service; the next deploy creates the admin; then delete `ADMIN_INITIAL_PASSWORD` | Railway (web service) |
| Real photos (box closed/open, 3 bottles, lifestyle), logo SVG, e-book PDF final | Upload in admin / send files |
| Legal entity (name, NIF, address), RAL entity, returns policy details | `src/lib/site.ts` and legal pages |
| Tasting notes for the 3 wines, bottle volume | `src/components/landing/content.ts` |
| Gift box cost, real CTT cost per parcel, VAT rate confirmation | unit economics |
| Certified invoicing software name (accounting export format), CTT import template | exports |

## Open questions / flags for David
1. Invoicing: payment receipts are not AT-certified invoices. Launch plan: admin shows "Fatura pendente", accounting CSV goes to the accountant's certified software, invoice number recorded per order.
2. Compare-at prices (91,80 € / 137,70 €) are "price of buying the boxes separately", not a previous price. Shown as strike-through with a screen-reader label. Legal review recommended (Omnibus price-reduction rules).
3. Anonymous funnel counting (no cookies, no identifiers) runs without consent; UTM cookie is set without consent. Both flagged in the privacy policy for legal review.
4. CAPI is sent only with Marketing consent (brief default). Change only after legal review.
5. "Direct from the producer / no middleman" claim from the sample ad is not used anywhere.
6. Order numbers are a global sequence; failed checkout attempts consume numbers (gaps are normal).
7. `SESSION_SECRET` for staging was generated randomly and set by me; rotate in Railway if desired. Production will need its own.
