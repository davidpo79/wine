# CTT Expresso web service

Shipping for orders sent from the Douro (Portugal) through CTT Expresso's own web services, as set up with CTT
(Rui Miguel Soares, Integração de Clientes, November 2026). Code: `src/lib/cttx.ts` (SOAP client, pure builders and
parsers), `src/lib/fulfilment.ts` (orders), `src/lib/cttx-codes.ts` (event, reason and situation names, generated from
CTT's `Eventos_CTT.xlsx`). When `CTTX_AUTH_ID` is set it replaces the e-commerce API v3 (`src/lib/ctt.ts`).

## Flow
1. **Order page → "Create CTT shipment and label"**: `CreateShipment` with product `CTTX_SUBPRODUCT` (Em Dois Dias by
   default), one object per parcel (`CTTX_BOXES_PER_PARCEL` Trilogia boxes each, `CTT_BOX_WEIGHT_G` per box), the
   MultipleHomeDelivery service (2 attempts, then the parcel waits at the CTT shop), no ATCode (the invoice travels in
   the parcel). CTT returns the A4 transport guide, one page per parcel; we merge them into one PDF ("Print transport
   guide"). The order becomes "preparing". A second click shows the same guide again (never a second shipment).
2. **Orders → "Close today's CTT shipments"**: one `CloseShipment` for every open object; CTT returns the acceptance
   certificate (Certificado de Aceitação, printed and handed over with the parcels), kept under "Last closes".
3. **Tracking**: the worker polls `GetEventosObjectos_V3` every 2 hours for every shipment not delivered (CTT has no push
   for this service). EMA / EMB / EMF / EMG / EMZ... → order "shipped" + customer email; EMI on every parcel →
   "delivered" (review invitation follows). EMH (not delivered), EDF (on hold), EDH / EMW (waiting for pickup), EMM / EMV
   (returned) → an e-mail to `ADMIN_ALERT_EMAIL` with the reason and situation, once per event; all events show on the
   order page.

## Setup (Railway → web → Variables)
`CTTX_AUTH_ID`, `CTTX_USER_ID`, `CTTX_CLIENT_ID`, `CTTX_CONTRACT_ID` (sandbox PDF from CTT). The collection address
(the sender on every guide) is entered in **Admin → Settings → "CTT: collection address"** (saved in the database);
the `CTTX_SENDER_*` variables are only a fallback for empty fields. CTT rejects an invalid sender postal code. With no
address at all we send `HasSenderInformation = false` and CTT prints the sender address it has for the contract
(confirmed by CTT, 05/11/2026). The same form switches the **Fragile** special service (CTT: handled by hand, not by the
sorting machines; recommended for bottles, extra fee), on by default.
Admin → Settings → "Test CTT connection" checks everything.
`CTTX_BASE` empty = sandbox; production = the address CTT gives after validation.

## Notes from the integration
- WCF data contracts: CTT rejects a message whose elements are not in alphabetical order ("Element 'Type' ... is not
  expected"). The builders keep that order; the unit tests check it.
- The ZPL 10x15 label also comes back; we use the A4 PDF guide (agreed with CTT).
- Object codes of a multi-parcel shipment are consecutive S10 serials (first..last); we compute each one.
- Sandbox examples of our requests and responses (keys masked): `docs/ctt-expresso-examples/`.
  Regenerate: `npx tsx scripts/cttx-sandbox.ts <dir>` (add `--mask` for a copy without keys).
