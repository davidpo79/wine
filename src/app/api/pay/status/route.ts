import { loadDraft, PAID_STATUSES } from "@/lib/draft";
import { afterPaidUrl, latestPayment, refreshMbway } from "@/lib/payments";
import { getOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Polled by the checkout while an MB WAY request waits for approval in the customer's app.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t") ?? "";
  const order = await loadDraft(u.searchParams.get("o"), t);
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  const paid = async () => Response.json({ state: "paid", next: await afterPaidUrl((await getOrder(order.id)) ?? order, t) });
  if (PAID_STATUSES.includes(order.status)) return paid();
  const p = await latestPayment(order.id);
  if (!p) return Response.json({ state: "none" });
  if (p.status === "paid") return paid();
  if (p.method === "mbway" && p.status === "pending") {
    const s = await refreshMbway(p);
    if (s === "paid") return paid();
    return Response.json({ state: s, expires_at: p.expiresAt?.toISOString() });
  }
  return Response.json({ state: p.status, method: p.method });
}
