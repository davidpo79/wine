# Abandoned-checkout follow-up: setup

## How it works
1. "Encomendar" opens an on-site step: name, email, mobile (required) + two optional, unticked consents:
   - **Messages**: reminders/offers by email, SMS or WhatsApp.
   - **Calls**: phone call, including by an AI assistant, if the order is not completed.
2. The order is saved field by field on /checkout. If no payment arrives:
   | When | What | Needs |
   |---|---|---|
   | +20 min | Email + WhatsApp (or SMS if WhatsApp is not set up) with a link back to checkout | Messages consent |
   | +2 h, only Mon-Sat 09:00-20:00 Lisbon (else next 10:00) | One call from the Telnyx AI assistant | Calls consent |
   | next day | Final email | Messages consent |
3. Every step re-checks the order first and is skipped if: paid, Multibanco reference issued, bought in another order, cancelled by admin, or the customer used the stop link / said "não me liguem" on the call.
4. The link `/retomar/<token>` reopens /checkout with everything the customer typed (same choice and code).
5. Admin → order page shows the follow-up timeline. Admin → Settings has an on/off switch.

## Telnyx (SMS + AI calls)
1. Portal → **Numbers**: buy a Portuguese number (+351) with Voice and SMS. Check Telnyx's regulatory requirements for PT numbers (address/ID).
2. **Messaging** → create a Messaging Profile and assign the number. → `TELNYX_MESSAGING_PROFILE_ID`.
3. **Voice** → **Call Control** → create an Application:
   - Webhook URL: `https://vinho.prendadenatal.com/api/telnyx/webhook` (API v2)
   - Assign the number to it. → its id is `TELNYX_CONNECTION_ID`.
4. **AI** → **AI Assistants** → create one:
   - Language Portuguese (Portugal), a pt-PT voice (e.g. Azure `pt-PT-RaquelNeural` / `pt-PT-DuarteNeural`), transcription multi-lingual.
   - Instructions can stay generic: the app sends per-call instructions (customer name, choice, total, rules) and the greeting, which states that it is an AI and that the call may be recorded.
   - → its id is `TELNYX_ASSISTANT_ID`.
5. **Account → Keys**: API key → `TELNYX_API_KEY`; **Public Key** (webhook signing) → `TELNYX_PUBLIC_KEY`.
6. `TELNYX_FROM_NUMBER` = the +351 number.

## WhatsApp through Telnyx (recommended: same account as SMS/calls)
Per David's Telnyx doc (WhatsApp Business is a Telnyx product, Cloud API reseller):
1. Telnyx Portal → Messaging → WhatsApp → Connect WhatsApp Business Account (Embedded Signup with Facebook, pick the Business Manager, create/select the WABA). Meta business verification: plan for it as required.
2. Pick the number (a Telnyx number with a messaging profile, or your own number on the WABA). It must not be active in the WhatsApp app. For a landline/VoIP number choose voice verification.
3. Set the display name (approval up to 48 h) and complete the business profile **before** submitting templates.
4. Create the template below (category MARKETING, language `pt_PT`, with example values), via Portal or `POST /v2/whatsapp/message_templates`.
5. Railway variables: `WHATSAPP_PROVIDER=telnyx`, `TELNYX_WHATSAPP_FROM=+351...`, `WHATSAPP_TEMPLATE_RECOVERY=trilogia_retomar`, `WHATSAPP_TEMPLATE_LANG=pt_PT`. The app sends with `POST /v2/messages/whatsapp`.

## Email through Telnyx (optional, instead of Resend)
1. `POST /v2/email_domains` with e.g. `mail.prendadenatal.com`, add the ownership TXT, DKIM, SPF and DMARC records it returns (Namecheap), then verify. New domains have a warm-up cap.
2. Upgrade out of trial (trial can only send to the account owner).
3. Railway variables: `EMAIL_PROVIDER=telnyx`, `EMAIL_FROM="Wine Portugal <encomendas@mail.prendadenatal.com>"`. Uses `TELNYX_API_KEY`.

## WhatsApp directly with Meta Cloud API (alternative)
1. Meta Business Manager → WhatsApp → add a phone number (not the one used in the WhatsApp app) and verify the business.
2. Create a **permanent system-user token** with `whatsapp_business_messaging` → `WHATSAPP_TOKEN`; phone number id → `WHATSAPP_PHONE_NUMBER_ID`.
3. Create and submit this template (category **Marketing**, language **Portuguese (POR)** `pt_PT`), name `trilogia_retomar`:
   - Body: `Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal. Para não receber mais mensagens, responda PARAR.`
   - Button: **Visit website**, dynamic URL `https://vinho.prendadenatal.com/{{1}}` (the app sends `retomar/<token>`).
4. Until the template is approved, the 20-minute reminder goes by SMS (Telnyx) instead.

## Legal (Portugal / EU), keep these
- Calls by automated systems (AI) need **prior express consent** (Lei 41/2004, art. 13.º-A): only customers who ticked the calls box are called.
- The assistant must **say it is an AI** (EU AI Act) and that the call may be recorded; it never takes card data by phone.
- Marketing messages need consent; every message has a stop link; "não me liguem" on a call stops everything.
- Update the privacy policy with Telnyx/Meta as processors (done as a draft, legal review pending).
