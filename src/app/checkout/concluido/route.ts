import { loadDraft } from "@/lib/draft";
import { getStripe } from "@/lib/stripe";
import { getSettings } from "@/lib/settings";
import { markOrderPaid, multibancoIssued } from "@/lib/payments";
import { getOrder } from "@/lib/orders";
import { SITE } from "@/lib/site";

// After stripe.confirmPayment: route to the one-click offer (paid) or the thank-you page (pending/async).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const o = u.searchParams.get("o");
  const t = u.searchParams.get("t");
  const order = await loadDraft(o, t);
  if (!order || !o || !t) return Response.redirect(`${SITE.url}/`, 303);
  const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`;
  try {
    if (order.stripePaymentIntentId) {
      const pi = await getStripe().paymentIntents.retrieve(order.stripePaymentIntentId);
      if (pi.status === "succeeded") {
        await markOrderPaid(order, pi, `return_${pi.id}`); // idempotent; the webhook may arrive later
        const settings = await getSettings();
        const fresh = await getOrder(order.id);
        if (settings.upsell_enabled && fresh && ["paid", "preparing"].includes(fresh.status)) return Response.redirect(`${SITE.url}/oferta?${q}`, 303);
      } else if (pi.status === "requires_action") {
        await multibancoIssued(order, pi);
      }
    }
  } catch (e) {
    console.error("[checkout] concluido", e);
  }
  return Response.redirect(`${SITE.url}/obrigado?${q}`, 303);
}
