import { Resend } from "resend";
import type { Lead, Order, OrderAddon } from "@/db/schema";
import { unsubscribeUrl } from "./leads";
import { eur } from "./money";
import { SITE } from "./site";
import { bucketConfigured, presignedGet } from "./bucket";
import { ctTrackingUrl, logOrderEvent } from "./orders";

const EBOOK_LINK_SECONDS = 7 * 24 * 3600;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F6EFE2;font-family:Georgia,'Times New Roman',serif;color:#0F2340">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EFE2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6dcc7">
<tr><td style="background:#0F2340;color:#F6EFE2;padding:20px 24px;font-size:20px;letter-spacing:.5px">Wine Portugal <span style="color:#C8A253">·</span> Trilogia 2160</td></tr>
<tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2a3a">${body}</td></tr>
<tr><td style="padding:16px 24px;background:#F6EFE2;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#55606e">
Dúvidas? ${esc(SITE.email)} · WhatsApp ${esc(SITE.whatsapp)}<br>Seja responsável. Beba com moderação. Venda proibida a menores de 18 anos.</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#9E1B22;color:#fff;text-decoration:none;padding:12px 20px;display:inline-block;border-radius:4px;font-weight:bold">${esc(label)}</a></p>`;
}

function orderSummary(o: Order, addons: Pick<OrderAddon, "label" | "amountCents">[] = []) {
  const addr = o.shippingAddress;
  const total = o.totalCents + addons.reduce((n, a) => n + a.amountCents, 0);
  const lines = [
    `<strong>Encomenda ${esc(o.id)}</strong>`,
    `Trilogia 2160 · ${o.qtyBoxes} ${o.qtyBoxes === 1 ? "caixa" : "caixas"} (${o.qtyBoxes * 3} garrafas)`,
    ...addons.map((a) => `+ ${esc(a.label)}: ${eur(a.amountCents)}`),
    `Subtotal: ${eur(o.subtotalCents + addons.reduce((n, a) => n + a.amountCents, 0))} · Portes: ${o.shippingCents ? eur(o.shippingCents) : "grátis"}`,
    `<strong>Total: ${eur(total)}</strong> (IVA incluído)`,
  ];
  if (addr) {
    lines.push(
      `<br>Entrega: ${esc([addr.name, addr.line1, addr.line2, `${addr.postal_code ?? ""} ${addr.city ?? ""}`].filter(Boolean).join(", "))}`,
    );
  }
  if (o.isGift && o.giftMessage) lines.push(`Mensagem de oferta: <em>${esc(o.giftMessage)}</em>`);
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
        body: JSON.stringify({ from, to: [to], reply_to: SITE.email, subject, html_body: html, tags: [kind] }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) id = j?.data?.id;
      else error = `HTTP ${r.status} ${JSON.stringify(j?.errors ?? j).slice(0, 200)}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (o) await logOrderEvent(o.id, error ? "email_error" : "email_sent", { kind, id, error, provider: "telnyx" });
    return { id, error };
  }
  const resend = new Resend(key);
  const r = await resend.emails.send({ from, to, subject, html, replyTo: SITE.email });
  if (o) await logOrderEvent(o.id, r.error ? "email_error" : "email_sent", { kind, id: r.data?.id, error: r.error?.message });
  return r;
}

export async function ebookLink(): Promise<string | null> {
  if (!bucketConfigured()) return null;
  return presignedGet(SITE.ebookKey, EBOOK_LINK_SECONDS, "Sabores-de-Portugal-Receitas.pdf");
}

export async function sendConfirmation(o: Order, addons: Pick<OrderAddon, "label" | "amountCents">[] = []) {
  if (!o.email) return;
  const link = await ebookLink();
  const first = (o.customerName ?? "").split(" ")[0];
  const html = layout(
    "Encomenda confirmada",
    `<p>Olá ${esc(first)},</p>
<p>Obrigado! O pagamento foi confirmado e a sua encomenda está a ser preparada. Enviamos em até 48 horas úteis por CTT e receberá um email com o código de seguimento.</p>
${orderSummary(o, addons)}
<p><strong>A sua oferta:</strong> o livro de receitas <em>${esc(SITE.ebookTitle)}</em>, com sugestões para cada um dos três vinhos.</p>
${link ? button(link, "Descarregar o livro de receitas (PDF)") + `<p style="font-size:12px;color:#55606e">O link é válido durante 7 dias. Se expirar, responda a este email e enviamos um novo.</p>` : `<p>[[TODO: e-book ainda não carregado no bucket]] Enviaremos o link do livro em breve.</p>`}
<p>A fatura será enviada para este email${o.nif ? ` com o NIF ${esc(o.nif)}` : ""}.</p>`,
  );
  return send(o, o.email, `Encomenda ${o.id} confirmada · Trilogia 2160`, html, "confirmation");
}

export type MultibancoDetails = { entity: string | null; reference: string | null; amountCents: number; expiresAt: Date | null };

export async function sendPending(o: Order, mb: MultibancoDetails) {
  if (!o.email) return;
  const exp = mb.expiresAt ? mb.expiresAt.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : null;
  const ref = (mb.reference ?? "").replace(/\D/g, "").replace(/(\d{3})(?=\d)/g, "$1 ");
  const html = layout(
    "Pagamento pendente",
    `<p>Olá,</p>
<p>Recebemos a sua encomenda. Falta apenas o pagamento por Multibanco (no multibanco ou no homebanking, em Pagamentos de Serviços). Assim que o pagamento for confirmado, enviamos a confirmação e o livro de receitas.</p>
<p style="font-size:17px;background:#F6EFE2;padding:12px 14px">Entidade: <strong>${esc(mb.entity ?? "")}</strong><br>Referência: <strong>${esc(ref)}</strong><br>Valor: <strong>${eur(mb.amountCents)}</strong>${exp ? `<br>Pagar até: <strong>${esc(exp)}</strong>` : ""}</p>
${orderSummary(o)}
<p>Para entrega antes do Natal, o pagamento tem de ser feito até 30/11.</p>`,
  );
  return send(o, o.email, `Encomenda ${o.id}: pagamento Multibanco pendente`, html, "pending");
}

export async function sendShipped(o: Order) {
  if (!o.email || !o.trackingNumber) return;
  const html = layout(
    "Encomenda enviada",
    `<p>Boas notícias: a sua Trilogia 2160 já seguiu por CTT.</p>
<p>Código de seguimento: <strong>${esc(o.trackingNumber)}</strong></p>
${button(ctTrackingUrl(o.trackingNumber), "Seguir encomenda nos CTT")}
${orderSummary(o)}
<p>Se não estiver ninguém em casa, siga as indicações dos CTT no link acima.</p>`,
  );
  return send(o, o.email, `Encomenda ${o.id} enviada · CTT ${o.trackingNumber}`, html, "shipped");
}

export async function sendAdminAlert(o: Order, addons: Pick<OrderAddon, "label" | "amountCents">[] = []) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const html = layout(
    "Nova encomenda",
    `<p>Nova encomenda paga.</p>${orderSummary(o, addons)}
<p>Cliente: ${esc(o.customerName ?? "")} · ${esc(o.email ?? "")} · ${esc(o.phone ?? "")}<br>Pagamento: ${esc(o.paymentMethodType ?? "")}${o.nif ? `<br>NIF: ${esc(o.nif)}` : ""}</p>
${button(`${SITE.url}/admin/orders/${o.id}`, "Abrir no admin")}`,
  );
  return send(o, to, `[Nova encomenda] ${o.id} · ${eur(o.totalCents + addons.reduce((n, a) => n + a.amountCents, 0))}`, html, "admin_alert");
}

export async function sendLeadCode(lead: Lead, code: string, percent: number, maxQty: number) {
  const first = lead.name.split(" ")[0];
  const scope = maxQty === 1 ? "em 1 caixa" : `em 1 a ${maxQty} caixas`;
  const html = layout(
    "O seu código de Natal",
    `<p>Olá ${esc(first)},</p>
<p>Aqui está o seu código com <strong>${percent}% de desconto</strong> ${scope} da Trilogia 2160:</p>
<p style="font-size:26px;letter-spacing:3px;font-weight:bold;text-align:center;background:#F6EFE2;padding:14px;border:2px dashed #C8A253">${esc(code)}</p>
${button(`${SITE.url}/?codigo=${encodeURIComponent(code)}#escolher`, "Usar o código agora")}
<p>Três vinhos do Douro (branco, rosé e tinto) numa caixa de Natal, com o guia digital Sabores de Portugal oferecido. Encomendas até 30/11 chegam antes do Natal.</p>
<p style="font-size:12px;color:#55606e">Recebeu este email porque pediu o código no nosso site. <a href="${unsubscribeUrl(SITE.url, lead.email)}" style="color:#55606e">Não quero receber mais emails</a>.</p>`,
  );
  return send(null, lead.email, `O seu código ${code}: ${percent}% na Trilogia 2160`, html, "lead_code");
}

export async function sendLeadReminder(lead: Lead, code: string, percent: number, cutoffLabel: string) {
  const first = lead.name.split(" ")[0];
  const html = layout(
    "Últimos dias para o Natal",
    `<p>Olá ${esc(first)},</p>
<p>Só um lembrete: as encomendas para entrega antes do Natal fecham a <strong>${esc(cutoffLabel)}</strong>.</p>
<p>O seu código <strong>${esc(code)}</strong> (${percent}% de desconto) continua válido.</p>
${button(`${SITE.url}/?codigo=${encodeURIComponent(code)}#escolher`, "Escolher a minha prenda")}
<p style="font-size:12px;color:#55606e"><a href="${unsubscribeUrl(SITE.url, lead.email)}" style="color:#55606e">Não quero receber mais emails</a>.</p>`,
  );
  return send(null, lead.email, `Faltam poucos dias: encomendas de Natal até ${cutoffLabel}`, html, "lead_reminder");
}

export async function sendRecoveryEmail(o: Order, kind: "first" | "final", link: string, stopLink: string) {
  if (!o.email) return;
  const first = (o.customerName ?? "").split(" ")[0];
  const html = layout(
    kind === "first" ? "A sua prenda ficou à espera" : "Último lembrete",
    `<p>Olá ${esc(first)},</p>
<p>${
      kind === "first"
        ? "Reparámos que a sua encomenda da Trilogia 2160 ficou por concluir. Guardámos a sua escolha:"
        : "Só um último lembrete: a sua encomenda da Trilogia 2160 continua por concluir."
    }</p>
${orderSummary(o)}
${button(link, "Concluir a encomenda")}
<p>Encomendas pagas até 30/11 chegam antes do Natal. Se teve alguma dúvida, responda a este email ou fale connosco por WhatsApp: ${esc(SITE.whatsapp)}.</p>
<p style="font-size:12px;color:#55606e"><a href="${esc(stopLink)}" style="color:#55606e">Não quero receber mais mensagens sobre esta encomenda</a>.</p>`,
  );
  return send(o, o.email, kind === "first" ? "A sua Trilogia 2160 ficou à espera" : "Último lembrete: a sua prenda de Natal", html, `recovery_${kind}`);
}

/** Payment anomalies (amount mismatch, duplicate payment) need a human: refund or contact the customer. */
export async function sendPaymentIssueAlert(orderId: string, message: string) {
  console.warn(`[payments] ${orderId}: ${message}`);
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const html = layout("Atenção: pagamento", `<p>${esc(message)}</p>${button(`${SITE.url}/admin/orders/${orderId}`, "Abrir no admin")}`);
  return send(null, to, `[Pagamento] ${orderId}: verificar`, html, "payment_issue");
}

export async function sendAddonConfirmation(o: Order, a: OrderAddon) {
  if (!o.email) return;
  const html = layout(
    "Oferta adicionada",
    `<p>Olá ${esc((o.customerName ?? "").split(" ")[0])},</p>
<p>Obrigado! Juntámos à sua encomenda <strong>${esc(o.id)}</strong>:</p>
<p style="background:#F6EFE2;padding:12px 14px;border-left:3px solid #C8A253"><strong>${esc(a.label)}</strong><br>${eur(a.amountCents)} (IVA incluído)</p>
<p>Segue tudo na mesma entrega, sem portes adicionais.</p>`,
  );
  return send(o, o.email, `Encomenda ${o.id}: oferta adicionada`, html, "addon_confirmation");
}
