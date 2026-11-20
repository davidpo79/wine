import { and, countDistinct, gte, inArray, isNotNull, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { BF_DOURO_ALIASES, BF_OFFERS, bfHref, bfOfferFor, isBfLocale, type BfOfferId } from "@/lib/black-friday";

// Live activity of a Black Friday offer for its page (David, 20/11/2026): real paid orders (city + boxes + when, never a
// name) and how many visits are on the offer's pages right now. Real numbers only: invented counters or sales are
// misleading commercial practices under EU consumer law, so the page shows nothing when the numbers are small.

const PAID = ["paid", "preparing", "shipped", "delivered"] as const;
// The same wine sold under two offers (Spain / DE-NL-BE) counts as one.
const SAME: Partial<Record<BfOfferId, BfOfferId[]>> = { poco: ["poco", "pocoeu"], pocoeu: ["poco", "pocoeu"] };

type Live = { now: number; today: number; sold24: number; recent: { city: string; boxes: number; at: string }[] };
const cache = new Map<string, { at: number; data: Live }>();

/** Page paths of an offer in every language (with the Douro box's aliases). */
function pathsOf(ids: BfOfferId[]) {
  const out = new Set<string>();
  for (const id of ids) {
    const o = BF_OFFERS[id];
    for (const l of o.locales) {
      if (!isBfLocale(l)) continue;
      out.add(bfHref(l, o));
      if (id === "douro6" && BF_DOURO_ALIASES[l]) out.add(`/${l}/black-friday/${BF_DOURO_ALIASES[l]}`);
    }
  }
  return [...out];
}

const city = (s: unknown) => {
  const c = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
  if (!c || c.length > 40 || /\d/.test(c)) return "";
  return c.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
};

async function load(offerId: BfOfferId): Promise<Live> {
  const ids = SAME[offerId] ?? [offerId];
  const paths = pathsOf(ids);
  const since = (min: number) => new Date(Date.now() - min * 60_000);
  const viewers = (min: number) =>
    db
      .select({ n: countDistinct(schema.journeyEvents.sessionId) })
      .from(schema.journeyEvents)
      .where(and(inArray(schema.journeyEvents.path, paths), gte(schema.journeyEvents.createdAt, since(min))))
      .then((r) => Number(r[0]?.n ?? 0));
  const [now, today, orders] = await Promise.all([
    viewers(10),
    viewers(24 * 60),
    db
      .select({ bundleKey: schema.orders.bundleKey, qty: schema.orders.qtyBoxes, addr: schema.orders.shippingAddress, paidAt: schema.orders.paidAt })
      .from(schema.orders)
      .where(and(inArray(schema.orders.status, [...PAID]), like(schema.orders.bundleKey, "bf%"), isNotNull(schema.orders.paidAt), gte(schema.orders.paidAt, since(7 * 24 * 60))))
      .orderBy(schema.orders.paidAt),
  ]);
  const mine = orders.filter((o) => ids.includes(bfOfferFor(o.bundleKey)?.id as BfOfferId)).reverse();
  const dayAgo = Date.now() - 24 * 3600_000;
  return {
    now,
    today,
    sold24: mine.filter((o) => o.paidAt!.getTime() >= dayAgo).reduce((s, o) => s + o.qty, 0),
    recent: mine
      .map((o) => ({ city: city(o.addr?.city), boxes: o.qty, at: o.paidAt!.toISOString() }))
      .filter((o) => o.city)
      .slice(0, 6),
  };
}

export async function GET(req: Request) {
  const offer = new URL(req.url).searchParams.get("offer") ?? "";
  if (!(offer in BF_OFFERS)) return Response.json({ error: "offer" }, { status: 400 });
  const hit = cache.get(offer);
  let data = hit && Date.now() - hit.at < 60_000 ? hit.data : null;
  if (!data) {
    try {
      data = await load(offer as BfOfferId);
      cache.set(offer, { at: Date.now(), data });
    } catch (e) {
      console.error("[live] failed", e);
      data = { now: 0, today: 0, sold24: 0, recent: [] };
    }
  }
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=30" } });
}
