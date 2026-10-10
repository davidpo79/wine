# Gate 1 · Landing page approval

Staging: https://vinho.prendadenatal.com (Stripe TEST mode once keys are set)
Admin: https://vinho.prendadenatal.com/admin

## Test payments (Stripe test mode)
- Card: `4242 4242 4242 4242`, any future date, any CVC.
- 3-D Secure: `4000 0027 6000 3184`.
- Multibanco: choose Multibanco in Checkout. The order stays "Pagamento pendente". In the Stripe dashboard (test mode) the payment completes automatically after a few minutes, or use the test voucher page to simulate payment, which fires `checkout.session.async_payment_succeeded`.
- MB WAY: test mode shows an authorize/fail page.

## Tracking verification checklist
| # | Check | How | Result |
|---|---|---|---|
| 1 | Test Events shows browser + server events deduplicated for the full funnel | Events Manager → Test Events with `META_TEST_EVENT_CODE`; accept cookies; select bundle; order; pay | pending: needs Pixel ID, CAPI token |
| 2 | Card test purchase → Purchase once, correct value | Webhook integration test passes locally (15/15); repeat on staging with real test keys | local PASS, staging pending |
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
