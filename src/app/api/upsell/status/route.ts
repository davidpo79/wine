import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { applyStripePi, refreshMbway } from "@/lib/payments";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Status of a post-purchase add-on payment (MB WAY approval in the app, or a card after 3-D Secure).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const order = await loadDraft(u.searchParams.get("o"), u.searchParams.get("t"));
  const id = Number(u.searchParams.get("p"));
  if (!order || !Number.isInteger(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.id, id), eq(schema.payments.orderId, order.id))).limit(1);
  if (!p || !p.addonId) return Response.json({ error: "not_found" }, { status: 404 });
  if (p.status === "paid") return Response.json({ state: "paid" });
  if (p.provider === "stripe" && p.requestId) {
    const s = await applyStripePi(await getStripe().paymentIntents.retrieve(p.requestId), "upsell_status");
    return Response.json({ state: s === "paid" ? "paid" : s === "processing" || s === "requires_action" ? "pending" : "failed" });
  }
  const s = await refreshMbway(p);
  return Response.json({ state: s === "paid" ? "paid" : s === "pending" ? "pending" : s });
}
