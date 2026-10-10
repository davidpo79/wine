# ifthenpay setup (payments)

Stripe was replaced by ifthenpay (10/10/2026). Source: David's "ifthenpay Integration Pack" (built from the official docs, June 2026).

## How the checkout pays

| Method | Flow | Confirmed by |
|---|---|---|
| MB WAY | Push to the customer's phone (4 min). The page shows a countdown and polls `/api/pay/status`. | MB WAY status endpoint (server to server) or callback |
| Card (Visa/Mastercard) | Redirect to the ifthenpay hosted page, back to `/pagamento/retorno`. | HMAC-SHA256 `sk` on the return (verified against the docs test vector) or callback |
| Apple Pay / Google Pay | Pay by Link with only the APPLE/GOOGLE accounts (shown only if `IFTHENPAY_GATEWAY_KEY` + `APPLE`/`GOOGLE` keys are set). | Callback |
| Multibanco | Dynamic reference (default 3 days, `IFTHENPAY_MB_EXPIRY_DAYS`) shown on `/obrigado` and emailed. | Callback |

Each attempt is a row in `payments`; its `ref` (e.g. `WP-2026-0001-1`, max 15 chars) is the orderId sent to ifthenpay.
Fulfilment (confirmation email, e-book, Purchase event, admin alert) only runs from a server-side signal, never from a browser redirect without a valid signature.

Safety rules in code:
- Callback: anti-phishing key (constant-time compare), payment must exist, amount must match exactly (mismatch: not confirmed, admin alert), Multibanco reference must match.
- Idempotency (ifthenpay has none): `webhook_log` row per (method, ref, payment datetime, amount) + compare-and-set on the payment status. A retried callback is a no-op.
- Same Multibanco reference paid twice, or a second method paid after the order was already paid: logged as `duplicate_payment` + admin alert for a manual refund.
- Lost callbacks: every 5 minutes the worker asks the List of Payments API about open attempts (each at most every 30 min, last 7 days). Needs `IFTHENPAY_BACKOFFICE_KEY`.
- Expiry: MB WAY after 10 min, Multibanco 2 days after its expiry date, card/wallet after 2 days.

## One-time offer (upsell)

ifthenpay has no stored cards / tokenization and no documented pre-authorization ("transaction on hold"), so a one-click charge after payment is not possible. The offer is shown once, when the customer clicks "Pagar", before the payment starts: "Oferta única", big discount, "Ainda pode juntar à sua encomenda". Accepted items go into `order_addons` (status `pending`) and are paid in the same payment; they become `paid` with the order.

## What David needs to do

1. Contract the methods at ifthenpay and get the keys: MB WAY, Multibanco (dynamic), Card (CCARD), Backoffice key. Optional: Gateway + Apple Pay + Google Pay keys.
2. Ask ifthenpay for test keys: **MB WAY has no documented sandbox** (FLAG 1), and the card sandbox needs a CCARD test key.
3. Put the keys in Railway → vinho-prendadenatal → web → Variables (names in `.env.example`). Keep `IFTHENPAY_SANDBOX=1` until Gate 1 is approved.
4. Generate a random anti-phishing key (32+ chars) into `IFTHENPAY_ANTI_PHISHING_KEY`.
5. Register the callbacks: `npx tsx scripts/ifthenpay-callbacks.ts --activate` (or send ifthenpay the URLs it prints). One per method:
   - MB: `https://vinho.prendadenatal.com/api/ifthenpay/callback?m=mb&key=[ANTI_PHISHING_KEY]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]&orderId=[ORDER_ID]&requestId=[REQUEST_ID]&entity=[ENTITY]&reference=[REFERENCE]`
   - MB WAY: `...?m=mbway&key=[ANTI_PHISHING_KEY]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]&orderId=[ORDER_ID]&requestId=[REQUEST_ID]`
   - Card / Apple / Google: `...?m=card|wallet&key=[ANTI_PHISHING_KEY]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]&id=[ORDER_ID]&payment_method=[PAYMENT_METHOD]`
6. Apple Pay domain verification is not documented (FLAG): ask ifthenpay if `vinho.prendadenatal.com` must be registered.

## Refunds

Admin → order → "Refund via ifthenpay" works for MB WAY, card, Apple/Google Pay (Backoffice key; only the balance received since 20:00 the previous day is available, otherwise ifthenpay answers -1). **Multibanco and Payshop have no refund API** (FLAG 2): return the money by bank transfer, then "Mark refunded (manual transfer)".

## Open flags (to confirm with ifthenpay, suporte@ifthenpay.com, +351 256 245 560)

1. MB WAY test key / test procedure (no sandbox; abusing production can lock the account).
2. Refunds only for MB WAY and cards (by design above).
3. No built-in idempotency (handled in code, above).
4. MB WAY: reusing an orderId on retry is undocumented. We send a new `ref` per attempt.
5. Expired Multibanco reference paid anyway: undocumented. If it happens, the callback still confirms the order (money arrived).
6. Callback source IPs are not published; the anti-phishing key is in the URL and appears in Railway HTTP logs. Rotate it if logs are shared.
7. Rate limits are not published: MB WAY polling is limited to one status call per 3 s per attempt.
8. Payshop is not offered (low value, no refunds). Can be added later.

## Tests

- `npx tsx --test tests/unit.test.ts`: signature test vector, amounts, phone format, callback parsing, Lisbon dates.
- `npx tsx scripts/mock-ifthenpay.ts 4599` + app with `IFTHENPAY_API_BASE=http://localhost:4599` + `npx tsx scripts/test-payments.ts`: 32 checks (MB WAY with offer, Multibanco callbacks incl. wrong key / wrong amount / duplicate / paid twice, card signed return, cancel, reconciliation, refund rules).
