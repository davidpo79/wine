// One reminder per lead before the Christmas cutoff, only to subscribed leads who have not bought.
// Usage (dry run by default): npm run leads:remind            -> lists who would receive it
//                              npm run leads:remind -- --send  -> sends (needs RESEND_API_KEY)
import "./load-env";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { getSettings } from "../src/lib/settings";
import { leadLocale, marketCutoffIso, sendLeadReminder } from "../src/lib/email";
import { defaultCountry, LOCALE_INFO } from "../src/lib/markets";

const send = process.argv.includes("--send");
const settings = await getSettings();
// The cutoff date in each lead's language (and of that language's market): "30/11/2026" in Portuguese, "30.11.2026" in Russian.
const cutoffFor = (l: { locale: string }) => {
  const locale = leadLocale(l);
  return new Date(marketCutoffIso(settings, defaultCountry(locale))).toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon" });
};
const cutoffLabel = cutoffFor({ locale: "pt" });
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
  await sendLeadReminder(l, settings.lead_code, settings.lead_discount_percent, cutoffFor(l));
  await db.update(schema.leads).set({ reminderSentAt: new Date() }).where(eq(schema.leads.id, l.id));
  console.log(`  sent: ${l.email}`);
}
await pg.end();
