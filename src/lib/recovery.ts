import { createHmac } from "node:crypto";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { logOrderEvent } from "./orders";
import { SITE } from "./site";
import { lisbonDate, lisbonToUtc } from "./time";
import { sendRecoveryEmail } from "./email";
import { dialCall, sendSms, telnyxConfigured } from "./telnyx";
import { sendRecoveryTemplate, whatsappConfigured } from "./whatsapp";

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

/** Calls only Mon-Sat 09:00-20:00 Europe/Lisbon. Returns the given time if allowed, else the next 10:00 slot. */
export function nextCallSlot(at: Date): Date {
  const local = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(d);
    return { wd: parts.find((p) => p.type === "weekday")!.value, h: Number(parts.find((p) => p.type === "hour")!.value) };
  };
  const { wd, h } = local(at);
  if (wd !== "Sun" && h >= 9 && h < 20) return at;
  let d = h >= 20 ? new Date(at.getTime() + 86_400_000) : at;
  for (let i = 0; i < 8; i++) {
    const slot = lisbonToUtc(lisbonDate(d), "10:00");
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
  if (events.some((e) => e.type === "stripe:checkout.session.completed")) return "checkout_completed"; // e.g. Multibanco reference issued
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

function bundleLabel(o: Order) {
  return `${o.qtyBoxes} ${o.qtyBoxes === 1 ? "caixa" : "caixas"}`;
}

async function runStep(step: typeof schema.recoverySteps.$inferSelect, order: Order) {
  const first = (order.customerName ?? "").split(" ")[0] || "olá";
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
      if (whatsappConfigured()) {
        channels.push("whatsapp");
        result.whatsapp = await sendRecoveryTemplate(order.phone, first, bundleLabel(order), resumePath(order.id)).then(
          () => "sent",
          (e) => `error: ${e}`,
        );
      } else if (telnyxConfigured("sms")) {
        channels.push("sms");
        const text = `Wine Portugal: Olá ${first}, a sua Trilogia 2160 (${bundleLabel(order)}) ficou por concluir. Retome aqui: ${link} Encomendas até 30/11 chegam antes do Natal. Para não receber mais: ${stopUrl(order.id)}`;
        result.sms = await sendSms(order.phone, text).then(
          () => "sent",
          (e) => `error: ${e}`,
        );
      }
    }
  } else if (step.step === "ai_call") {
    if (!order.consentCalls) return { status: "skipped", result: { reason: "no_call_consent" }, channels };
    if (!order.phone) return { status: "skipped", result: { reason: "no_phone" }, channels };
    if (!telnyxConfigured("voice")) return { status: "skipped", result: { reason: "telnyx_voice_not_configured" }, channels };
    const slot = nextCallSlot(new Date());
    if (slot.getTime() > Date.now() + 60_000) return { status: "pending", reschedule: slot, result: { reason: "outside_call_window" }, channels };
    channels.push("call");
    result.call = await dialCall(order.phone, { orderId: order.id, stepId: step.id }).then(
      (r) => ({ dialed: true, call_control_id: (r as { data?: { call_control_id?: string } }).data?.call_control_id }),
      (e) => ({ error: String(e) }),
    );
  }

  const failed = Object.values(result).some((v) => (typeof v === "string" && v.startsWith("error")) || (typeof v === "object" && v && "error" in v));
  if (channels.length === 0) return { status: "skipped", result: { reason: "no_channel_available" }, channels };
  return { status: failed ? "failed" : "done", result, channels };
}

/** Processes due steps. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function processDueRecovery(limit = 20) {
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

/** Per-call instructions for the Telnyx AI assistant (pt-PT). The assistant must say it is an AI. */
export function callScript(order: Order, cutoffLabel: string) {
  const first = (order.customerName ?? "").split(" ")[0];
  const total = (order.totalCents / 100).toFixed(2).replace(".", ",");
  return {
    greeting: `Olá${first ? `, ${first}` : ""}! Fala o assistente virtual da Wine Portugal, um sistema de inteligência artificial. Esta chamada pode ser gravada para qualidade. Liguei porque começou uma encomenda da Trilogia 2160 no nosso site e ficou por concluir. Tem um minuto?`,
    instructions: `És o assistente virtual (inteligência artificial) da Wine Portugal. Falas português de Portugal, com simpatia e frases curtas. Já te apresentaste como IA; se perguntarem, confirma que és um assistente automático.
Contexto: ${order.customerName ?? "o cliente"} começou uma encomenda no site vinho.prendadenatal.com: Trilogia 2160, ${bundleLabel(order)} (${order.qtyBoxes * 3} garrafas), total ${total} € com IVA. A encomenda não foi paga.
Produto: caixa de oferta com 2160 Onde Tudo Nasce Branco 2025, Rosé 2024 e Tinto 2023, Martin Boutique Wines, Douro DOC, e o guia digital de receitas Sabores de Portugal oferecido. Preços: 1 caixa 45,90 € (+4,90 € portes), 2 caixas 82,62 € com envio grátis, 3 caixas 117,05 € com envio grátis. Envio CTT só para Portugal Continental, 2 a 4 dias úteis. Encomendas pagas até ${cutoffLabel} chegam antes do Natal. Pagamento: MB WAY, Multibanco, cartão, Apple Pay, Google Pay.
Objetivo: perceber se houve alguma dúvida ou problema e ajudar a concluir. Se a pessoa quiser concluir, diz que lhe enviamos agora o link por SMS e que demora um minuto.
Regras: nunca peças dados de cartão nem pagamentos por telefone. Não inventes informação que não está aqui; se não souberes, diz que a equipa responde por WhatsApp no +351 910 348 577. Se a pessoa disser que não está interessada ou pedir para não ligar, pede desculpa, confirma que não voltamos a ligar e despede-te. Nunca pressiones. Conversa máxima de 3 minutos. Venda só a maiores de 18 anos.`,
  };
}
