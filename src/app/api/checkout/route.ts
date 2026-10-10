import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createCheckout } from "@/lib/checkout";
import { CONSENT_COOKIE, gaClientIdFromCookie, parseConsent } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { UTM_COOKIE, parseUtmCookie } from "@/lib/utm";
import { normalizePtMobile } from "@/lib/leads";

const Body = z.object({
  bundle_key: z.string().regex(/^[a-z0-9_]{1,20}$/),
  is_gift: z.boolean().optional().default(false),
  gift_message: z.string().max(200).optional().default(""),
  event_id: z.string().regex(/^[A-Za-z0-9_.-]{8,64}$/).optional(),
  promo: z.string().max(40).optional(),
  // Pre-checkout details (smart checkout step on the site, before Stripe)
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().max(30),
  consent_messages: z.boolean().optional().default(false),
  consent_calls: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Verifique o nome, o email e o telemóvel." }, { status: 400 });
  const input = parsed.data;
  const phone = normalizePtMobile(input.phone);
  if (!phone) return Response.json({ error: "Indique um telemóvel português válido (9 dígitos)." }, { status: 400 });

  const jar = await cookies();
  const h = await headers();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  const r = await createCheckout(
    {
      bundle_key: input.bundle_key,
      is_gift: input.is_gift,
      gift_message: input.gift_message,
      event_id: input.event_id,
      promo: input.promo,
      customer: { name: input.name, email: input.email, phone },
      consent_messages: input.consent_messages,
      consent_calls: input.consent_calls,
      source: "site",
    },
    {
      consent,
      utm: parseUtmCookie(jar.get(UTM_COOKIE)?.value),
      fbp: consent.marketing ? jar.get("_fbp")?.value ?? null : null,
      fbc: consent.marketing ? jar.get("_fbc")?.value ?? null : null,
      gaClientId: consent.statistics ? gaClientIdFromCookie(jar.get("_ga")?.value) : null,
      ip: clientIp(h),
      ua: h.get("user-agent")?.slice(0, 400) ?? null,
      referer: req.headers.get("referer"),
    },
  );
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  const { ok: _ok, ...data } = r;
  return Response.json(data);
}
