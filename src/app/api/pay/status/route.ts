import { loadDraft, PAID_STATUSES } from "@/lib/draft";
import { latestPayment, refreshMbway } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Polled by the checkout while an MB WAY request waits for approval in the customer's app.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const order = await loadDraft(u.searchParams.get("o"), u.searchParams.get("t"));
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  if (PAID_STATUSES.includes(order.status)) return Response.json({ state: "paid" });
  const p = await latestPayment(order.id);
  if (!p) return Response.json({ state: "none" });
  if (p.status === "paid") return Response.json({ state: "paid" });
  if (p.method === "mbway" && p.status === "pending") {
    const s = await refreshMbway(p);
    return Response.json({ state: s === "paid" ? "paid" : s === "pending" ? "pending" : s, expires_at: p.expiresAt?.toISOString() });
  }
  return Response.json({ state: p.status, method: p.method });
}
