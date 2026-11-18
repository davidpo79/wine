// ShipHero (Belgian warehouse) from the command line, with the Railway variables loaded (railway run, or .env):
//   npx tsx scripts/shiphero.ts products            list SKUs, names and stock (to fill Admin → Settings → ShipHero)
//   npx tsx scripts/shiphero.ts webhooks            list the registered webhooks
//   npx tsx scripts/shiphero.ts webhooks register   register "Shipment Update" and "Order Canceled" on SITE_URL and
//                                                   print the shared_signature_secret (→ SHIPHERO_WEBHOOK_SECRET; shown once)
import "./load-env";
import { shipheroGql, shipheroProducts } from "../src/lib/shiphero";

const [cmd, sub] = process.argv.slice(2);
const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const cid = process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID ?? null;

if (cmd === "products") {
  for (const p of await shipheroProducts()) console.log(`${p.sku}\t${p.onHand ?? "?"}\t${p.name}`);
} else if (cmd === "webhooks" && sub === "register") {
  if (!/^https:\/\//.test(site)) throw new Error("SITE_URL must be the public https address of the site.");
  for (const name of ["Shipment Update", "Order Canceled"]) {
    const d = await shipheroGql<{ webhook_create: { webhook: { id: string; name: string; url: string; shared_signature_secret: string } } }>(
      `mutation($data: CreateWebhookInput!) { webhook_create(data: $data) { webhook { id name url shared_signature_secret } } }`,
      { data: { name, url: `${site}/api/webhooks/shiphero`, shop_name: "wine-portugal", ...(cid ? { customer_account_id: cid } : {}) } },
    );
    console.log(`${d.webhook_create.webhook.name}: ${d.webhook_create.webhook.url}\n  shared_signature_secret: ${d.webhook_create.webhook.shared_signature_secret}`);
  }
  console.log("Set SHIPHERO_WEBHOOK_SECRET in Railway to the secret above (ShipHero signs every webhook of the account with it).");
} else if (cmd === "webhooks") {
  const d = await shipheroGql<{ webhooks: { data: { edges: { node: { id: string; name: string; url: string; health?: string } }[] } } }>(
    `query($cid: String) { webhooks(customer_account_id: $cid) { data(first: 50) { edges { node { id name url health } } } } }`,
    { cid },
  );
  for (const { node: w } of d.webhooks.data.edges) console.log(`${w.name}\t${w.health ?? ""}\t${w.url}`);
} else {
  console.log("Usage: npx tsx scripts/shiphero.ts products | webhooks | webhooks register");
}
