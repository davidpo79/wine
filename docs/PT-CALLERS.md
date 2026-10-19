# Portugal HR callers

A separate module in this app. It finds HR managers in Portugal through Apollo.io: both the person and the company headquarters must be in Portugal, at companies with 51 to 500 employees. A rep then calls them one at a time from the browser, through Telnyx.

- **Code:** `src/lib/pt-callers/`, `src/app/api/pt-callers/` and `src/app/admin/pt-callers/`.
- **Data:** its own `pt_*` tables (`drizzle/0018_pt_hr_callers.sql`). It never reads orders, shop leads or customers.

> **Calling Portugal is NOT cleared** until a Portuguese lawyer approves it in writing (spec section 8). Until then the module runs in demo mode:
> - demo data only;
> - no real Apollo import or enrichment;
> - no dial.

## Who sees what

| Role | Sees |
|---|---|
| **Admin** | Everything in the shop admin, plus the "Portugal HR callers" link in the sidebar. |
| **Sales rep (Portugal callers)** (role key `pt_caller`, assigned in Admin → Team) | Only `/admin/pt-callers`: the leads assigned to them, the browser phone and the password change. |

How the rep is kept out of everything else:
- Every other admin page, admin download and admin action refuses this role by default. The session lookup returns nothing for it unless a page explicitly opts in, and only the Portugal screen, its API, the password change and the login redirect opt in. `tests/pt-callers-access.test.ts` keeps it that way.
- A role the app does not recognise is now no session at all. Previously, any unknown role was treated as admin.

## Switches (server environment variables)

None of these is set by this change. David sets them in Railway when the time comes.

| Variable | Default | Meaning |
|---|---|---|
| `PT_CALLERS_ENABLED` | off | The module may use real data and place real calls. |
| `PT_CALLERS_LEGAL_APPROVED` | off | David records that the lawyer's written approval exists. |
| `APOLLO_API_KEY` | unset | An Apollo key restricted to `mixed_people/api_search`, `people/bulk_match` and `webhook_result/show`. Never a master key. Without it, live mode refuses Apollo calls (it never falls back to demo data). |
| `APOLLO_ENRICH_DELIVERY` | `webhook` | How phone results arrive. `poll` only if chosen explicitly. |
| `APOLLO_WEBHOOK_BASE_URL` | unset | Public HTTPS base of this app (e.g. `https://vinho.prendadenatal.com`). Required for webhook delivery; without it enrichment is refused (no silent switch to polling). |
| `APOLLO_DAILY_CREDIT_CAP` | 300 | Hard cap on Apollo credits per UTC day. |
| `APOLLO_MONTHLY_CREDIT_CAP` | 4000 | Hard cap on Apollo credits per UTC month. The Free plan in the spec has 75 credits a month, so set this to 75 (or whatever plan is bought). |
| `PT_CALLERS_DAILY_CALL_CAP` | 0 (no calls) | Calls per day for the whole team: the spending cap. 0 or unset means no spending cap is approved yet, so nothing dials. |
| `PT_CALLERS_REP_DAILY_CALL_CAP` | 80 | Calls one rep may start per UTC day. |
| `PT_CALLERS_MAX_ATTEMPTS_PER_LEAD` | 3 | Call attempts per lead (pending the lawyer's answer on attempts). |
| `PT_CALLERS_CALLING_HOURS` | unset (no calls) | Approved hours in Lisbon time, e.g. `mon-fri 09:30-18:00`. Public holidays are not known to the parser. |
| `PT_CALLERS_PILOT_ONLY` | on | Pilot mode: only numbers in `PT_CALLERS_PILOT_NUMBERS` may be dialled. Off only when set to exactly `false`. |
| `PT_CALLERS_PILOT_NUMBERS` | empty | Comma-separated +351 test numbers whose ownership and consent to be called are confirmed. |
| `PT_CALLERS_BLOCK_PEPPER` | built-in salt | Key for the opt-out list's hashes. Set it once before the first live use and **never change it**: if it changes, all imports, enrichments and calls refuse (`block_key_changed`) until the old value is restored. |
| `PT_TELNYX_API_KEY` | unset | The project's own Telnyx account (spec section 6). The shop's `TELNYX_*` account is never used. |
| `PT_TELNYX_CONNECTION_ID` | unset | Call Control application on that account. |
| `PT_TELNYX_WEBRTC_CONNECTION_ID` | unset | Credential connection for the reps' browser phones. |
| `PT_TELNYX_FROM_NUMBER` | unset | The +351 caller id. |
| `PT_TELNYX_PUBLIC_KEY` | unset | That account's webhook signing key. Without it, call events are refused. |

A switch is on only when its value is exactly `true`. A limit that is set but malformed counts as zero; it never falls back to the default.

## Before every dial, the server checks again

The server checks these, in this order:

1. The role.
2. Both switches.
3. The lead exists and is assigned to this rep (never a demo lead).
4. Its status.
5. The opt-out/block list.
6. A +351 number.
7. The pilot list.
8. A recorded eligibility: an Admin has marked the number as a **corporate line** and entered the **legal basis**. Apollo is not proof of consent, and an HR manager's number is not proof of a corporate line.
9. The approved calling hours.
10. The attempt limit.
11. The national opposition list.
12. The lock.
13. The rep's daily budget.
14. The team's spending cap.
15. One call at a time.

Status, block list, switches, hours and the opposition list are checked again when the rep's own browser answers, before the lead's phone rings. A disabled button in the browser is never the control.

The national opposition list (DGC) is not wired: `src/lib/pt-callers/dnc.ts` answers "unavailable", which refuses every dial. That is a deliberate TODO for David and the lawyer.

## Turning it on, in order (David)

1. **Apollo.** Confirm eligibility with a work email (not a personal Gmail) and that internal use is permitted. Buy nothing until then (spec section 1).
2. **Legal.** Get the lawyer's written approval (spec section 8). It covers:
   - collection and enrichment;
   - number classification;
   - the legal basis, and consent or its exceptions;
   - the opposition list;
   - hours and attempts;
   - the script;
   - the privacy notice (`docs/PT-CALLERS-ARTICLE-14-DRAFT.md`).
3. **Opposition list.** Wire the national list source in `dnc.ts`.
4. **Telnyx.** Create the project's Telnyx account. Then:
   - check outbound number availability, caller id and call rates;
   - create a Call Control application and a credential connection;
   - buy a +351 number;
   - set the five `PT_TELNYX_*` values.
5. **Limits.** Set the spending cap (`PT_CALLERS_DAILY_CALL_CAP`), `PT_CALLERS_CALLING_HOURS`, the Apollo caps, `PT_CALLERS_BLOCK_PEPPER` and the pilot numbers.
6. **Apollo connection.** Set `APOLLO_API_KEY` (a restricted key, entered by David only) and `APOLLO_WEBHOOK_BASE_URL`.
7. **Switches.** Set `PT_CALLERS_LEGAL_APPROVED=true`, then `PT_CALLERS_ENABLED=true`.
8. **Eligibility.** Record eligibility per lead in the Admin screen before anyone can call it.
9. **Pilot.** Run the pilot only with the approved test numbers. Turn pilot mode off later, explicitly.

**To switch it off:** remove either switch. Demo mode returns on restart; nothing is deleted.

**To undo it completely:**
1. Move the reps to another role, or delete their accounts.
2. Revert the commit.
3. Drop the `pt_*` tables.

## Apollo, as implemented (checked against docs.apollo.io, 19/10/2026)

- **Search:** `POST /api/v1/mixed_people/api_search`, 0 credits. It uses the spec's exact titles and seniority (`manager`, `head`, `director`), with no similar titles, 25 per batch, deduplicated by Apollo person id. It runs only when an Admin presses Import.
- **Enrichment:** `POST /api/v1/people/bulk_match`, at most 10 per call. Phone reveal on, personal emails off, waterfall off. It runs only on records an Admin approved, never on import.
- **Request id:** a signed 64-bit integer, kept as text.
- **Credits:**
  - Before every call, 9 credits per person are reserved on the ledger (1, plus 8 for a mobile), in the same step that checks the caps.
  - When Apollo reports `credits_consumed`, the ledger is settled to that figure once.
  - A timeout stays counted, and it is never "no number".
- **No blind retry:**
  - A pending or timed-out reveal is never re-sent automatically.
  - An Admin polls first.
  - If Apollo lost the request, the Admin confirms they checked Apollo's own usage before a deliberate re-send.
- **Webhooks:** Apollo documents no webhook signature, so each webhook URL carries a per-request secret (only its hash is stored). Do not use a public webhook-testing service with real data.
- **Usage display:** Apollo's usage endpoint reports rate limits, not credits, so the Admin screen shows the ledger.

## The spec, section by section

| Spec section | Status | Notes |
|---|---|---|
| 1. Apollo plan | Not code | Buy nothing. Confirm eligibility with a work email and internal use first. |
| 2. Credit costs | Done | 9 per person reserved up front; waterfall off; caps on the ledger. |
| 3. Apollo MCP | Not used | The app talks to the REST API with a restricted key; MCP is not a backend. |
| 4. Target and filters | Done | Person and HQ in Portugal, 51-500 staff, exact titles, seniority, no similar titles, 25 per batch, dedupe, block check before enrichment. |
| 5. One screen, two roles | Done | Admin approves, filters blocked, lowers caps, assigns. The rep sees only assigned leads. Side panel with notes, call history, source and date. Separate "not interested" and "opt-out". Lock. |
| 6. Telnyx click-to-call | Done in code, not connected | Separate PT account, browser phone, microphone/headset check, server re-check (including hours and budget), no recording, transcription, SMS or auto-dial. |
| 7. Asynchronous enrichment | Done | Webhook by default, poll only if chosen, never both, request_id as text, partial and duplicate results, timeout is not "no number", no blind retry, Telnyx signature check and no double processing. |
| 8. Legal NO-GO | Enforced | Demo only until both switches; eligibility per number; opposition-list adapter fails closed. |
| 9. GDPR | Done in code; notice drafted | Minimal data, source and date, legal basis per lead, retention field (no deletion job), access log, protected opt-out hash with scope and date, Article 14 and 21 draft. |
| 10. Decisions before development | Open with David | Internal tool only, no export (built that way); person and HQ in Portugal (built that way); Apollo and legal clearance pending. |
| 11. Acceptance | Covered by tests | See `tests/pt-callers-*.test.ts`. |
