# Belgian warehouse: ShipHero

Orders delivered to **Germany, the Netherlands and Belgium** are created in ShipHero as soon as they are
paid. When the warehouse ships, ShipHero's "Shipment Update" webhook marks the order **shipped** and the customer gets
the email with the tracking number and link. Spain and Portugal keep shipping from Lisbon with CTT.

## Setup (once)

1. **Access** · in ShipHero: Dashboard → Users → **+ Add Third-Party Developer**. Copy the **Refresh Token** (and the
   Bearer Token).
2. **Railway** (service `web`) · set:
   - `SHIPHERO_REFRESH_TOKEN` = the refresh token (the site refreshes the 28-day access token by itself)
   - `SHIPHERO_ACCESS_TOKEN` = the bearer token (optional)
   - `SHIPHERO_CUSTOMER_ACCOUNT_ID` = only if the warehouse runs a 3PL account and we are its customer
   - `SHIPHERO_WAREHOUSE_ID` = optional; by default orders are pinned to the Belgian warehouse (`V2FyZWhvdXNlOjkwNzM3`)
3. **SKUs** · Admin → Settings → **Belgian warehouse (ShipHero)**: the warehouse's products are listed; pick the SKU of
   each box (Cheda mix, Galhofa mix, Poço do Canto, D. Graça, Trilogia 2160). An order whose box has no SKU is not sent
   and the team gets an alert email.
4. **Webhooks** · after the deploy, Admin → Settings → **Connect shipping updates** (once). It registers "Shipment
   Update" and "Order Canceled" on `https://<site>/api/webhooks/shiphero` and keeps their signing secret in the
   settings table (`shiphero_webhook_secrets`); nothing to copy. The ShipHero "API Secret" is NOT this secret.
   (CLI alternative: `railway run npx tsx scripts/shiphero.ts webhooks register` → `SHIPHERO_WEBHOOK_SECRET`.)

## Day to day

- Paid order (DE/NL/BE) → created in ShipHero, order status **preparing**.
- If ShipHero refuses it (missing SKU, address...), the team gets an email; fix it and press **Send to ShipHero** on the
  order page.
- Warehouse ships → order **shipped**, customer email with the tracking link (UPS).
- Order cancelled in ShipHero → alert email to the team.

`npx tsx scripts/shiphero.ts products` lists SKUs and stock; `... webhooks` lists the registered webhooks and their health.
