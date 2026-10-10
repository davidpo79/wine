// One reminder per lead before the Christmas cutoff, only to subscribed leads who have not bought.
// Usage (dry run by default): npm run leads:remind            -> lists who would receive it
//                              npm run leads:remind -- --send  -> sends (needs RESEND_API_KEY)
import "./load-env";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { getSettings } from "../src/lib/settings";
import { sendLeadReminder } from "../src/lib/email";

const send = process.argv.includes("--send");
const settings = await getSettings();
const cutoffLabel = new Date(settings.cutoff_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
const buyers = await db
  .select({ email: sql<string>`lower(${schema.orders.email})` })
  .from(schema.orders)
  .where(inArray(schema.orders.status, ["paid", "preparing", "shipped", "delivered"]));
const bought = new Set(buyers.map((b) => b.email));
const leads = await db
  .select()
  .from(schema.leads)
  .where(and(eq(schema.leads.consentMarketing, true), isNull(schema.leads.unsubscribedAt), isNull(schema.leads.reminderSentAt)));
const targets = leads.filter((l) => !bought.has(l.email));
console.log(`${targets.length} leads to remind (${leads.length - targets.length} already bought). Cutoff ${cutoffLabel}.`);
for (const l of targets) {
  if (!send) {
    console.log(`  would send: ${l.email}`);
    continue;
  }
  await sendLeadReminder(l, settings.lead_code, settings.lead_discount_percent, cutoffLabel);
  await db.update(schema.leads).set({ reminderSentAt: new Date() }).where(eq(schema.leads.id, l.id));
  console.log(`  sent: ${l.email}`);
}
await pg.end();
