import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { confirmPayment } from "@/lib/payments";
import { parseAmountCents, verifyCardSignature } from "@/lib/ifthenpay";
import { logOrderEvent } from "@/lib/orders";
import { SITE } from "@/lib/site";

// Browser return from the ifthenpay card / Apple Pay / Google Pay page. ifthenpay appends id, amount, requestId (+ sk on
// card success). Only a valid HMAC signature can confirm here; otherwise the callback (server to server) does it.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const o = u.searchParams.get("o");
  const t = u.searchParams.get("t");
  const order = await loadDraft(o, t);
  if (!order || !o || !t) return Response.redirect(`${SITE.url}/`, 303);
  const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`;
  const r = u.searchParams.get("r");
  const id = u.searchParams.get("id") ?? "";
  const amount = u.searchParams.get("amount") ?? "";
  const requestId = u.searchParams.get("requestId") ?? "";
  const sk = u.searchParams.get("sk") ?? "";

  if (r !== "ok") {
    await logOrderEvent(order.id, "payment_returned", { result: r, ref: id });
    return Response.redirect(`${SITE.url}/checkout?${q}&pagamento=${r === "cancelado" ? "cancelado" : "erro"}`, 303);
  }
  if (id && sk) {
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.ref, id)).limit(1);
    if (p && p.orderId === order.id && verifyCardSignature(id, amount, requestId, sk) && (!p.requestId || p.requestId === requestId)) {
      if (!p.requestId && requestId) await db.update(schema.payments).set({ requestId }).where(eq(schema.payments.id, p.id));
      await confirmPayment({ ...p, requestId: p.requestId ?? requestId }, { amountCents: parseAmountCents(amount), paidMethod: "CCARD", source: "card_return" });
    } else {
      await logOrderEvent(order.id, "payment_return_unverified", { ref: id });
    }
  }
  return Response.redirect(`${SITE.url}/obrigado?${q}`, 303);
}
