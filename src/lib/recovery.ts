import { createHmac } from "node:crypto";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { logOrderEvent } from "./orders";
import { SITE } from "./site";
import { zonedDate, zonedToUtc } from "./time";
import { marketCutoffIso, sendRecoveryEmail } from "./email";
import { assistantFor, dialCall, sendSms, telnyxConfigured } from "./telnyx";
import { recoveryTemplateLanguage, sendRecoveryTemplate, whatsappConfigured } from "./whatsapp";
import { loadOutboundSettings } from "./outbound-settings";
import { getSettings } from "./settings";
import { dayMonthFor, getDict } from "./i18n";
import { fmt } from "./i18n/rich";
import { COUNTRIES, isCountry, isLocale, MARKETS, type Country, type Locale } from "./markets";

// Abandoned-checkout follow-ups. Every step re-checks the order before acting, so a payment at any
// moment stops the sequence. Messages need consent_messages, calls need consent_calls.
export const STEPS = {
  reminder_20m: { delayMin: 20, label: "Reminder (WhatsApp/SMS + email)" },
  ai_call: { delayMin: 120, label: "AI voice call (Telnyx)" },
  final_email: { delayMin: 22 * 60, label: "Final email" },
} as const;
export type StepKey = keyof typeof STEPS;

const PAID = ["paid", "preparing", "shipped", "delivered", "refunded"] as const;

function secret() {
  return process.env.SESSION_SECRET ?? "dev";
}

/** Signed token for /retomar/<token> and the stop link. */
export function resumeToken(orderId: string) {
  const sig = createHmac("sha256", secret()).update(`resume:${orderId}`).digest("base64url").slice(0, 22);
  return `${orderId}.${sig}`;
}
export function verifyResumeToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const orderId = token.slice(0, i);
  return resumeToken(orderId) === token ? orderId : null;
}
export const resumePath = (orderId: string) => `retomar/${resumeToken(orderId)}`;
export const resumeUrl = (orderId: string) => `${SITE.url}/${resumePath(orderId)}`;
export const stopUrl = (orderId: string) => `${SITE.url}/api/recovery/stop?t=${encodeURIComponent(resumeToken(orderId))}`;

/** The customer's time zone for the call hours, by the order's country. */
export const CALL_TZ: Record<Country, string> = { PT: "Europe/Lisbon", DE: "Europe/Berlin", NL: "Europe/Amsterdam", BE: "Europe/Brussels", LU: "Europe/Luxembourg" };

/** Calls only Mon-Sat 09:00-20:00 in the customer's time zone. Returns the given time if allowed, else the next 10:00 slot. */
export function nextCallSlot(at: Date, timeZone = "Europe/Lisbon"): Date {
  const local = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(d);
    return { wd: parts.find((p) => p.type === "weekday")!.value, h: Number(parts.find((p) => p.type === "hour")!.value) };
  };
  const { wd, h } = local(at);
  if (wd !== "Sun" && h >= 9 && h < 20) return at;
  let d = h >= 20 ? new Date(at.getTime() + 86_400_000) : at;
  for (let i = 0; i < 8; i++) {
    const slot = zonedToUtc(zonedDate(d, timeZone), "10:00", timeZone);
    if (local(slot).wd !== "Sun" && slot.getTime() > at.getTime()) return slot;
    d = new Date(d.getTime() + 86_400_000);
  }
  return at;
}

export async function scheduleRecovery(orderId: string, email: string) {
  // A newer checkout by the same person replaces the older sequence.
  const older = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(sql`lower(${schema.orders.email}) = ${email.toLowerCase()}`, ne(schema.orders.id, orderId)));
  if (older.length) {
    await db
      .update(schema.recoverySteps)
      .set({ status: "skipped", result: { reason: "newer_checkout", by: orderId } })
      .where(and(inArray(schema.recoverySteps.orderId, older.map((o) => o.id)), eq(schema.recoverySteps.status, "pending")));
  }
  const now = Date.now();
  await db.insert(schema.recoverySteps).values(
    (Object.keys(STEPS) as StepKey[]).map((step) => {
      let at = new Date(now + STEPS[step].delayMin * 60_000);
      if (step === "ai_call") at = nextCallSlot(at);
      return { orderId, step, scheduledAt: at };
    }),
  );
}

async function skipReason(order: Order): Promise<string | null> {
  if ((PAID as readonly string[]).includes(order.status)) return `order_${order.status}`;
  const events = await db.select({ type: schema.orderEvents.type, payload: schema.orderEvents.payload }).from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
  if (events.some((e) => e.type === "mb_reference_issued")) return "multibanco_reference_issued";
  if (events.some((e) => e.type === "status:cancelled" && e.payload && "by" in e.payload)) return "cancelled_by_admin";
  if (events.some((e) => e.type === "recovery_stopped")) return "customer_opted_out";
  if (order.email) {
    const [paid] = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(sql`lower(${schema.orders.email}) = ${order.email.toLowerCase()}`, inArray(schema.orders.status, [...PAID]), gte(schema.orders.createdAt, order.createdAt)))
      .limit(1);
    if (paid) return `bought_as_${paid.id}`;
  }
  return null;
}

const orderLocale = (o: Pick<Order, "locale">): Locale => (isLocale(o.locale) ? o.locale : "pt");

/** "1 caixa" / "2 caixas" in the order's language ("1 коробка", "2 коробки", "5 коробок"; "2 Boxen"). */
export function bundleLabel(o: Pick<Order, "qtyBoxes" | "locale">) {
  const c = getDict(orderLocale(o)).common;
  return o.qtyBoxes === 1 ? c.oneBox : fmt(c.nBoxes, { n: o.qtyBoxes });
}

/** The reminder SMS in the order's language. cutoff: "30/11" style (dayMonthFor). */
export function recoverySmsText(order: Order, link: string, stop: string, cutoff: string) {
  const t = getDict(orderLocale(order)).messages.recovery;
  const first = (order.customerName ?? "").trim().split(/\s+/)[0] ?? "";
  return fmt(first ? t.smsNamed : t.smsAnon, { name: first, boxes: bundleLabel(order), link, cutoff, stop });
}

/** Exported for tests. Every send goes through the customer's language; nothing falls back to Portuguese silently. */
export async function runStep(step: Pick<typeof schema.recoverySteps.$inferSelect, "id" | "step">, order: Order) {
  const first = (order.customerName ?? "").trim().split(/\s+/)[0] ?? "";
  const locale = orderLocale(order);
  const link = resumeUrl(order.id);
  const result: Record<string, unknown> = {};
  const channels: string[] = [];

  if (step.step === "reminder_20m" || step.step === "final_email") {
    if (!order.consentMessages) return { status: "skipped", result: { reason: "no_message_consent" }, channels };
    if (order.email) {
      channels.push("email");
      result.email = await sendRecoveryEmail(order, step.step === "final_email" ? "final" : "first", link, stopUrl(order.id)).then(
        (r) => (r && "skipped" in r ? "not_configured" : "sent"),
        (e) => `error: ${e}`,
      );
    }
    if (step.step === "reminder_20m" && order.phone) {
      let whatsappSent = false;
      if (whatsappConfigured() && !recoveryTemplateLanguage(locale)) {
        // No approved template in this language: never the Portuguese one, the SMS below goes out instead.
        result.whatsapp = `skipped: no approved ${locale} template`;
      } else if (whatsappConfigured()) {
        channels.push("whatsapp");
        // A template parameter cannot be empty: no first name → "cliente" (in the customer's language).
        result.whatsapp = await sendRecoveryTemplate(order.phone, first || getDict(locale).messages.recovery.waNameFallback, bundleLabel(order), resumePath(order.id), locale).then(
          (r) => (r && typeof r === "object" && "skipped" in r ? `skipped: ${r.skipped}` : ((whatsappSent = true), "sent")),
          (e) => `error: ${e}`,
        );
      }
      // No WhatsApp, or WhatsApp refused (no WhatsApp on that number, template paused...): the reminder still goes by SMS.
      if (!whatsappSent && telnyxConfigured("sms")) {
        channels.push("sms");
        const cutoff = dayMonthFor(locale, marketCutoffIso(await getSettings(), order.country));
        const text = recoverySmsText(order, link, stopUrl(order.id), cutoff);
        result.sms = await sendSms(order.phone, text).then(
          () => "sent",
          (e) => `error: ${e}`,
        );
      }
    }
  } else if (step.step === "ai_call") {
    if (!order.consentCalls) return { status: "skipped", result: { reason: "no_call_consent" }, channels };
    if (!order.phone) return { status: "skipped", result: { reason: "no_phone" }, channels };
    // Calls only to numbers of the countries we sell to; any other number gets messages only.
    if (!COUNTRIES.some((c) => order.phone!.startsWith(MARKETS[c].callingCode))) return { status: "skipped", result: { reason: "non_market_phone" }, channels };
    if (!telnyxConfigured("voice")) return { status: "skipped", result: { reason: "telnyx_voice_not_configured" }, channels };
    // Every page language has its own assistant (native voice); one not set up yet means messages only.
    if (!assistantFor(locale)) return { status: "skipped", result: { reason: `${locale}_assistant_not_configured` }, channels };
    const slot = nextCallSlot(new Date(), CALL_TZ[isCountry(order.country) ? order.country : "PT"]);
    if (slot.getTime() > Date.now() + 60_000) return { status: "pending", reschedule: slot, result: { reason: "outside_call_window" }, channels };
    channels.push("call");
    result.call = await dialCall(order.phone, { orderId: order.id, stepId: step.id }).then(
      (r) => ({ dialed: true, call_control_id: (r as { data?: { call_control_id?: string } }).data?.call_control_id }),
      (e) => ({ error: String(e) }),
    );
  }

  // A WhatsApp error that the SMS backup covered is not a failed step.
  const covered = (k: string) => k === "whatsapp" && result.sms === "sent";
  const failed = Object.entries(result).some(([k, v]) => !covered(k) && ((typeof v === "string" && v.startsWith("error")) || (typeof v === "object" && v && "error" in v)));
  if (channels.length === 0) return { status: "skipped", result: { reason: "no_channel_available" }, channels };
  return { status: failed ? "failed" : "done", result, channels };
}

/** Processes due steps. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function processDueRecovery(limit = 20) {
  await loadOutboundSettings(); // the WhatsApp settings saved in Admin → Settings (refreshed at most every 15 s)
  const claimed = await db.execute<{ id: number }>(sql`
    update recovery_steps set status = 'running', attempted_at = now()
    where id in (select id from recovery_steps where status = 'pending' and scheduled_at <= now() order by scheduled_at limit ${limit} for update skip locked)
    returning id`);
  const ids = [...claimed].map((r) => r.id);
  if (!ids.length) return 0;
  const steps = await db.select().from(schema.recoverySteps).where(inArray(schema.recoverySteps.id, ids));
  for (const step of steps) {
    try {
      const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, step.orderId)).limit(1);
      const reason = order ? await skipReason(order) : "order_missing";
      if (reason || !order) {
        await db.update(schema.recoverySteps).set({ status: "skipped", result: { reason } }).where(eq(schema.recoverySteps.id, step.id));
        continue;
      }
      const r = await runStep(step, order);
      await db
        .update(schema.recoverySteps)
        .set({ status: r.status, result: r.result, channels: r.channels, ...("reschedule" in r && r.reschedule ? { scheduledAt: r.reschedule } : {}) })
        .where(eq(schema.recoverySteps.id, step.id));
      if (r.status !== "pending") await logOrderEvent(order.id, `recovery:${step.step}:${r.status}`, { channels: r.channels, ...r.result });
    } catch (e) {
      await db.update(schema.recoverySteps).set({ status: "failed", result: { error: String(e) } }).where(eq(schema.recoverySteps.id, step.id));
    }
  }
  return steps.length;
}

/** Customer clicked "stop": no more messages or calls for this order or any other order with the same email. */
export async function stopRecovery(orderId: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order) return false;
  const ids = order.email
    ? (await db.select({ id: schema.orders.id }).from(schema.orders).where(sql`lower(${schema.orders.email}) = ${order.email.toLowerCase()}`)).map((o) => o.id)
    : [orderId];
  await db.update(schema.orders).set({ consentMessages: false, consentCalls: false }).where(inArray(schema.orders.id, ids));
  await db
    .update(schema.recoverySteps)
    .set({ status: "skipped", result: { reason: "customer_opted_out" } })
    .where(and(inArray(schema.recoverySteps.orderId, ids), eq(schema.recoverySteps.status, "pending")));
  await logOrderEvent(orderId, "recovery_stopped", {});
  return true;
}

/**
 * Per-call instructions for the Telnyx AI assistant, in the order's language: pt-PT, or Russian for ru orders (the
 * Russian-speaking community in Portugal: same products, prices, CTT delivery and payment methods). The assistant must
 * say it is an AI. guide: whether this language's edition of the recipe guide is offered (Portuguese always is).
 * linkBy: how the payment link reaches the customer after the call (SMS when Telnyx SMS is set up, otherwise email).
 */
export function callScript(order: Order, cutoffLabel: string, guide = true, linkBy: "sms" | "email" = "sms", deliveryDays = "") {
  const first = (order.customerName ?? "").split(" ")[0];
  const total = (order.totalCents / 100).toFixed(2).replace(".", ",");
  const locale = orderLocale(order);
  if (locale === "ru") return callScriptRu(order, first, total, cutoffLabel, guide, linkBy);
  if (locale !== "pt") return callScriptIntl(order, locale, first, total, cutoffLabel, guide, linkBy, deliveryDays);
  return {
    greeting: `Olá${first ? `, ${first}` : ""}! Fala a Madalena, assistente virtual da Wine Portugal. Esta chamada pode ser gravada. Reparei que a sua Trilogia 2160 ficou a meio no nosso site e quis saber se ficou alguma dúvida. Tem um minutinho?`,
    instructions: `És a Madalena, assistente virtual da Wine Portugal. Falas português de Portugal, com simpatia e frases curtas. Já te apresentaste como assistente virtual; se perguntarem se és uma pessoa, diz com honestidade que és uma assistente virtual automática.
Contexto: ${order.customerName ?? "o cliente"} começou uma encomenda no site vinho.prendadenatal.com: Trilogia 2160, ${bundleLabel(order)} (${order.qtyBoxes * 3} garrafas), total ${total} € com IVA. A encomenda não foi paga.
Produto: caixa de oferta com 2160 Onde Tudo Nasce Branco 2025, Rosé 2024 e Tinto 2023, Martin Boutique Wines, Douro DOC, e o guia digital de receitas Sabores de Portugal oferecido. Preços, com envio incluído: 1 caixa 49,90 €, 2 caixas 89,90 € (a 2.ª por 40 €), 4 caixas 149,70 € (pague 3, leve 4). Envio CTT só para Portugal Continental, 2 a 4 dias úteis. Encomendas pagas até ${cutoffLabel} chegam antes do Natal. Pagamento: MB WAY, Multibanco, cartão, Apple Pay, Google Pay.
Objetivo: perceber se houve alguma dúvida ou problema e ajudar a concluir. Se a pessoa quiser concluir, ${linkBy === "email" ? "diz que lhe enviamos o link de pagamento por email logo a seguir à chamada, para o email que deixou no site" : "diz que lhe enviamos agora o link por SMS e que demora um minuto"}.
Regras: nunca peças dados de cartão nem pagamentos por telefone. Não inventes informação que não está aqui; se não souberes, diz que a equipa responde por WhatsApp no +351 910 348 577. Se a pessoa disser que não está interessada ou pedir para não ligar, pede desculpa, confirma que não voltamos a ligar e despede-te. Nunca pressiones. Conversa máxima de 3 minutos. Venda só a maiores de 18 anos.`,
  };
}

// The Belgian-warehouse markets (de, nl, fr pages): a native voice and persona per language. The greeting is written
// in the language; the instructions are in English with "speak <language>", and carry the market's own facts.
const INTL: Record<"de" | "nl" | "fr", { language: string; name: string; greeting: (first: string) => string }> = {
  de: {
    language: "German (formal Sie)",
    name: "Miriam",
    greeting: (f) => `Hallo${f ? ` ${f}` : ""}! Hier ist Miriam, die virtuelle Assistentin von Wine Portugal. Dieses Gespräch kann aufgezeichnet werden. Ich habe gesehen, dass Ihre Bestellung der Trilogia 2160 auf unserer Website nicht abgeschlossen wurde, und wollte fragen, ob noch etwas offen ist. Haben Sie kurz eine Minute?`,
  },
  nl: {
    language: "Dutch (formal u)",
    name: "Katrien",
    greeting: (f) => `Hallo${f ? ` ${f}` : ""}! U spreekt met Katrien, de virtuele assistent van Wine Portugal. Dit gesprek kan worden opgenomen. Ik zag dat uw bestelling van de Trilogia 2160 op onze website niet is afgerond en wilde even vragen of u nog vragen heeft. Heeft u een minuutje?`,
  },
  fr: {
    language: "French (formal vous)",
    name: "Hélène",
    greeting: (f) => `Bonjour${f ? ` ${f}` : ""} ! Ici Hélène, l'assistante virtuelle de Wine Portugal. Cet appel peut être enregistré. J'ai vu que votre commande de la Trilogia 2160 sur notre site n'a pas été finalisée, et je voulais savoir s'il vous restait une question. Vous avez une petite minute ?`,
  },
};

function callScriptIntl(order: Order, locale: Locale, first: string, total: string, cutoffLabel: string, guide: boolean, linkBy: "sms" | "email", deliveryDays: string) {
  const l = INTL[locale as keyof typeof INTL];
  const market = MARKETS[isCountry(order.country) ? order.country : "DE"];
  const extra = market.stripeRedirectMethods.map((m) => (m === "ideal" ? "iDEAL" : "Bancontact"));
  const payment = ["card", "Apple Pay", "Google Pay", ...extra].join(", ");
  return {
    greeting: l.greeting(first),
    instructions: `You are ${l.name}, the virtual assistant of Wine Portugal (a woman). Speak ${l.language}, warmly, in short sentences. You already introduced yourself as a virtual assistant; if asked whether you are a person, say honestly that you are an automated virtual assistant.
Context: ${order.customerName ?? "The customer"} started an order on the shop's site (in ${LANGUAGE_NAMES[locale]}): Trilogia 2160, ${order.qtyBoxes} ${order.qtyBoxes === 1 ? "box" : "boxes"} (${order.qtyBoxes * 3} bottles), total ${total} euros including VAT. The order was not paid.
Product: a Christmas gift box with three Douro DOC wines, 2160 Onde Tudo Nasce by Martin Boutique Wines: Branco 2025, Rosé 2024 and Tinto 2023${guide ? ", plus the free digital recipe guide Sabores de Portugal" : ""}. Prices with shipping included: 1 box 49,90 euros, 2 boxes 89,90 euros (the second for 40 euros), 4 boxes 149,70 euros (pay 3, get 4). Shipped from our warehouse in Belgium${deliveryDays ? `, delivery in ${deliveryDays} working days` : ""}; orders paid by ${cutoffLabel} arrive before Christmas. Payment on the site: ${payment}.
Goal: find out whether there was a question or a problem, and help them finish. If they want to finish, ${linkBy === "email" ? "say we will email them the payment link right after the call, to the address they left on the site" : "say we will text them the link now and it takes a minute"}.
Rules: never ask for card details or take a payment by phone. Never invent information that is not here; if you do not know, say the team answers on WhatsApp at +351 910 348 577. If they are not interested or ask not to be called, apologise, confirm we will not call again and say goodbye. Never pressure. At most 3 minutes. Sales only to adults over 18.`,
  };
}

const LANGUAGE_NAMES: Record<Locale, string> = { pt: "Portuguese", ru: "Russian", de: "German", nl: "Dutch", fr: "French" };

/** "Do not call me" / "not interested" in the AI call's insights (lower-cased), in Portuguese or Russian. */
export function saidStop(text: string) {
  return /(não (me )?lig|nao (me )?lig|não estou interessad|nao estou interessad|remov|не звони|больше не звон|не интересно|не интересует|не нужно|удалит)/.test(text);
}

/** The same call in Russian, for customers of the Portugal market who chose Russian on the site. */
function callScriptRu(order: Order, first: string, total: string, cutoffLabel: string, guide: boolean, linkBy: "sms" | "email") {
  const bottles = fmt(getDict("ru").common.bottles, { n: order.qtyBoxes * 3 });
  const who = order.customerName ? `Клиент ${order.customerName}` : "Клиент";
  return {
    greeting: `Здравствуйте${first ? `, ${first}` : ""}! Это Ольга, виртуальный ассистент Wine Portugal. Этот звонок может записываться. Я вижу, что Ваш заказ Trilogia 2160 на нашем сайте остался незавершённым, и хотела узнать, не осталось ли вопросов. У Вас есть минутка?`,
    instructions: `Ты Ольга, виртуальный ассистент Wine Portugal (говоришь о себе в женском роде). Ты говоришь по-русски, вежливо, на «Вы», короткими фразами. Клиент говорит по-русски и живёт в Португалии. Ты уже представилась как виртуальный ассистент; если спросят, человек ли ты, честно скажи, что ты автоматический виртуальный ассистент.
Контекст: ${who} начал оформлять заказ на сайте vinho.prendadenatal.com: Trilogia 2160, ${bundleLabel(order)} (${bottles}), итого ${total} € с НДС. Заказ не оплачен.
Товар: подарочная коробка с винами 2160 Onde Tudo Nasce: белое 2025, розовое 2024 и красное 2023, Martin Boutique Wines, Douro DOC${guide ? ", и цифровой гид с рецептами Sabores de Portugal в подарок" : ""}. Цены с доставкой: 1 коробка 49,90 €, 2 коробки 89,90 € (вторая за 40 €), 4 коробки 149,70 € (платите за 3, получаете 4). Доставка CTT только по континентальной Португалии, 2-4 рабочих дня. Заказы, оплаченные до ${cutoffLabel}, будут доставлены до Рождества. Оплата: MB WAY, Multibanco, карта, Apple Pay, Google Pay.
Цель: понять, были ли у клиента вопросы или трудности, и помочь завершить заказ. Если клиент хочет завершить заказ, ${linkBy === "email" ? "скажи, что сразу после звонка мы отправим ссылку на оплату по электронной почте, на адрес, указанный на сайте" : "скажи, что мы сейчас отправим ссылку по SMS на русском языке и что это займёт минуту"}.
Правила: никогда не спрашивай данные карты и не принимай оплату по телефону. Не придумывай информацию, которой здесь нет; если не знаешь ответа, скажи, что команда ответит в WhatsApp по номеру +351 910 348 577. Если человек скажет, что ему это не интересно, или попросит больше не звонить, извинись, подтверди, что мы больше не будем звонить, и попрощайся. Никогда не дави. Разговор длится не более 3 минут. Продажа только лицам старше 18 лет.`,
  };
}
