import { cookies, headers } from "next/headers";
import { z } from "zod";
import { CONSENT_COOKIE, logFunnel, parseConsent, sendCapi } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { SITE } from "@/lib/site";

// Browser events mirrored server-side (CAPI) with the same event_id for deduplication.
// InitiateCheckout and Purchase are never accepted from the browser: they are emitted by the server only.
const Body = z.object({
  event_name: z.enum(["PageView", "ViewContent", "SelectBundle", "AddToCart"]),
  event_id: z.string().regex(/^[A-Za-z0-9_.-]{8,64}$/),
  url: z.string().max(1000).optional(),
  custom_data: z
    .object({
      value: z.number().min(0).max(10000).optional(),
      currency: z.literal("EUR").optional(),
      content_ids: z.array(z.string().max(40)).max(5).optional(),
      content_type: z.literal("product").optional(),
      num_items: z.number().int().min(0).max(50).optional(),
      bundle_key: z.string().max(20).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const ev = parsed.data;
  const jar = await cookies();
  const h = await headers();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);

  await logFunnel(ev.event_name, ev.event_id);
  if (consent.marketing) {
    const url = ev.url && ev.url.startsWith(SITE.url) ? ev.url : SITE.url;
    await sendCapi({
      eventName: ev.event_name,
      eventId: ev.event_id,
      sourceUrl: url,
      user: {
        ip: clientIp(h),
        userAgent: h.get("user-agent"),
        fbp: jar.get("_fbp")?.value,
        fbc: jar.get("_fbc")?.value,
      },
      customData: ev.custom_data,
    });
  }
  return new Response(null, { status: 204 });
}
