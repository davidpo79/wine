# PROGRESS · vinho.prendadenatal.com

Last updated: 10/10/2026 (session 1)

## 10/10 (session 1, later): landing page rebuilt from David's reference (trilogia-2160-claude-code-spec.html): exact markup/CSS/interactions, real photos, prices 45,90 / 82,62 / 117,05, Stripe as main CTA + WhatsApp secondary. Admin in English.

## Status: Phases 1 to 5 built. Waiting for Gate 1 inputs (Stripe test keys, Resend, Meta/GA4 IDs) before the tracking checklist can be completed. Stopped at GATE 1.

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
- Age gate (cookie 30 days), consent banner, marquee, sticky mobile CTA, real countdown to `settings.cutoff_at`, post-cutoff modes (closed / after Christmas / sold out).
- Bundles always read from DB; x2 preselected; per-bottle price; savings vs. compare-at.
- Illustrated placeholders (abstract bottles with blank labels, clearly tagged) until real photos arrive. Real photos uploaded in admin replace them automatically.
- E-book section uses styled placeholder cards; real page previews replace them once `npm run ebook:previews` is run and the keys are set in admin.
- Legal templates: `/termos`, `/privacidade`, `/envios-devolucoes` (14-day withdrawal, DL 24/2014, opened-bottle note, withdrawal form).
- Product JSON-LD with real prices, OG image 1200x630, robots, sitemap.
- Lighthouse (local production build, mobile): Performance 91, Accessibility 100, Best Practices 100, SEO 100. Desktop: 100/100/100/100.

### Phase 3: Checkout and webhooks
- `POST /api/checkout`: only `bundle_key`, gift fields and event id from the client; price, shipping and availability from DB; stock cap and closed-sales checks; order row `pending_payment` created before redirect.
- Stripe Checkout: card (Apple/Google Pay), MB WAY, Multibanco (`allowed_payment_method_types`, configurable via `STRIPE_PAYMENT_METHODS`), PT shipping only, phone, optional NIF (9 digits), optional newsletter opt-in, locale pt, 2h expiry.
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

## In progress
- First deploy on `wine` service (Dropshipping v2).

## Blocked (waiting for David)
See "Gate 1 inputs" below. Without Stripe test keys the end-to-end checkout and the Meta Test Events checklist cannot be run on staging.

## Gate 1 inputs needed
| Item | Where it goes |
|---|---|
| Stripe TEST keys: `STRIPE_SECRET_KEY` (sk_test), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Railway → vinho-prendadenatal → web → Variables |
| Stripe webhook secret: create endpoint `https://vinho.prendadenatal.com/api/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded` → `STRIPE_WEBHOOK_SECRET` | Railway (web service) |
| Confirm MB WAY and Multibanco are enabled in Stripe (Settings → Payment methods) | Stripe dashboard |
| Resend API key + verified sender domain → `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL` | Railway (web service) |
| Meta Pixel ID, CAPI token, Test Event Code → `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_TEST_EVENT_CODE` | Railway (web service) |
| GA4 Measurement ID + Measurement Protocol API secret → `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` (new, not in brief) | Railway (web service) |
| Admin email + first password: set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` (12+ chars) on the web service; the next deploy creates the admin; then delete `ADMIN_INITIAL_PASSWORD` | Railway (web service) |
| Real photos (box closed/open, 3 bottles, lifestyle), logo SVG, e-book PDF final | Upload in admin / send files |
| Legal entity (name, NIF, address), RAL entity, returns policy details | `src/lib/site.ts` and legal pages |
| Tasting notes for the 3 wines, bottle volume | `src/components/landing/content.ts` |
| Gift box cost, real CTT cost per parcel, VAT rate confirmation | unit economics |
| Certified invoicing software name (accounting export format), CTT import template | exports |

## Open questions / flags for David
1. Invoicing: Stripe receipts are not AT-certified invoices. Launch plan: admin shows "Fatura pendente", accounting CSV goes to the accountant's certified software, invoice number recorded per order.
2. Compare-at prices (91,80 € / 137,70 €) are "price of buying the boxes separately", not a previous price. Shown as strike-through with a screen-reader label. Legal review recommended (Omnibus price-reduction rules).
3. Anonymous funnel counting (no cookies, no identifiers) runs without consent; UTM cookie is set without consent. Both flagged in the privacy policy for legal review.
4. CAPI is sent only with Marketing consent (brief default). Change only after legal review.
5. "Direct from the producer / no middleman" claim from the sample ad is not used anywhere.
6. Order numbers are a global sequence; failed checkout attempts consume numbers (gaps are normal).
7. `SESSION_SECRET` for staging was generated randomly and set by me; rotate in Railway if desired. Production will need its own.
