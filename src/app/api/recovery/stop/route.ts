import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { stopRecovery, verifyResumeToken } from "@/lib/recovery";
import { linkPage } from "@/lib/link-page";
import { isLocale, type Locale } from "@/lib/markets";

// "Stop" link of the abandoned-checkout messages: answers in the order's language.
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const orderId = verifyResumeToken(t);
  const ok = orderId ? await stopRecovery(orderId) : false;
  let locale: Locale = "pt";
  if (orderId) {
    const [o] = await db.select({ locale: schema.orders.locale }).from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
    if (o && isLocale(o.locale)) locale = o.locale;
  }
  return linkPage(locale, ok ? "stopDone" : "invalidLink");
}
