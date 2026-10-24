import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { unsubscribeToken } from "@/lib/leads";
import { linkPage } from "@/lib/link-page";
import { isLocale, type Locale } from "@/lib/markets";

// Unsubscribe link of the lead emails: answers in the lead's language.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const email = (u.searchParams.get("e") ?? "").toLowerCase();
  const ok = email && u.searchParams.get("t") === unsubscribeToken(email);
  let locale: Locale = "pt";
  if (ok) {
    const [lead] = await db.update(schema.leads).set({ unsubscribedAt: new Date(), consentMarketing: false }).where(eq(schema.leads.email, email)).returning({ locale: schema.leads.locale });
    if (lead && isLocale(lead.locale)) locale = lead.locale;
  }
  return linkPage(locale, ok ? "unsubDone" : "invalidLink");
}
