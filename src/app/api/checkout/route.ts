import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createDraft, draftToken, loadDraft, PAID_STATUSES as PAID, publicAmounts, publicDraft, updateDraft } from "@/lib/draft";
import { orderAddons } from "@/lib/payments";
import { CONSENT_COOKIE, gaClientIdFromCookie, logFunnel, parseConsent } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { UTM_COOKIE, parseUtmCookie } from "@/lib/utm";

// Create a new draft when /checkout opens.
const Create = z.object({
  bundle_key: z.string().regex(/^[a-z0-9_]{1,20}$/),
  promo: z.string().max(40).optional(),
  is_gift: z.boolean().optional(),
  gift_message: z.string().max(200).optional(),
  event_id: z.string().regex(/^[A-Za-z0-9_.-]{8,64}$/).optional(),
});

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const jar = await cookies();
  const h = await headers();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  const r = await createDraft(
    { bundleKey: parsed.data.bundle_key, promo: parsed.data.promo, isGift: parsed.data.is_gift, giftMessage: parsed.data.gift_message, eventId: parsed.data.event_id },
    {
      utm: parseUtmCookie(jar.get(UTM_COOKIE)?.value),
      fbp: consent.marketing ? jar.get("_fbp")?.value ?? null : null,
      fbc: consent.marketing ? jar.get("_fbc")?.value ?? null : null,
      gaClientId: consent.statistics ? gaClientIdFromCookie(jar.get("_ga")?.value) : null,
      ip: clientIp(h),
      ua: h.get("user-agent")?.slice(0, 400) ?? null,
      consentTracking: consent.marketing,
    },
  );
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  await logFunnel("CheckoutOpened", `co_${r.order.id}`, r.order.id);
  return Response.json(publicDraft(r.order, []));
}

// Resume an existing draft (recovery link or page reload).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const order = await loadDraft(u.searchParams.get("o"), u.searchParams.get("t"));
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  if (PAID.includes(order.status)) return Response.json({ paid: true, order_id: order.id, token: draftToken(order.id) });
  if (order.status !== "pending_payment") {
    // Expired/failed attempt: reopen it so the same data can be paid.
    await db.update(schema.orders).set({ status: "pending_payment" }).where(eq(schema.orders.id, order.id));
    order.status = "pending_payment";
  }
  return Response.json(publicDraft(order, await orderAddons(order.id, ["pending"])));
}

// Autosave (debounced from the page).
const Patch = z.object({
  o: z.string().max(40),
  t: z.string().max(80),
  patch: z
    .object({
      email: z.string().max(200),
      phone: z.string().max(40),
      firstName: z.string().max(80),
      lastName: z.string().max(100),
      address1: z.string().max(150),
      address2: z.string().max(150),
      postalCode: z.string().max(12),
      city: z.string().max(80),
      nif: z.string().max(15),
      isGift: z.boolean(),
      giftMessage: z.string().max(200),
      consentMessages: z.boolean(),
      consentCalls: z.boolean(),
      bundleKey: z.string().regex(/^[a-z0-9_]{1,20}$/),
      promo: z.string().max(40),
      giftCard: z.boolean(),
    })
    .partial(),
});

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || PAID.includes(order.status)) return Response.json({ error: "not_found" }, { status: 404 });
  const updated = await updateDraft(order, parsed.data.patch);
  const amounts = publicAmounts(updated, await orderAddons(order.id, ["pending"]));
  return Response.json({ amounts, bundle_key: updated.bundleKey, promo_applied: !!updated.promoCode, saved_at: Date.now() });
}
