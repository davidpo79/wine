import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { getStripe } from "@/lib/stripe";
import { afterPaidUrl, applyStripePi } from "@/lib/payments";
import { getOrder } from "@/lib/orders";
import { SITE } from "@/lib/site";

// After stripe.confirmPayment (card / Apple Pay / Google Pay): confirm from the PaymentIntent, then the one-click offer.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const o = u.searchParams.get("o");
  const t = u.searchParams.get("t");
  const order = await loadDraft(o, t);
  if (!order || !o || !t) return Response.redirect(`${SITE.url}/`, 303);
  const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`;
  try {
    const [p] = await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.provider, "stripe"), isNull(schema.payments.addonId)))
      .orderBy(desc(schema.payments.id))
      .limit(1);
    if (p?.requestId) {
      const pi = await getStripe().paymentIntents.retrieve(p.requestId);
      const s = await applyStripePi(pi, "stripe_return"); // idempotent; the webhook may arrive first or later
      if (s === "requires_payment_method") return Response.redirect(`${SITE.url}/checkout?${q}&pagamento=erro`, 303);
    }
  } catch (e) {
    console.error("[checkout] concluido", e);
  }
  const fresh = (await getOrder(order.id)) ?? order;
  return Response.redirect(await afterPaidUrl(fresh, t), 303);
}
