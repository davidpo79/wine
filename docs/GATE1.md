# Gate 1 · Landing page approval

Staging: https://vinho.prendadenatal.com (ifthenpay sandbox / test keys once set)
Admin: https://vinho.prendadenatal.com/admin

## Test payments
Stripe test mode (cards): `4242 4242 4242 4242`, any future date/CVC; 3-D Secure `4000 0027 6000 3184`. After paying, accept the one-click offer on `/oferta`.

ifthenpay sandbox (see docs/IFTHENPAY.md):
- Card (sandbox): success `4012 0010 3714 1112`, CVC 212, exp 12/27. Error: `4761 7390 0101 0135`, CVC 608, exp 12/29.
- Multibanco (sandbox): choose Multibanco; the thank-you page shows entity/reference. Simulate the payment with the ifthenpay Webhook Tester (method MB, same orderId/amount/reference).
- MB WAY: no sandbox. Needs a test key from ifthenpay, or one real small payment refunded from the admin.
- One-time offer: click "Pagar", accept "Sim, juntar à encomenda", pay; check the add-on on the admin order page and in both CSV exports.

## Tracking verification checklist
| # | Check | How | Result |
|---|---|---|---|
| 1 | Test Events shows browser + server events deduplicated for the full funnel | Events Manager → Test Events with `META_TEST_EVENT_CODE`; accept cookies; select bundle; order; pay | pending: needs Pixel ID, CAPI token |
| 2 | Card test purchase → Purchase once, correct value | Payment integration test (mock ifthenpay) passes locally (32/32); repeat on staging with sandbox keys | local PASS, staging pending |
| 3 | Multibanco → no Purchase until async success | Covered by the integration test; repeat on staging | local PASS, staging pending |
| 4 | Rejecting cookies → no Pixel requests | DevTools Network filter `facebook`: zero requests after "Rejeitar tudo". The Pixel script is only injected after Marketing consent | code path verified locally (no Pixel ID set); repeat with real ID |
| 5 | `prendadenatal.com` verified in Meta Business Manager | David, steps below | pending |

## Meta domain verification (David)
1. business.facebook.com → Settings (Definições do negócio) → Brand safety → **Domains** → Add → `prendadenatal.com`.
2. Choose **DNS TXT record**. Meta shows a value like `facebook-domain-verification=xxxxxxxx`.
3. In Namecheap → Domain List → `prendadenatal.com` → Advanced DNS → Add new record: Type `TXT`, Host `@`, Value = the string from step 2, TTL Automatic. (I can add this record via the Namecheap connector if you send me the value.)
4. Back in Meta, click **Verify** (can take up to 72h, usually minutes).
5. Then Events Manager → your dataset → Settings → **Aggregated Event Measurement** is no longer required for web, but make sure `Purchase` is the optimization event.

## Lighthouse (local production build)
Mobile: Performance 91 · Accessibility 100 · Best Practices 100 · SEO 100. Desktop: 100 · 100 · 100 · 100.
Will be re-run against staging.
