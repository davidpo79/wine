import { cookies, headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { clientIp } from "@/lib/request";
import { hashIp, leadToken, LEAD_CONSENT_TEXT } from "@/lib/leads";
import { sendLeadCode } from "@/lib/email";
import { CONSENT_COOKIE, logFunnel, parseConsent, sendCapi } from "@/lib/tracking";
import { UTM_COOKIE, parseUtmCookie } from "@/lib/utm";
import { SITE } from "@/lib/site";

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  consent: z.literal(true),
  event_id: z.string().regex(/^[A-Za-z0-9_.-]{8,64}$/).optional(),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Verifique o nome, o email e a autorização." }, { status: 400 });
  const input = parsed.data;
  const settings = await getSettings();
  if (!settings.exit_popup_enabled || !settings.lead_code) return Response.json({ error: "Oferta indisponível." }, { status: 409 });

  const h = await headers();
  const jar = await cookies();
  const ipHash = hashIp(clientIp(h));
  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gte(schema.leads.createdAt, since)));
    if ((r?.n ?? 0) >= 5) return Response.json({ error: "Demasiados pedidos. Tente mais tarde." }, { status: 429 });
  }

  const [lead] = await db
    .insert(schema.leads)
    .values({
      name: input.name,
      email: input.email,
      consentMarketing: true,
      consentText: LEAD_CONSENT_TEXT,
      source: "exit_popup",
      promoCode: settings.lead_code,
      utm: parseUtmCookie(jar.get(UTM_COOKIE)?.value),
      ipHash,
    })
    .onConflictDoUpdate({ target: schema.leads.email, set: { name: input.name, consentMarketing: true, unsubscribedAt: null } })
    .returning();

  await sendLeadCode(lead, settings.lead_code, settings.lead_discount_percent, settings.lead_code_max_qty).catch((e) => console.error("[leads] email", e));

  const eventId = input.event_id ?? `lead_${lead.id}`;
  await logFunnel("Lead", eventId);
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  if (consent.marketing) {
    const [first, ...rest] = input.name.split(/\s+/);
    await sendCapi({
      eventName: "Lead",
      eventId,
      sourceUrl: req.headers.get("referer") ?? SITE.url,
      user: { email: input.email, firstName: first, lastName: rest.join(" "), ip: clientIp(h), userAgent: h.get("user-agent"), fbp: jar.get("_fbp")?.value, fbc: jar.get("_fbc")?.value },
      customData: { content_name: "exit_popup_code" },
    });
  }

  return Response.json({ code: settings.lead_code, percent: settings.lead_discount_percent, max_qty: settings.lead_code_max_qty, token: leadToken(lead.email), plus: !!settings.lead_plus_code });
}
