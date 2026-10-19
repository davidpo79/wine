# Portugal HR callers

Sales reps call HR managers at Portuguese companies (51–500 employees). The lead list comes from Apollo.io, and reps call from the shop admin with the Telnyx browser phone (#4).

**It is OFF.** It stays off until a Portuguese lawyer approves calling in writing. Until then it runs in demo mode: fictional data, no Apollo calls, no credits spent, no dialing.

## Where the settings live

**Admin → Settings → Outbound calls.** Every non-secret setting below is controlled there:
- A value saved on the screen wins over the Railway variable of the same name.
- An empty field falls back to Railway.

**Secrets stay in Railway only:** `TELNYX_API_KEY` and `APOLLO_API_KEY`. The screen shows whether each is set and never stores or shows its value.

The screen also has a **Test Apollo key** button: Apollo's free search, 1 result, 0 credits, nothing stored.

## Switches (Settings → Outbound calls, or Railway)

| Variable | Default | Meaning |
|---|---|---|
| `PT_CALLERS_ENABLED` | off | Must be exactly `true`. |
| `PT_CALLERS_LEGAL_APPROVED` | off | Must be exactly `true`. Set it only once the lawyer's written approval is on file. |
| `APOLLO_API_KEY` | — | David sets this himself. Use a key limited to search + enrichment, never the master key. It is used only when both switches are `true`; otherwise the mock is used. |
| `APOLLO_WEBHOOK_BASE_URL` | — | `https://` base of the shop, for example `https://wine.example`. Phone results arrive at `/api/apollo/webhook/<request>/<secret>`. |
| `PT_CALLERS_APOLLO_RESULT_MODE` | `webhook` | Set `poll` to use Apollo's `poll_only` mode instead. The two are never used together. |
| `APOLLO_DAILY_CREDIT_CAP`, `APOLLO_MONTHLY_CREDIT_CAP` | unset = **no cap** | Optional. A number caps credits per Lisbon day or month. A malformed value counts as 0, so nothing is spent. |
| `PT_CALLERS_CALL_HOURS` | unset = **no dial** | Approved calling hours, Lisbon time, e.g. `09:30-18:00`. |
| `PT_CALLERS_CALL_DAYS` | `1-5` | ISO weekdays (1 = Monday). |
| `PT_CALLERS_DAILY_CALL_CAP` | unset = **no dial** | Calls per day, all reps together. |
| `PT_CALLERS_PILOT_NUMBERS` | — | Comma-separated numbers whose owners agreed to a test call. While the pilot runs, only these numbers can be dialed. |
| `PT_CALLERS_PILOT_COMPLETE` | off | Set to `true` to end the pilot and stop restricting dials to the pilot numbers. |

### Telnyx

Uses #4's settings: `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_WEBRTC_CONNECTION_ID`, `TELNYX_FROM_NUMBER`, `TELNYX_PUBLIC_KEY` and `SITE_URL`.

- Answering-machine detection is off for these calls.
- Calls are never recorded, whatever `HUMAN_CALL_RECORDING` is set to.

## Turning it on (in this order)

1. **Lawyer.** Get the written approval: collection and enrichment, business vs personal numbers, legal basis, consent and exceptions, DGC opposition list, hours and attempts, the call script and the Article 14 notice (`ARTICLE_14_NOTICE_DRAFT.pt-PT.md`).
2. **Do-not-call source.** Wire one with `setDncAdapter` (`src/lib/pt-callers/dnc.ts`). Until then **every dial is refused** (`dnc_unavailable`). This needs code.
3. **Hours, call cap and pilot.** Set `PT_CALLERS_CALL_HOURS`, `PT_CALLERS_DAILY_CALL_CAP` and `PT_CALLERS_PILOT_NUMBERS` (test numbers only).
4. **Apollo.** Set `APOLLO_API_KEY` and `APOLLO_WEBHOOK_BASE_URL`. The credit caps are optional.
5. **Switches.** Set `PT_CALLERS_ENABLED=true` and `PT_CALLERS_LEGAL_APPROVED=true`.
6. **Reps.** In Admin → Team, create the reps with the role "Sales rep (Portugal callers)".
7. **Admin work, per lead.**
   1. Import (0 credits).
   2. Approve.
   3. Enrich (credits: 1, plus 8 per mobile).
   4. Classify the number as a **business line** and record the **legal basis**.
   5. Assign to a rep.

   The lead becomes *Ready* only after the classification and the legal basis.
8. **Pilot.** Call the pilot numbers. Then set `PT_CALLERS_PILOT_COMPLETE=true`.

**To undo:** set either switch back to anything but `true`. Dialing and real Apollo calls stop at once, because the switches are checked on every request.

## What the server checks before every dial

These run twice: before the rep's browser rings, and again just before the lead's phone rings.

- role (assigned sales rep)
- both switches
- not blocked or opted out (by hashed phone and hashed Apollo id)
- not a demo lead
- dialable status
- `+351` number format
- the number classed as a business line
- a legal basis is recorded
- the national do-not-call check
- approved hours
- the pilot list
- the daily call cap
- the one-rep lock (15 minutes, released when the call ends)

## Data and GDPR

- **Separate tables.** All data lives in the `pt_*` tables, separate from orders, customers and shop leads.
- **Reps' access.** A rep only reaches `/admin/pt-callers`, their own rep endpoints, the phone token and the call state. Everything else under `/admin` and `/api` answers 403, from the middleware and from the page / action / route guards.
- **What is stored:** business data only: name, title, company, size, location, business phone, Apollo id, source and fetch date. No personal emails.
- **Retention:** `retention_until` is 90 days. There is no deletion job yet.
- **Access log:** `pt_access_log` records who viewed, called, changed or opted out each lead.
- **Opt-out:** permanent. It is stored as hashes in `pt_blocks` and never deleted. A re-import or re-enrichment never brings the person back.

## Apollo, as checked against Apollo's docs

The docs were checked through web search, because docs.apollo.io was unreachable from the build environment.

- **Search:** `POST /api/v1/mixed_people/api_search` costs 0 credits.
- **Enrichment:** `POST /api/v1/people/bulk_match` takes at most 10 people per call. It sends `reveal_phone_number=true`, `reveal_personal_emails=false` and waterfall off.
- **Delivery:** either `webhook_url` or `poll_only=true`, never both (sending both is a 400).
- **Polling:** `GET /api/v1/webhook_result/{request_id}`. A 404, 410 or 400 there is final.
- **request_id:** a signed 64-bit number, so it is stored as text.
- **Webhook security:** Apollo documents no webhook signature, so each request's webhook URL carries a 256-bit secret, stored hashed.
- **Credit ledger:**
  - It reserves 9 credits per person before the call, then settles once with Apollo's figure.
  - A timeout is "unknown", not "no number", and nothing is retried.
  - An admin closes a timed-out request only after checking Apollo's usage page.

## Migrations

`drizzle/0019_pt_callers.sql` adds 7 new tables and does not change any existing table.

**The repo runs `npm run db:migrate` on every deploy (`start` script), so deploying this branch creates these tables at once.** It changes no behavior while the switches are off.
