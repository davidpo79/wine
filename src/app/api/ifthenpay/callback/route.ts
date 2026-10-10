import { and, eq, isNotNull, like, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Payment } from "@/db/schema";
import { parseAmountCents, parseCallback, verifyAntiPhishing } from "@/lib/ifthenpay";
import { confirmPayment } from "@/lib/payments";
import { logOrderEvent } from "@/lib/orders";
import { sendPaymentIssueAlert } from "@/lib/email";

export const dynamic = "force-dynamic";

// ifthenpay callback: an unsigned GET sent only on successful payment, retried (up to 13 times) on any non-200.
// Authenticated by the anti-phishing key; idempotent per (method, ref, payment datetime): a retry is a no-op,
// a second real payment of the same Multibanco reference is flagged for a manual refund.
export async function GET(req: Request) {
  const c = parseCallback(new URL(req.url).searchParams);
  if (!verifyAntiPhishing(c.key)) return new Response("forbidden", { status: 403 });
  if (!c.ref && !c.requestId && !(c.entity && c.reference)) return new Response("missing order", { status: 400 });

  const eventId = `ifp:${c.m ?? "?"}:${c.ref ?? c.requestId ?? c.reference}:${c.paymentDatetime ?? ""}:${c.amount ?? ""}`.slice(0, 200);
  const { key: _secret, ...safe } = c; // never store the anti-phishing key
  await db.insert(schema.webhookLog).values({ source: "ifthenpay", eventId, type: `payment:${c.m ?? c.paymentMethod ?? "?"}`, payload: safe }).onConflictDoNothing();
  const [done] = await db.select({ id: schema.webhookLog.id }).from(schema.webhookLog).where(and(eq(schema.webhookLog.eventId, eventId), isNotNull(schema.webhookLog.processedAt))).limit(1);
  if (done) return new Response("ok");

  let p: Payment | undefined;
  if (c.ref) [p] = await db.select().from(schema.payments).where(eq(schema.payments.ref, c.ref)).limit(1);
  if (!p && c.requestId) [p] = await db.select().from(schema.payments).where(eq(schema.payments.requestId, c.requestId)).limit(1);
  if (!p && c.entity && c.reference) {
    [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.entity, c.entity), eq(schema.payments.reference, c.reference))).limit(1);
  }
  if (!p) {
    // Unknown payment (another shop on the same keys, or a test from the Webhook Tester): acknowledge, keep the log row.
    console.warn("[ifthenpay] callback for unknown payment", safe);
    await db.update(schema.webhookLog).set({ processedAt: new Date() }).where(eq(schema.webhookLog.eventId, eventId));
    return new Response("ok");
  }
  if (p.method === "multibanco" && c.reference && p.reference && c.reference.replace(/\D/g, "") !== p.reference.replace(/\D/g, "")) {
    await logOrderEvent(p.orderId, "callback_reference_mismatch", { ref: p.ref, got: c.reference });
    await db.update(schema.webhookLog).set({ processedAt: new Date() }).where(eq(schema.webhookLog.eventId, eventId));
    return new Response("ok");
  }

  try {
    const paidMethod = c.paymentMethod?.toUpperCase() ?? (c.m === "mb" ? "MB" : c.m === "mbway" ? "MBWAY" : null);
    if (p.status === "paid") {
      // Already confirmed (MB WAY status poll, card return, reconciliation or an earlier callback). An earlier processed
      // callback with a different payment datetime for the same Multibanco reference means it was paid twice.
      const earlier = await db
        .select({ id: schema.webhookLog.id })
        .from(schema.webhookLog)
        .where(and(like(schema.webhookLog.eventId, `ifp:${c.m ?? "?"}:${c.ref ?? c.requestId ?? c.reference}:%`), ne(schema.webhookLog.eventId, eventId), isNotNull(schema.webhookLog.processedAt)))
        .limit(1);
      if (p.method === "multibanco" && earlier.length) {
        await logOrderEvent(p.orderId, "duplicate_payment", { ref: p.ref, method: "multibanco", amount: c.amount, payment_datetime: c.paymentDatetime });
        await sendPaymentIssueAlert(p.orderId, `A referência Multibanco ${p.reference} (${p.ref}) foi paga duas vezes (${c.paymentDatetime}). Devolva o valor por transferência.`).catch(() => {});
      }
    } else {
      await confirmPayment(p, { amountCents: parseAmountCents(c.amount), paidMethod, source: "callback" });
    }
  } catch (e) {
    console.error("[ifthenpay] callback handler", e);
    return new Response("error", { status: 500 }); // ifthenpay retries
  }
  await db.update(schema.webhookLog).set({ processedAt: new Date() }).where(eq(schema.webhookLog.eventId, eventId));
  return new Response("ok");
}
