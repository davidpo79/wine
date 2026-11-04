// Order fulfilment with CTT: create the shipment and label from the admin, then follow it automatically.
// Two CTT integrations: the CTT Expresso web service (lib/cttx.ts, used when its CTTX_* variables are set: A4 transport
// guide, a daily close, tracking by polling) and the older e-commerce API v3 (lib/ctt.ts).
// Picked up (CTT push "shipped", status 25, or event EMA...) → order "shipped" + email; delivered (push, 99/94/32 or EMI)
// → "delivered", which also schedules the review invitation.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import type { Order, Shipment } from "@/db/schema";
import { CTT_DELIVERED, CTT_PICKED_UP, cttConfig, cttConfigured, cttCreateShipment, cttLabel, cttTrack, SHOP_STATUS, type TrackingStatus } from "./ctt";
import { CTTX_ALERT, CTTX_DELIVERED, CTTX_SHIPPED, cttxCloseShipments, cttxConfig, cttxConfigured, cttxMissing, cttxCreateShipment, cttxEvents, cttxSandbox, parcelsForBoxes, type CttxEvent } from "./cttx";
import { cttTrackingUrl } from "./shipping/ctt";
import { MARKETS, isCountry } from "./markets";
import { logOrderEvent, setStatus } from "./orders";
import { sendShipped, sendShippingAlert } from "./email";

/** CTT Expresso settings: keys from Railway, collection address from Admin → Settings. */
export async function loadCttxConfig() {
  const { getSettings } = await import("./settings");
  return cttxConfig((await getSettings()).ctt_sender);
}

/** Whether the admin can create CTT shipments (either integration). */
export const shippingReady = () => cttxConfigured() || cttConfigured();

/** One PDF out of several (CTT Expresso returns one A4 page per parcel). */
export async function mergePdfs(base64: string[]) {
  if (base64.length <= 1) return base64[0] ?? null;
  const out = await PDFDocument.create();
  for (const b of base64) {
    const doc = await PDFDocument.load(Buffer.from(b, "base64"));
    for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
  }
  return Buffer.from(await out.save()).toString("base64");
}

export async function shipmentOf(orderId: string) {
  const [s] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId));
  return s ?? null;
}

/** Admin "Create CTT label": imports the shipment (once) and fetches the label. The order stays "preparing" until CTT picks it up. */
export async function createCttLabel(o: Order, by: string) {
  if (cttxConfigured()) return createCttxLabel(o, by);
  if (!cttConfigured()) return { error: "CTT is not connected yet (API key)." };
  if (!["paid", "preparing"].includes(o.status)) return { error: `Labels are created for paid orders (this one is "${o.status}").` };
  const simulated = cttConfig().simulate;
  let s = await shipmentOf(o.id);
  try {
    if (!s || s.simulated !== simulated) {
      const r = await cttCreateShipment(o);
      const values = { carrierName: r.carrierName, simulated, error: null, updatedAt: new Date() };
      [s] = s
        ? await db.update(schema.shipments).set(values).where(eq(schema.shipments.id, s.id)).returning()
        : await db.insert(schema.shipments).values({ orderId: o.id, ...values }).returning();
      await logOrderEvent(o.id, "ctt_shipment_created", { by, carrier: r.carrierName, warnings: r.warnings || undefined, simulated });
    }
    const label = await cttLabel(o.id);
    await db
      .update(schema.shipments)
      .set({ labelPdf: label.pdf, trackingId: label.trackingId, trackingUrl: label.trackingUrl, error: null, updatedAt: new Date() })
      .where(eq(schema.shipments.orderId, o.id));
    const fresh = o.status === "paid" ? ((await setStatus(o, "preparing", {}, { by, via: "ctt_label" })) ?? o) : o;
    if (label.trackingId) await db.update(schema.orders).set({ trackingNumber: label.trackingId }).where(eq(schema.orders.id, fresh.id));
    await logOrderEvent(o.id, "ctt_label_created", { by, tracking: label.trackingId, simulated });
    return { ok: true as const, trackingId: label.trackingId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (s) await db.update(schema.shipments).set({ error: msg, updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
    await logOrderEvent(o.id, "ctt_error", { by, error: msg });
    return { error: msg };
  }
}

async function orderById(id: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  return o ?? null;
}

/** Moves the order forward from a carrier event. Never moves it back; safe to call repeatedly. */
export async function applyShippingEvent(orderId: string, kind: "shipped" | "delivered", meta: Record<string, unknown>) {
  let o = await orderById(orderId);
  if (!o) return;
  if (o.status === "preparing" || o.status === "paid") {
    const tracking = (meta.tracking as string | undefined) ?? o.trackingNumber ?? undefined;
    const r = await setStatus(o, "shipped", tracking ? { trackingNumber: tracking } : {}, { via: "ctt", ...meta });
    if (r) {
      o = r;
      if (r.trackingNumber) await sendShipped(r);
    }
  }
  if (kind === "delivered" && o.status === "shipped") await setStatus(o, "delivered", {}, { via: "ctt", ...meta });
}

/** Shop update pushed by CTT (Status = our SHOP_STATUS ids). */
export async function handleShopUpdate(orderId: string, status: number, trackingId: string | null, trackingUrl: string | null) {
  const s = await shipmentOf(orderId);
  if (s && (trackingId || trackingUrl)) {
    await db.update(schema.shipments).set({ trackingId: trackingId ?? s.trackingId, trackingUrl: trackingUrl ?? s.trackingUrl, updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
  }
  await logOrderEvent(orderId, "ctt_push", { status, trackingId });
  if (status === SHOP_STATUS.shipped) await applyShippingEvent(orderId, "shipped", { tracking: trackingId ?? undefined });
  if (status === SHOP_STATUS.delivered) await applyShippingEvent(orderId, "delivered", { tracking: trackingId ?? undefined });
}

function mergeEvents(s: Shipment, statuses: TrackingStatus[]) {
  const key = (e: { code: number | string; at: string }) => `${e.code}|${e.at}`;
  const seen = new Set(s.events.map(key));
  return [...s.events, ...statuses.filter((e) => !seen.has(key(e)))].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * CTT Expresso: one CreateShipment per order (one object per parcel, two Trilogia boxes per parcel by default) and the
 * A4 transport guide as one PDF. Never twice for the same order: the guide is kept and printed again from the admin.
 */
export async function createCttxLabel(o: Order, by: string) {
  if (!["paid", "preparing"].includes(o.status)) return { error: `Labels are created for paid orders (this one is "${o.status}").` };
  const a = o.shippingAddress ?? {};
  const country = (a.country ?? o.country ?? "PT").toUpperCase();
  if (!isCountry(country) || MARKETS[country].warehouse !== "douro") return { error: "CTT ships the orders from the Douro (Portugal) only; this one goes from the Belgian warehouse." };
  const c = await loadCttxConfig();
  const missing = cttxMissing(c);
  if (missing.length) return { error: `CTT Expresso: missing ${missing.join(", ")}.` };
  const sandbox = cttxSandbox(c);
  let s = await shipmentOf(o.id);
  if (s?.provider === "cttx" && s.objects.length && s.labelPdf && s.simulated === sandbox) return { ok: true as const, trackingId: s.trackingId };
  const [extra] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.orderAddons.boxes}), 0)::int` })
    .from(schema.orderAddons)
    .where(and(eq(schema.orderAddons.orderId, o.id), eq(schema.orderAddons.status, "paid")));
  const boxes = o.qtyBoxes + (extra?.n ?? 0);
  const parcels = parcelsForBoxes(boxes, c.boxesPerParcel);
  try {
    const r = await cttxCreateShipment(
      {
        reference: o.id,
        subProduct: c.subProduct,
        parcels,
        weightG: boxes * c.boxWeightG,
        observations: `Vinho em garrafas: frágil${parcels > 1 ? ` · ${parcels} volumes` : ""}`,
        receiver: { name: a.name || o.customerName || "", address: [a.line1, a.line2].filter(Boolean).join(", "), postalCode: a.postal_code ?? "", city: a.city ?? "", country, email: o.email, phone: o.phone },
      },
      c,
    );
    const values = {
      provider: "cttx",
      carrierName: "CTT Expresso",
      trackingId: r.first,
      trackingUrl: cttTrackingUrl(r.first),
      objects: r.objects,
      subProduct: c.subProduct,
      labelPdf: await mergePdfs(r.pdfs),
      simulated: sandbox,
      closedAt: null,
      closeId: null,
      events: [],
      lastCode: null,
      lastText: null,
      lastEvent: null,
      alertedEvents: [],
      error: null,
      updatedAt: new Date(),
    };
    [s] = s ? await db.update(schema.shipments).set(values).where(eq(schema.shipments.id, s.id)).returning() : await db.insert(schema.shipments).values({ orderId: o.id, ...values }).returning();
    const fresh = o.status === "paid" ? ((await setStatus(o, "preparing", {}, { by, via: "ctt_label" })) ?? o) : o;
    await db.update(schema.orders).set({ trackingNumber: r.first }).where(eq(schema.orders.id, fresh.id));
    await logOrderEvent(o.id, "ctt_label_created", { by, provider: "cttx", objects: r.objects, shipment: r.shipmentNumber, parcels, sandbox });
    return { ok: true as const, trackingId: r.first };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (s) await db.update(schema.shipments).set({ error: msg, updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
    await logOrderEvent(o.id, "ctt_error", { by, provider: "cttx", error: msg });
    return { error: msg };
  }
}

/** Shipments created at CTT Expresso and not handed over in a daily close yet. */
export async function openCttxShipments() {
  const sandbox = cttxSandbox();
  return db
    .select({ s: schema.shipments })
    .from(schema.shipments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.shipments.orderId))
    .where(and(eq(schema.shipments.provider, "cttx"), isNull(schema.shipments.closedAt), eq(schema.shipments.simulated, sandbox), inArray(schema.orders.status, ["paid", "preparing", "shipped"])))
    .then((rows) => rows.map((r) => r.s).filter((s) => s.objects.length && s.subProduct));
}

/** Admin "Close today's shipments": one CloseShipment for every open object; keeps CTT's acceptance certificate. */
export async function closeCttxShipments(by: string) {
  if (!cttxConfigured()) return { error: "CTT Expresso is not configured." };
  const open = await openCttxShipments();
  if (!open.length) return { error: "No CTT shipments waiting to be closed." };
  try {
    const r = await cttxCloseShipments(open.map((s) => ({ first: s.objects[0], last: s.objects[s.objects.length - 1], subProduct: s.subProduct! })));
    const [close] = await db
      .insert(schema.cttCloses)
      .values({ by, orders: open.map((s) => s.orderId), objects: open.flatMap((s) => s.objects), pdf: await mergePdfs(r.pdfs), sandbox: cttxSandbox() })
      .returning();
    await db.update(schema.shipments).set({ closedAt: close.createdAt, closeId: close.id, updatedAt: new Date() }).where(inArray(schema.shipments.id, open.map((s) => s.id)));
    for (const s of open) await logOrderEvent(s.orderId, "ctt_closed", { by, close: close.id });
    return { ok: true as const, closeId: close.id, count: open.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function mergeCttxEvents(s: Shipment, incoming: CttxEvent[]) {
  const key = (e: { code: number | string; at: string }) => `${e.code}|${e.at}`;
  const seen = new Set(s.events.map(key));
  return [...s.events, ...incoming.filter((e) => !seen.has(key(e)))].sort((a, b) => a.at.localeCompare(b.at));
}

/** CTT Expresso tracking: polls every open shipment, moves the order on, tells the team when a parcel needs attention. */
export async function syncCttxTracking() {
  if (!cttxConfigured()) return 0;
  const rows = await db
    .select({ s: schema.shipments })
    .from(schema.shipments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.shipments.orderId))
    .where(and(eq(schema.shipments.provider, "cttx"), eq(schema.shipments.simulated, cttxSandbox()), inArray(schema.orders.status, ["preparing", "shipped"])));
  const open = rows.map((r) => r.s).filter((s) => s.objects.length);
  if (!open.length) return 0;
  const tracked = await cttxEvents([...new Set(open.flatMap((s) => s.objects))]);
  let moved = 0;
  for (const s of open) {
    // Each event once, tagged with its parcel when the order has more than one.
    const incoming = s.objects.flatMap((obj) => (tracked.get(obj) ?? []).map((e) => (s.objects.length > 1 ? { ...e, text: `${e.text} · ${obj}` } : e)));
    if (!incoming.length) continue;
    const events = mergeCttxEvents(s, incoming);
    const last = events[events.length - 1];
    const alerted = new Set(s.alertedEvents);
    const fresh = events.filter((e) => typeof e.code === "string" && CTTX_ALERT.has(e.code) && !alerted.has(`${e.code}|${e.at}`));
    await db
      .update(schema.shipments)
      .set({ events, lastEvent: String(last.code), lastText: last.text, alertedEvents: [...alerted, ...fresh.map((e) => `${e.code}|${e.at}`)], updatedAt: new Date() })
      .where(eq(schema.shipments.id, s.id));
    for (const e of fresh) {
      await logOrderEvent(s.orderId, "ctt_attention", { code: e.code, text: e.text, at: e.at });
      await sendShippingAlert(s.orderId, `${e.code} · ${e.text}`).catch((err) => console.error("[ctt] alert", err));
    }
    // Delivered when every parcel was delivered (CTT returns each object's whole history); on its way from the first
    // network event.
    if (s.objects.every((obj) => (tracked.get(obj) ?? []).some((e) => e.code === CTTX_DELIVERED))) {
      await applyShippingEvent(s.orderId, "delivered", { tracking: s.trackingId ?? undefined, code: CTTX_DELIVERED });
      moved += 1;
    } else if (events.some((e) => typeof e.code === "string" && CTTX_SHIPPED.has(e.code))) {
      await applyShippingEvent(s.orderId, "shipped", { tracking: s.trackingId ?? undefined, code: String(last.code) });
    }
  }
  return moved;
}

/** Safety net for missed pushes: polls CTT for every open shipment (worker, every 2 hours). */
export async function syncCttTracking() {
  const fromCttx = await syncCttxTracking().catch((e) => (console.error("[ctt] expresso tracking", e), 0));
  if (!cttConfigured()) return fromCttx;
  const open = await db
    .select({ s: schema.shipments })
    .from(schema.shipments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.shipments.orderId))
    .where(and(eq(schema.shipments.provider, "ctt"), eq(schema.shipments.simulated, false), inArray(schema.orders.status, ["preparing", "shipped"])));
  if (!open.length) return fromCttx;
  const tracked = await cttTrack(open.map((r) => r.s.orderId));
  let moved = 0;
  for (const { s } of open) {
    const t = tracked.get(s.orderId);
    if (!t?.statuses.length) continue;
    const events = mergeEvents(s, t.statuses);
    const last = events[events.length - 1];
    await db
      .update(schema.shipments)
      .set({ events, lastCode: Number(last.code), lastText: last.text, trackingId: t.trackingId ?? s.trackingId, updatedAt: new Date() })
      .where(eq(schema.shipments.id, s.id));
    const codes = new Set(events.map((e) => e.code));
    if (CTT_DELIVERED.some((c) => codes.has(c))) {
      await applyShippingEvent(s.orderId, "delivered", { tracking: t.trackingId ?? undefined, code: last.code });
      moved += 1;
    } else if (CTT_PICKED_UP.some((c) => codes.has(c))) {
      await applyShippingEvent(s.orderId, "shipped", { tracking: t.trackingId ?? undefined, code: last.code });
    }
  }
  return moved + fromCttx;
}
