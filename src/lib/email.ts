import { Resend } from "resend";
import type { Order } from "@/db/schema";
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

function orderSummary(o: Order) {
  const addr = o.shippingAddress;
  const lines = [
    `<strong>Encomenda ${esc(o.id)}</strong>`,
    `Trilogia 2160 · ${o.qtyBoxes} ${o.qtyBoxes === 1 ? "caixa" : "caixas"} (${o.qtyBoxes * 3} garrafas)`,
    `Subtotal: ${eur(o.subtotalCents)} · Portes: ${o.shippingCents ? eur(o.shippingCents) : "grátis"}`,
    `<strong>Total: ${eur(o.totalCents)}</strong> (IVA incluído)`,
  ];
  if (addr) {
    lines.push(
      `<br>Entrega: ${esc([addr.name, addr.line1, addr.line2, `${addr.postal_code ?? ""} ${addr.city ?? ""}`].filter(Boolean).join(", "))}`,
    );
  }
  if (o.isGift && o.giftMessage) lines.push(`Mensagem de oferta: <em>${esc(o.giftMessage)}</em>`);
  return `<p style="background:#F6EFE2;padding:12px 14px;border-left:3px solid #C8A253">${lines.join("<br>")}</p>`;
}

async function send(o: Order | null, to: string, subject: string, html: string, kind: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.EMAIL_FROM) {
    if (o) await logOrderEvent(o.id, "email_skipped", { kind, reason: "resend_not_configured" });
    console.warn(`[email] skipped ${kind}: Resend not configured`);
    return { skipped: true };
  }
  const resend = new Resend(key);
  const r = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html, replyTo: SITE.email });
  if (o) await logOrderEvent(o.id, r.error ? "email_error" : "email_sent", { kind, id: r.data?.id, error: r.error?.message });
  return r;
}

export async function ebookLink(): Promise<string | null> {
  if (!bucketConfigured()) return null;
  return presignedGet(SITE.ebookKey, EBOOK_LINK_SECONDS, "Sabores-de-Portugal-Receitas.pdf");
}

export async function sendConfirmation(o: Order) {
  if (!o.email) return;
  const link = await ebookLink();
  const first = (o.customerName ?? "").split(" ")[0];
  const html = layout(
    "Encomenda confirmada",
    `<p>Olá ${esc(first)},</p>
<p>Obrigado! O pagamento foi confirmado e a sua encomenda está a ser preparada. Enviamos em até 48 horas úteis por CTT e receberá um email com o código de seguimento.</p>
${orderSummary(o)}
<p><strong>A sua oferta:</strong> o livro de receitas <em>${esc(SITE.ebookTitle)}</em>, com sugestões para cada um dos três vinhos.</p>
${link ? button(link, "Descarregar o livro de receitas (PDF)") + `<p style="font-size:12px;color:#55606e">O link é válido durante 7 dias. Se expirar, responda a este email e enviamos um novo.</p>` : `<p>[[TODO: e-book ainda não carregado no bucket]] Enviaremos o link do livro em breve.</p>`}
<p>A fatura será enviada para este email${o.nif ? ` com o NIF ${esc(o.nif)}` : ""}.</p>`,
  );
  return send(o, o.email, `Encomenda ${o.id} confirmada · Trilogia 2160`, html, "confirmation");
}

export type MultibancoDetails = { entity?: string | null; reference?: string | null; expires_at?: number | null; hosted_voucher_url?: string | null };

export async function sendPending(o: Order, mb: MultibancoDetails | null) {
  if (!o.email) return;
  const exp = mb?.expires_at ? new Date(mb.expires_at * 1000).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : null;
  const html = layout(
    "Pagamento pendente",
    `<p>Olá,</p>
<p>Recebemos a sua encomenda. Falta apenas o pagamento por Multibanco. Assim que o pagamento for confirmado, enviamos a confirmação e o livro de receitas.</p>
${
  mb?.entity
    ? `<p style="font-size:17px;background:#F6EFE2;padding:12px 14px">Entidade: <strong>${esc(mb.entity)}</strong><br>Referência: <strong>${esc(mb.reference ?? "")}</strong><br>Valor: <strong>${eur(o.totalCents)}</strong>${exp ? `<br>Pagar até: <strong>${esc(exp)}</strong>` : ""}</p>`
    : ""
}
${mb?.hosted_voucher_url ? button(mb.hosted_voucher_url, "Ver referência Multibanco") : ""}
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

export async function sendAdminAlert(o: Order) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) return;
  const html = layout(
    "Nova encomenda",
    `<p>Nova encomenda paga.</p>${orderSummary(o)}
<p>Cliente: ${esc(o.customerName ?? "")} · ${esc(o.email ?? "")} · ${esc(o.phone ?? "")}<br>Pagamento: ${esc(o.paymentMethodType ?? "")}${o.nif ? `<br>NIF: ${esc(o.nif)}` : ""}</p>
${button(`${SITE.url}/admin/orders/${o.id}`, "Abrir no admin")}`,
  );
  return send(o, to, `[Nova encomenda] ${o.id} · ${eur(o.totalCents)}`, html, "admin_alert");
}
