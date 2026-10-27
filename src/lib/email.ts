import { Resend } from "resend";
import type { Lead, Order, OrderAddon } from "@/db/schema";
import { unsubscribeUrl } from "./leads";
import { eur } from "./money";
import { SITE } from "./site";
import { bucketConfigured, headObject, presignedGet } from "./bucket";
import { ctTrackingUrl, logOrderEvent } from "./orders";
import { dayMonthFor, getDict, moneyFor } from "./i18n";
import { fmt } from "./i18n/rich";
import { homeHref } from "./i18n/paths";
import { defaultCountry, isCountry, isLocale, LOCALE_INFO, type Locale } from "./markets";
import type { Settings } from "./settings-defaults";
import { contactHref, logOutbound, shopAddress } from "./inbox";
import { reviewUrl } from "./reviews";
import { ebookFileName, ebookKey, ebookTitle, guideFor } from "./ebook";
import { getSettings } from "./settings";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const localeOf = (o: Pick<Order, "locale"> | null): Locale => (o && isLocale(o.locale) ? o.locale : "pt");
/** Dictionary strings use <b>/<em>; email HTML keeps them as they are. */
const html_ = (s: string) => s.replace(/<b>/g, "<strong>").replace(/<\/b>/g, "</strong>");

const EBOOK_LINK_SECONDS = 7 * 24 * 3600;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, locale: Locale = "pt") {
  const t = getDict(locale).email;
  return `<!doctype html><html lang="${t.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F6EFE2;font-family:Georgia,'Times New Roman',serif;color:#0F2340">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6dcc7">
<tr><td style="background:#0F2340;color:#F6EFE2;padding:20px 24px;font-size:20px;letter-spacing:.5px">Wine Portugal <span style="color:#C8A253">·</span> Trilogia 2160</td></tr>
<tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2a3a">${body}</td></tr>
<tr><td style="padding:16px 24px;background:#F6EFE2;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#55606e">
${fmt(t.footer, { email: esc(SITE.email), whatsapp: esc(SITE.whatsapp) })}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#9E1B22;color:#fff;text-decoration:none;padding:12px 20px;display:inline-block;border-radius:4px;font-weight:bold">${esc(label)}</a></p>`;
}

function addonLabel(o: Order, a: Pick<OrderAddon, "label"> & Partial<Pick<OrderAddon, "kind" | "boxes">>, locale: Locale = localeOf(o)) {
  if (a.kind !== "boxes" || !a.boxes) return a.label;
  const u = getDict(locale).upsell;
  return fmt(u.boxesLabel, { what: a.boxes === 1 ? u.whatOne : fmt(u.whatMany, { n: a.boxes }), bottles: a.boxes * 3 });
}

function orderSummary(o: Order, addons: (Pick<OrderAddon, "label" | "amountCents"> & Partial<Pick<OrderAddon, "kind" | "boxes">>)[] = [], locale: Locale = localeOf(o)) {
  const d = getDict(locale);
  const t = d.email;
  const eur = moneyFor(locale);
  const addr = o.shippingAddress;
  const total = o.totalCents + addons.reduce((n, a) => n + a.amountCents, 0);
  const lines = [
    `<strong>${fmt(t.order, { id: esc(o.id) })}</strong>`,
    fmt(t.product, { boxes: o.qtyBoxes === 1 ? d.common.oneBox : fmt(d.common.nBoxes, { n: o.qtyBoxes }), bottles: o.qtyBoxes * 3 }),
    ...addons.map((a) => `+ ${esc(addonLabel(o, a, locale))}: ${eur(a.amountCents)}`),
    fmt(t.subtotalLine, { subtotal: eur(o.subtotalCents + addons.reduce((n, a) => n + a.amountCents, 0)), shipping: o.shippingCents ? eur(o.shippingCents) : t.shippingIncluded }),
    html_(fmt(t.totalLine, { total: eur(total) })),
  ];
  if (addr) {
    lines.push(`<br>${fmt(t.deliveryTo, { address: esc([addr.name, addr.line1, addr.line2, `${addr.postal_code ?? ""} ${addr.city ?? ""}`].filter(Boolean).join(", ")) })}`);
  }
  if (o.isGift && o.giftMessage) lines.push(fmt(t.giftMessage, { message: esc(o.giftMessage) }));
  return `<p style="background:#F6EFE2;padding:12px 14px;border-left:3px solid #C8A253">${lines.join("<br>")}</p>`;
}

// Provider: Telnyx Email when EMAIL_PROVIDER=telnyx (same TELNYX_API_KEY as voice/SMS/WhatsApp), otherwise Resend.
async function send(o: Order | null, to: string, subject: string, html: string, kind: string) {
  const from = process.env.EMAIL_FROM;
  const telnyx = process.env.EMAIL_PROVIDER === "telnyx";
  const key = telnyx ? process.env.TELNYX_API_KEY : process.env.RESEND_API_KEY;
  if (!key || !from) {
    if (o) await logOrderEvent(o.id, "email_skipped", { kind, reason: "email_not_configured" });
    console.warn(`[email] skipped ${kind}: email provider not configured`);
    return { skipped: true };
  }
  if (telnyx) {
    let id: string | undefined;
    let error: string | undefined;
    try {
      const r = await fetch("https://api.telnyx.com/v2/email_messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ from, to: [to], reply_to: shopAddress().replyTo ?? SITE.email, subject, html_body: html, tags: [kind] }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) id = j?.data?.id;
      else error = `HTTP ${r.status} ${JSON.stringify(j?.errors ?? j).slice(0, 200)}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (o) await logOrderEvent(o.id, error ? "email_error" : "email_sent", { kind, id, error, provider: "telnyx" });
    if (!["admin_alert", "payment_issue", "team_invite"].includes(kind)) await logOutbound({ kind, to, subject, html, resendId: null, orderId: o?.id, error });
    return { id, error };
  }
  const resend = new Resend(key);
  // Replies come back to the shop address, into Admin → Inbox (EMAIL_REPLY_TO overrides it).
  const r = await resend.emails.send({ from, to, subject, html, replyTo: shopAddress().replyTo ?? SITE.email });
  if (o) await logOrderEvent(o.id, r.error ? "email_error" : "email_sent", { kind, id: r.data?.id, error: r.error?.message });
  if (!["admin_alert", "payment_issue", "team_invite"].includes(kind)) await logOutbound({ kind, to, subject, html, resendId: r.data?.id, orderId: o?.id, error: r.error?.message });
  return r;
}

/** A 7-day download link to this language's PDF; null when the file is not in the bucket (never a broken link). */
export async function ebookLink(locale: Locale = "pt"): Promise<string | null> {
  if (!bucketConfigured()) return null;
  if ((await headObject(ebookKey(locale)).catch(() => true)) === null) return null;
  return presignedGet(ebookKey(locale), EBOOK_LINK_SECONDS, ebookFileName(locale));
}

export async function sendConfirmation(o: Order, addons: (Pick<OrderAddon, "label" | "amountCents"> & Partial<Pick<OrderAddon, "kind" | "boxes">>)[] = []) {
  if (!o.email) return;
  const locale = localeOf(o);
  const t = getDict(locale).email;
  // The recipe guide goes out in the customer's language once that edition is uploaded (Admin → Settings).
  const guide = guideFor(await getSettings(), locale);
  const link = guide ? await ebookLink(locale) : null;
  const first = (o.customerName ?? "").split(" ")[0];
  const html = layout(
    t.confirmedTitle,
    `<p>${fmt(t.hello, { name: esc(first) })}</p>
<p>${o.country === "PT" ? t.confirmedText : t.confirmedTextIntl}</p>
${orderSummary(o, addons)}
${
  guide
    ? `<p>${html_(fmt(t.guideOffer, { title: esc(ebookTitle(locale)) }))}</p>
${link ? button(link, t.guideButton) + `<p style="font-size:12px;color:#55606e">${t.guideValidity}</p>` : `<p>${t.guideLater}</p>`}`
    : ""
}
<p>${fmt(t.invoice, { nif: o.nif ? fmt(t.invoiceNif, { nif: esc(o.nif) }) : "" })}</p>`,
    locale,
  );
  return send(o, o.email, fmt(t.confirmedSubject, { id: o.id }), html, "confirmation");
}

export type MultibancoDetails = { entity: string | null; reference: string | null; amountCents: number; expiresAt: Date | null };

export async function sendPending(o: Order, mb: MultibancoDetails) {
  if (!o.email) return;
  // Multibanco is a Portugal-market method: Portuguese or Russian.
  const locale = localeOf(o);
  const t = getDict(locale).email;
  const exp = mb.expiresAt ? mb.expiresAt.toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon" }) : null;
  const ref = (mb.reference ?? "").replace(/\D/g, "").replace(/(\d{3})(?=\d)/g, "$1 ");
  const html = layout(
    t.pendingTitle,
    `<p>${t.helloPlain}</p>
<p>${t.pendingText}</p>
<p style="font-size:17px;background:#F6EFE2;padding:12px 14px">${t.pendingEntity}: <strong>${esc(mb.entity ?? "")}</strong><br>${t.pendingReference}: <strong>${esc(ref)}</strong><br>${t.pendingAmount}: <strong>${moneyFor(locale)(mb.amountCents)}</strong>${exp ? `<br>${t.pendingPayBy}: <strong>${esc(exp)}</strong>` : ""}</p>
${orderSummary(o)}
<p>${t.pendingXmas}</p>`,
    locale,
  );
  return send(o, o.email, fmt(t.pendingSubject, { id: o.id }), html, "pending");
}

export async function sendShipped(o: Order) {
  if (!o.email || !o.trackingNumber) return;
  const locale = localeOf(o);
  const t = getDict(locale).email;
  const ctt = o.country === "PT";
  const html = layout(
    t.shippedTitle,
    `<p>${ctt ? t.shippedText : t.shippedTextIntl}</p>
<p>${html_(fmt(t.tracking, { code: esc(o.trackingNumber) }))}</p>
${ctt ? button(ctTrackingUrl(o.trackingNumber), t.trackButton) : ""}
${orderSummary(o)}
${ctt ? `<p>${t.notHome}</p>` : ""}`,
    locale,
  );
  return send(o, o.email, fmt(ctt ? t.shippedSubject : t.shippedSubjectIntl, { id: o.id, code: o.trackingNumber }), html, "shipped");
}

/** Everything the team needs to prepare and ship without opening the admin: customer, delivery, gift, payment, source. */
function adminOrderDetails(o: Order) {
  const a = o.shippingAddress ?? {};
  const b = o.billingAddress;
  const utm = o.utm ?? {};
  const source = [utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content].filter(Boolean).join(" / ");
  const row = (k: string, v: string | null | undefined) => (v ? `<tr><td style="padding:3px 10px 3px 0;color:#55606e;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:3px 0">${esc(v)}</td></tr>` : "");
  const addr = (x: typeof a) => [x.line1, x.line2, [x.postal_code, x.city].filter(Boolean).join(" "), x.country].filter(Boolean).join(", ");
  const sameBilling = !b || addr(b) === addr(a);
  return `<table style="border-collapse:collapse;font-size:14px;margin:10px 0">
${row("Cliente", o.customerName)}
${row("Email", o.email)}
${row("Telemóvel", o.phone)}
${row("Morada de entrega", addr(a))}
${sameBilling ? "" : row("Morada de faturação", addr(b!))}
${row("NIF", o.nif)}
${row("País / língua", `${o.country} / ${o.locale}`)}
${row("Presente", o.isGift ? "Sim" : "Não")}
${row("Mensagem do cartão", o.giftMessage)}
${row("Pagamento", o.paymentMethodType)}
${row("Contactos (chamadas e mensagens)", o.consentMessages || o.consentCalls ? "Autorizou" : "Não autorizou")}
${row("Origem", source || null)}
</table>`;
}

export async function sendAdminAlert(o: Order, addons: Pick<OrderAddon, "label" | "amountCents">[] = []) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const html = layout(
    "Nova encomenda",
    `<p>Nova encomenda paga${o.country !== "PT" ? ` · ${esc(o.country)} (${esc(o.locale)})` : ""}.</p>${orderSummary(o, addons, "pt")}
${adminOrderDetails(o)}
${button(`${SITE.url}/admin/orders/${o.id}`, "Abrir no admin")}`,
  );
  return send(o, to, `[Nova encomenda] ${o.id} · ${eur(o.totalCents + addons.reduce((n, a) => n + a.amountCents, 0))}`, html, "admin_alert");
}

/** Login details for a new team member (temporary password, changed at first login). Admin UI is in English. */
export async function sendTeamInvite(to: string, role: string, tempPassword: string, invitedBy: string) {
  const html = layout(
    "Wine Portugal admin access",
    `<p>Hello,</p>
<p>${esc(invitedBy)} gave you access to the Wine Portugal shop admin (role: <strong>${esc(role)}</strong>).</p>
<p>Email: <strong>${esc(to)}</strong><br>Temporary password: <strong style="font-family:monospace">${esc(tempPassword)}</strong></p>
${button(`${SITE.url}/admin`, "Open the admin")}
<p style="font-size:13px;color:#55606e">You will choose your own password at the first login. If you did not expect this email, ignore it.</p>`,
    "pt",
  );
  return send(null, to, "Your access to the Wine Portugal admin", html, "team_invite");
}

/** Admin → Email & messages: a test through the same path as every shop email. */
export async function sendTestEmail(to: string) {
  const html = layout("Test", `<p>Test email from the shop (${esc(SITE.url)}), sent ${esc(new Date().toISOString())}.</p><p>If you can read this, email sending works.</p>`, "pt");
  return send(null, to, "Wine Portugal · test email", html, "test");
}

/** Review invitation, a few days after delivery: five star links straight into the form. */
export async function sendReviewRequest(o: Order) {
  if (!o.email) return;
  const locale = localeOf(o);
  const t = getDict(locale).review;
  const name = (o.customerName ?? "").trim().split(/\s+/)[0];
  const e = getDict(locale).email;
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${esc(reviewUrl(o, n))}" title="${esc(t.stars[n - 1])}" style="text-decoration:none;font-size:34px;line-height:1;color:#C8A253;padding:0 3px">&#9733;</a>`,
    )
    .join("");
  const html = layout(
    t.emailTitle,
    `<p>${esc(name ? fmt(e.hello, { name }) : e.helloPlain)}</p>
<p>${esc(fmt(t.emailText, { id: o.id }))}</p>
<p style="margin:18px 0;text-align:center;white-space:nowrap">${stars}</p>
${o.isGift ? `<p>${esc(t.emailGift)}</p>` : ""}
${button(reviewUrl(o), t.emailButton)}
<p style="font-size:13px;color:#55606e">${esc(t.emailOnce)}</p>`,
    locale,
  );
  return send(o, o.email, t.subject, html, "review_request");
}

/** "New message in the inbox" to ADMIN_ALERT_EMAIL (never when that is the shop address itself: it would loop). */
export async function sendInboxAlert(resendId: string) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to || to.toLowerCase().includes(shopAddress().address)) return;
  const [m] = await db.select().from(schema.inboxMessages).where(eq(schema.inboxMessages.resendId, resendId));
  if (!m) return;
  const preview = (m.text ?? "").trim().slice(0, 400);
  const html = layout(
    "Nova mensagem",
    `<p>Nova mensagem de <strong>${esc(m.fromAddr)}</strong>${m.orderId ? ` (encomenda ${esc(m.orderId)})` : ""}.</p>
<p><strong>${esc(m.subject)}</strong></p><p style="white-space:pre-wrap">${esc(preview)}${(m.text ?? "").length > 400 ? "…" : ""}</p>
${button(`${SITE.url}${contactHref(m.contact)}`, "Responder no admin")}`,
  );
  return send(null, to, `[Mensagem] ${m.subject || m.fromAddr}`, html, "admin_alert");
}

/** Christmas cutoff of the country a customer buys for (Admin → Settings → markets, else the global cutoff). */
export function marketCutoffIso(settings: Pick<Settings, "cutoff_at" | "markets">, country: string): string {
  return (isCountry(country) ? settings.markets?.[country]?.cutoff_at : null) ?? settings.cutoff_at;
}

/** Language of a lead: the page it was captured on (Portuguese when unknown). */
export const leadLocale = (lead: Pick<Lead, "locale">): Locale => (isLocale(lead.locale) ? lead.locale : "pt");

/** Landing page in the lead's language with the code in the link (?codigo= is read by the landing page). */
export function leadCodeUrl(locale: Locale, code: string) {
  const home = homeHref(locale);
  return `${SITE.url}${home === "/" ? "/" : home}?codigo=${encodeURIComponent(code)}#escolher`;
}

/** Subject and HTML of the code email (pure: everything it needs is passed in). */
export function leadCodeEmail(lead: Pick<Lead, "name" | "email" | "locale">, code: string, percent: number, maxQty: number, cutoff: string, guide: boolean) {
  const locale = leadLocale(lead);
  const t = getDict(locale).messages.lead;
  const first = lead.name.split(" ")[0];
  const scope = maxQty === 1 ? t.scopeOne : fmt(t.scopeMany, { n: maxQty });
  const html = layout(
    t.codeTitle,
    `<p>${fmt(getDict(locale).email.hello, { name: esc(first) })}</p>
<p>${html_(fmt(t.codeIntro, { percent, scope }))}</p>
<p style="font-size:26px;letter-spacing:3px;font-weight:bold;text-align:center;background:#F6EFE2;padding:14px;border:2px dashed #C8A253">${esc(code)}</p>
${button(leadCodeUrl(locale, code), t.codeButton)}
<p>${fmt(guide ? t.product : t.productNoGuide, { cutoff: esc(cutoff) })}</p>
<p style="font-size:12px;color:#55606e">${t.codeWhy} <a href="${unsubscribeUrl(SITE.url, lead.email)}" style="color:#55606e">${t.unsubscribe}</a>.</p>`,
    locale,
  );
  return { subject: fmt(t.codeSubject, { code, percent }), html };
}

export async function sendLeadCode(lead: Lead, code: string, percent: number, maxQty: number) {
  const locale = leadLocale(lead);
  const settings = await getSettings();
  const cutoff = dayMonthFor(locale, marketCutoffIso(settings, defaultCountry(locale)));
  const { subject, html } = leadCodeEmail(lead, code, percent, maxQty, cutoff, guideFor(settings, locale));
  return send(null, lead.email, subject, html, "lead_code");
}

/** cutoffLabel: the full date in the lead's language (scripts/leads-remind.ts formats it per lead). */
export function leadReminderEmail(lead: Pick<Lead, "name" | "email" | "locale">, code: string, percent: number, cutoffLabel: string) {
  const locale = leadLocale(lead);
  const t = getDict(locale).messages.lead;
  const first = lead.name.split(" ")[0];
  const html = layout(
    t.reminderTitle,
    `<p>${fmt(getDict(locale).email.hello, { name: esc(first) })}</p>
<p>${html_(fmt(t.reminderText, { cutoff: esc(cutoffLabel) }))}</p>
<p>${html_(fmt(t.reminderCode, { code: esc(code), percent }))}</p>
${button(leadCodeUrl(locale, code), t.reminderButton)}
<p style="font-size:12px;color:#55606e"><a href="${unsubscribeUrl(SITE.url, lead.email)}" style="color:#55606e">${t.unsubscribe}</a>.</p>`,
    locale,
  );
  return { subject: fmt(t.reminderSubject, { cutoff: cutoffLabel }), html };
}

export async function sendLeadReminder(lead: Lead, code: string, percent: number, cutoffLabel: string) {
  const { subject, html } = leadReminderEmail(lead, code, percent, cutoffLabel);
  return send(null, lead.email, subject, html, "lead_reminder");
}

/** Subject and HTML of an abandoned-checkout email, in the order's language. cutoff: "30/11" style (dayMonthFor). */
export function recoveryEmail(o: Order, kind: "first" | "final", link: string, stopLink: string, cutoff: string) {
  const locale = localeOf(o);
  const t = getDict(locale).messages.recovery;
  const first = (o.customerName ?? "").split(" ")[0];
  const html = layout(
    kind === "first" ? t.titleFirst : t.titleFinal,
    `<p>${fmt(getDict(locale).email.hello, { name: esc(first) })}</p>
<p>${kind === "first" ? t.textFirst : t.textFinal}</p>
${orderSummary(o)}
${button(link, t.button)}
<p>${fmt(t.help, { cutoff: esc(cutoff), whatsapp: esc(SITE.whatsapp) })}</p>
<p style="font-size:12px;color:#55606e"><a href="${esc(stopLink)}" style="color:#55606e">${t.stop}</a>.</p>`,
    locale,
  );
  return { subject: kind === "first" ? t.subjectFirst : t.subjectFinal, html };
}

export async function sendRecoveryEmail(o: Order, kind: "first" | "final", link: string, stopLink: string) {
  if (!o.email) return;
  const cutoff = dayMonthFor(localeOf(o), marketCutoffIso(await getSettings(), o.country));
  const { subject, html } = recoveryEmail(o, kind, link, stopLink, cutoff);
  return send(o, o.email, subject, html, `recovery_${kind}`);
}

/** Payment anomalies (amount mismatch, duplicate payment) need a human: refund or contact the customer. */
export async function sendPaymentIssueAlert(orderId: string, message: string) {
  console.warn(`[payments] ${orderId}: ${message}`);
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const html = layout("Atenção: pagamento", `<p>${esc(message)}</p>${button(`${SITE.url}/admin/orders/${orderId}`, "Abrir no admin")}`);
  return send(null, to, `[Pagamento] ${orderId}: verificar`, html, "payment_issue");
}

/** An incoming call the team did not answer, handled by the AI assistant: the team should call back. */
export async function sendInboundCallAlert(from: string) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const who = from || "número desconhecido";
  const html = layout("Chamada atendida pela assistente", `<p>Ninguém atendeu uma chamada de <b>${esc(who)}</b> e a assistente virtual atendeu. Ligue de volta; a conversa está no Telnyx (AI Assistants → Conversations).</p>`);
  return send(null, to, `[Chamada] ${who}: atendida pela assistente, ligar de volta`, html, "inbound_call");
}

export async function sendAddonConfirmation(o: Order, a: OrderAddon) {
  if (!o.email) return;
  const locale = localeOf(o);
  const t = getDict(locale).email;
  const html = layout(
    t.addonTitle,
    `<p>${fmt(t.hello, { name: esc((o.customerName ?? "").split(" ")[0]) })}</p>
<p>${html_(fmt(t.addonText, { id: esc(o.id) }))}</p>
<p style="background:#F6EFE2;padding:12px 14px;border-left:3px solid #C8A253"><strong>${esc(addonLabel(o, a))}</strong><br>${moneyFor(locale)(a.amountCents)} ${t.addonVat}</p>
<p>${t.addonSame}</p>`,
    locale,
  );
  return send(o, o.email, fmt(t.addonSubject, { id: o.id }), html, "addon_confirmation");
}

/** Portugal HR callers: one offer e-mail written on the admin screen. Replies come back to the shop inbox. */
export async function sendOfferEmail(to: string, subject: string, html: string) {
  return send(null, to, subject, html, "pt_offer");
}
