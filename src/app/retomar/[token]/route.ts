import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createCheckout } from "@/lib/checkout";
import { verifyResumeToken } from "@/lib/recovery";
import { logOrderEvent } from "@/lib/orders";
import { CONSENT_COOKIE, gaClientIdFromCookie, parseConsent } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { SITE } from "@/lib/site";

// Recovery link (email/SMS/WhatsApp/AI call): opens a fresh Stripe Checkout with the same choice.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const orderId = verifyResumeToken(decodeURIComponent(token));
  if (!orderId) return Response.redirect(`${SITE.url}/#escolher`, 303);
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order) return Response.redirect(`${SITE.url}/#escolher`, 303);
  if (["paid", "preparing", "shipped", "delivered"].includes(order.status)) return Response.redirect(`${SITE.url}/?ja_paga=1`, 303);

  const jar = await cookies();
  const h = await headers();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  const r = await createCheckout(
    {
      bundle_key: order.bundleKey,
      is_gift: order.isGift,
      gift_message: order.giftMessage ?? "",
      promo: order.promoCode ?? undefined,
      customer: order.email && order.customerName && order.phone ? { name: order.customerName, email: order.email, phone: order.phone } : null,
      consent_messages: order.consentMessages,
      consent_calls: order.consentCalls,
      source: "recovery",
    },
    {
      consent,
      utm: order.utm ?? { utm_source: "recovery" },
      fbp: consent.marketing ? jar.get("_fbp")?.value ?? null : null,
      fbc: consent.marketing ? jar.get("_fbc")?.value ?? null : null,
      gaClientId: consent.statistics ? gaClientIdFromCookie(jar.get("_ga")?.value) : null,
      ip: clientIp(h),
      ua: h.get("user-agent")?.slice(0, 400) ?? null,
      referer: null,
    },
  );
  if (!r.ok) return Response.redirect(`${SITE.url}/?retomar_erro=1#escolher`, 303);
  await logOrderEvent(order.id, "recovery_resumed", { new_order: r.order_id });
  return Response.redirect(r.url, 303);
}
