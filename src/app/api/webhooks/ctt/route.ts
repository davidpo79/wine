import { orderIdFromShopItem, validShopUpdateHash } from "@/lib/ctt";
import { handleShopUpdate } from "@/lib/shipping";

// CTT shop update push (registered as ShopUrl when the token is requested): {ShopItemId, Status, TrackingId,
// TrackingUrl, Hash}. Status uses our ids (1 imported, 2 shipped, 3 delivered, 4 problem). Background-process
// webhooks (e.g. label finished) arrive as a plain GET: we poll labels ourselves, so those are just acknowledged.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { ShopItemId?: string; Status?: number | string; TrackingId?: string; TrackingUrl?: string; Hash?: string } | null;
  if (!body || body.ShopItemId == null || body.Status == null) return new Response("bad request", { status: 400 });
  if (!validShopUpdateHash(body)) return new Response("invalid hash", { status: 401 });
  const orderId = orderIdFromShopItem(String(body.ShopItemId));
  if (!orderId) return new Response("unknown item", { status: 404 });
  try {
    await handleShopUpdate(orderId, Number(body.Status), body.TrackingId ?? null, body.TrackingUrl ?? null);
  } catch (e) {
    console.error("[ctt] push", e);
    return new Response("retry", { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function GET() {
  return new Response(null, { status: 204 });
}
