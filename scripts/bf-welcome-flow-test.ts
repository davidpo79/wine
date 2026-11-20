// Local check of the welcome sequence flow: enroll from leads, send due (no email provider locally = "failed:
// email_not_configured"), unsubscribed and buyers skipped. Run against a local database only.
import "./load-env";
import { inArray, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { processBfWelcome } from "../src/lib/bf-welcome";

const emails = ["bfw-a@example.com", "bfw-b@example.com", "bfw-c@example.com"];
await db.delete(schema.bfWelcomeEmails).where(inArray(schema.bfWelcomeEmails.email, emails));
await db.delete(schema.leads).where(inArray(schema.leads.email, emails));
await db.insert(schema.leads).values([
  { name: "Ana", email: emails[0], consentMarketing: true, consentText: "test", source: "bf_welcome", locale: "es" },
  { name: "Bert", email: emails[1], consentMarketing: true, consentText: "test", source: "bf_welcome", locale: "de" },
  { name: "Old", email: emails[2], consentMarketing: true, consentText: "test", source: "exit_popup", locale: "pt", createdAt: new Date(Date.now() - 30 * 86_400_000) },
]);
await processBfWelcome();
const rows = await db.select().from(schema.bfWelcomeEmails).where(inArray(schema.bfWelcomeEmails.email, emails)).orderBy(schema.bfWelcomeEmails.email, schema.bfWelcomeEmails.day);
for (const r of rows) console.log(r.email, r.locale, r.day, r.kind, r.scheduledAt.toISOString(), r.status, JSON.stringify(r.result));

// Unsubscribe Bert, make the next email due: it must be skipped, with everything after it.
await db.update(schema.leads).set({ unsubscribedAt: new Date(), consentMarketing: false }).where(sql`${schema.leads.email} = ${emails[1]}`);
await db.update(schema.bfWelcomeEmails).set({ scheduledAt: new Date() }).where(sql`${schema.bfWelcomeEmails.email} = ${emails[1]} and ${schema.bfWelcomeEmails.day} = 1`);
await processBfWelcome();
const after = await db.select().from(schema.bfWelcomeEmails).where(sql`${schema.bfWelcomeEmails.email} = ${emails[1]}`).orderBy(schema.bfWelcomeEmails.day);
console.log("after unsubscribe:", after.map((r) => `${r.day}:${r.status}`).join(" "));

await db.delete(schema.bfWelcomeEmails).where(inArray(schema.bfWelcomeEmails.email, emails));
await db.delete(schema.leads).where(inArray(schema.leads.email, emails));
process.exit(0);
