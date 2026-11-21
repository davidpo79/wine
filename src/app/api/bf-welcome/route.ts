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
import { normalizePhone } from "@/lib/leads";
import { normalizePhoneFor } from "@/lib/markets";
import { bfCountryFor, isBfLocale } from "@/lib/black-friday";
import { sendSms, telnyxConfigured } from "@/lib/telnyx";
import { fmt } from "@/lib/i18n/rich";
import { SITE } from "@/lib/site";

const euros = (c: number, locale: string) => `${(c / 100).toLocaleString(locale === "pt" ? "pt-PT" : locale, { maximumFractionDigits: 2 })} €`;

const PHONE_CONSENT: Record<(typeof WELCOME_LOCALES)[number], string> = {
  es: "Quiero recibir mi código y las ofertas de Black Friday por SMS/WhatsApp. Puedo darme de baja respondiendo STOP.",
  de: "Ich möchte meinen Code und die Black-Friday-Angebote per SMS/WhatsApp erhalten. Abmelden mit STOPP.",
  nl: "Ik wil mijn code en de Black Friday-aanbiedingen per sms/WhatsApp ontvangen. Afmelden met STOP.",
  fr: "Je souhaite recevoir mon code et les offres Black Friday par SMS/WhatsApp. Désinscription en répondant STOP.",
  pt: "Quero receber o meu código e as ofertas de Black Friday por SMS/WhatsApp. Posso cancelar respondendo PARAR.",
  ru: "Я хочу получить код и предложения Black Friday по SMS/WhatsApp. Отписаться: ответьте STOP.",
};

const SMS: Record<(typeof WELCOME_LOCALES)[number], string> = {
  es: "Wine Portugal: Hola {name}, tu código de Black Friday es {code}: {amount} menos en tu pedido. Úsalo aquí: {link} Baja: responde STOP",
  de: "Wine Portugal: Hallo {name}, Ihr Black-Friday-Code ist {code}: {amount} weniger auf Ihre Bestellung. Hier einlösen: {link} Abmelden: STOPP",
  nl: "Wine Portugal: Hallo {name}, je Black Friday-code is {code}: {amount} korting op je bestelling. Gebruik hem hier: {link} Afmelden: STOP",
  fr: "Wine Portugal : Bonjour {name}, votre code Black Friday est {code} : {amount} de moins sur votre commande. À utiliser ici : {link} Stop : répondez STOP",
  pt: "Wine Portugal: Olá {name}, o seu código de Black Friday é {code}: menos {amount} na sua encomenda. Use aqui: {link} Cancelar: PARAR",
  ru: "Wine Portugal: Здравствуйте, {name}! Ваш код Black Friday: {code}, скидка {amount} на заказ. Использовать: {link} Отписка: STOP",
};

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
  phone: z.string().trim().max(30).optional(),
  name: z.string().trim().max(80).optional(),
  path: z.string().max(120).optional(), // the Black Friday page it came from (the SMS links back to it)
  locale: z.enum(WELCOME_LOCALES as [string, ...string[]]),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { email, locale } = parsed.data as { email: string; locale: (typeof WELCOME_LOCALES)[number] };
  const settings = await getSettings();
  if (!settings.bf_welcome_enabled) return Response.json({ error: "closed" }, { status: 409 });
  // The page's country first (612 345 678 on the Spanish page is +34...), then any international number.
  const phone = parsed.data.phone ? normalizePhoneFor(parsed.data.phone, isBfLocale(locale) ? bfCountryFor(locale) : "PT") ?? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return Response.json({ error: "phone" }, { status: 400 });
  const name = (parsed.data.name ?? "").replace(/\s+/g, " ").slice(0, 80);
  const code = settings.bf_lead_code || null;

  const h = await headers();
  const ipHash = hashIp(clientIp(h));
  if (ipHash) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gte(schema.leads.createdAt, new Date(Date.now() - 3600_000))));
    if ((r?.n ?? 0) >= 5) return Response.json({ error: "rate" }, { status: 429 });
  }

  const withPhone = phone ? { phone, consentPhone: true, phoneConsentText: PHONE_CONSENT[locale], phoneAddedAt: new Date() } : {};
  await db
    .insert(schema.leads)
    .values({ name, email, consentMarketing: true, consentText: CONSENT_TEXT[locale], source: code ? "bf_popup" : "bf_welcome", locale, ipHash, promoCode: code, ...withPhone })
    .onConflictDoUpdate({ target: schema.leads.email, set: { consentMarketing: true, unsubscribedAt: null, locale, ...(name ? { name } : {}), ...(code ? { promoCode: code } : {}), ...withPhone } });
  // The code by SMS as well (like the reference shop), linking back to the page with the code applied.
  if (phone && code && telnyxConfigured("sms")) {
    const path = parsed.data.path && /^\/[a-z]{2}\/black-friday(\/[a-z-]+)?$/.test(parsed.data.path) ? parsed.data.path : `/${locale}/black-friday`;
    const link = `${SITE.url}${path}?promo=${encodeURIComponent(code)}`;
    void sendSms(phone, fmt(name ? SMS[locale] : SMS[locale].replace(/,? \{name\}/, ""), { name: name.split(" ")[0], code, amount: euros(settings.bf_lead_amount_cents, locale), link })).catch((e) =>
      console.error("[bf-popup] sms", e instanceof Error ? e.message : e),
    );
  }
  const [lead] = await db.select({ name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.email, email)).limit(1);
  await enrollWelcome(email, lead?.name || null, locale);
  await logFunnel("Lead", `bfw_${ipHash ?? email.length}_${Date.now()}`).catch(() => {});
  // Send the welcome now instead of waiting for the next worker tick.
  void processBfWelcome().catch((e) => console.error("[bf-welcome] signup send", e));
  return Response.json({ ok: true, code, amount_cents: code ? settings.bf_lead_amount_cents : 0 });
}
