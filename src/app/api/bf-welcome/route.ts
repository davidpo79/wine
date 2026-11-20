import { headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { clientIp } from "@/lib/request";
import { hashIp } from "@/lib/leads";
import { logFunnel } from "@/lib/tracking";
import { enrollWelcome, processBfWelcome } from "@/lib/bf-welcome";
import { WELCOME_LOCALES } from "@/lib/bf-welcome/copy";
import { getSettings } from "@/lib/settings";

// The Black Friday signup box: the email itself is the opt-in (the box says what will be sent: one email a day until
// the cutoff). Stored as a lead with marketing consent; the welcome email goes out within the minute.
const CONSENT_TEXT: Record<(typeof WELCOME_LOCALES)[number], string> = {
  es: "Quiero recibir por email las ofertas de Black Friday de Wine Portugal (un email al día hasta el final de la oferta). Puedo darme de baja en cualquier momento.",
  de: "Ich möchte die Black-Friday-Angebote von Wine Portugal per E-Mail erhalten (eine E-Mail pro Tag bis zum Ende des Angebots). Ich kann mich jederzeit abmelden.",
  nl: "Ik wil de Black Friday-aanbiedingen van Wine Portugal per e-mail ontvangen (één e-mail per dag tot het einde van de aanbieding). Ik kan me altijd afmelden.",
  fr: "Je souhaite recevoir par e-mail les offres Black Friday de Wine Portugal (un e-mail par jour jusqu'à la fin de l'offre). Je peux me désinscrire à tout moment.",
  pt: "Quero receber por email as ofertas de Black Friday da Wine Portugal (um email por dia até ao fim da oferta). Posso cancelar a qualquer momento.",
  ru: "Я хочу получать по email предложения Black Friday от Wine Portugal (одно письмо в день до конца акции). Я могу отписаться в любой момент.",
};

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  locale: z.enum(WELCOME_LOCALES as [string, ...string[]]),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { email, locale } = parsed.data as { email: string; locale: (typeof WELCOME_LOCALES)[number] };
  if (!(await getSettings()).bf_welcome_enabled) return Response.json({ error: "closed" }, { status: 409 });

  const h = await headers();
  const ipHash = hashIp(clientIp(h));
  if (ipHash) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gte(schema.leads.createdAt, new Date(Date.now() - 3600_000))));
    if ((r?.n ?? 0) >= 5) return Response.json({ error: "rate" }, { status: 429 });
  }

  await db
    .insert(schema.leads)
    .values({ name: "", email, consentMarketing: true, consentText: CONSENT_TEXT[locale], source: "bf_welcome", locale, ipHash })
    .onConflictDoUpdate({ target: schema.leads.email, set: { consentMarketing: true, unsubscribedAt: null, locale } });
  const [lead] = await db.select({ name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.email, email)).limit(1);
  await enrollWelcome(email, lead?.name || null, locale);
  await logFunnel("Lead", `bfw_${ipHash ?? email.length}_${Date.now()}`).catch(() => {});
  // Send the welcome now instead of waiting for the next worker tick.
  void processBfWelcome().catch((e) => console.error("[bf-welcome] signup send", e));
  return Response.json({ ok: true });
}
