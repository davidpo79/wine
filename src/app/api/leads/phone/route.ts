import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { leadToken, normalizePtMobile, PHONE_CONSENT_TEXT } from "@/lib/leads";
import { logFunnel } from "@/lib/tracking";

// Step 2 of the exit popup: optional mobile number with its own consent (calls + WhatsApp).
const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  token: z.string().max(64),
  phone: z.string().max(30),
  consent: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Indique o número e a autorização de contacto." }, { status: 400 });
  const { email, token, phone, consent } = parsed.data;
  if (token !== leadToken(email)) return Response.json({ error: "Pedido inválido." }, { status: 403 });
  const normalized = normalizePtMobile(phone);
  if (!normalized) return Response.json({ error: "Indique um telemóvel português válido (9 dígitos)." }, { status: 400 });
  const settings = await getSettings();
  if (!settings.lead_plus_code) return Response.json({ error: "Oferta indisponível." }, { status: 409 });

  const [lead] = await db
    .update(schema.leads)
    .set({ phone: normalized, consentPhone: consent, phoneConsentText: PHONE_CONSENT_TEXT, phoneAddedAt: new Date(), promoCode: settings.lead_plus_code })
    .where(eq(schema.leads.email, email))
    .returning({ id: schema.leads.id });
  if (!lead) return Response.json({ error: "Pedido inválido." }, { status: 404 });
  await logFunnel("LeadPhone", `leadphone_${lead.id}`);
  return Response.json({ code: settings.lead_plus_code });
}
