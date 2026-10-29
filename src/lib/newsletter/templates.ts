// Newsletter templates: one e-mail-safe skeleton (tables, inline styles, 560 px) dressed by a theme per occasion.
// Pure module (no server imports): the admin editor renders the live preview in the browser with the same code that
// the worker uses to send.

export type NewsletterContent = {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  greeting: string; // "{{nome}}" becomes the contact's first name; with no name, "Olá {{nome}}," reads "Olá,"
  body: string; // paragraphs separated by a blank line; **bold** allowed
  imageUrl: string;
  imageAlt: string;
  offerEnabled: boolean;
  offerTitle: string;
  offerPrice: string;
  offerOldPrice: string;
  offerNote: string;
  ctaLabel: string;
  ctaUrl: string;
  ctaNote: string;
  deadline: string;
  bulletsTitle: string;
  bullets: string; // one per line
  secondImageUrl: string;
  closing: string;
};

export type Theme = {
  key: string;
  label: string; // shown in the admin
  occasion: string; // header ribbon line
  colors: { page: string; header: string; headerText: string; accent: string; accentText: string; ink: string; card: string; cardBorder: string; ornament: string; footer: string; footerText: string };
  ornament: string; // characters that frame the header and the dividers
  headlineFont: string;
  defaults: NewsletterContent;
};

const SITE = "https://vinho.prendadenatal.com";
const IMG = `${SITE}/email`;
const SERIF = "Georgia,'Times New Roman',serif";

const base: Omit<NewsletterContent, "subject" | "preheader" | "eyebrow" | "headline" | "body" | "imageUrl" | "imageAlt" | "deadline" | "bulletsTitle" | "bullets"> = {
  greeting: "Olá {{nome}},",
  offerEnabled: true,
  offerTitle: "2 caixas · 6 garrafas",
  offerPrice: "89,90 €",
  offerOldPrice: "99,80 €",
  offerNote: "Poupe 9,90 € · envio grátis para Portugal Continental",
  ctaLabel: "Encomendar agora",
  ctaUrl: `${SITE}/checkout?b=x2`,
  ctaNote: "MB WAY, Multibanco, cartão, Apple Pay e Google Pay",
  secondImageUrl: "",
  closing: "Com os melhores cumprimentos,\nEquipa Wine Portugal",
};

const TRILOGIA_BULLETS = [
  "Branco, rosé e tinto do Douro DOC, da marca 2160 Onde Tudo Nasce",
  "Caixa pronta a oferecer, sem precisar de embrulho",
  "Guia digital de receitas «Sabores de Portugal» de oferta",
].join("\n");

export const THEMES: Theme[] = [
  {
    key: "natal",
    label: "Natal",
    occasion: "Feliz Natal",
    colors: { page: "#F6EFE2", header: "#0F2340", headerText: "#F6EFE2", accent: "#9E1B22", accentText: "#FFFFFF", ink: "#0F2340", card: "#F6EFE2", cardBorder: "#C8A253", ornament: "#C8A253", footer: "#0F2340", footerText: "#C9CDD6" },
    ornament: "✦",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Duas prendas de Natal resolvidas: 89,90 €",
      preheader: "2 caixas de Natal com vinhos do Douro, envio grátis. Encomendas até 30/11 chegam antes do Natal.",
      eyebrow: "Para os nossos clientes",
      headline: "Duas prendas de Natal resolvidas",
      body: "Obrigado por já ter escolhido a Wine Portugal. Este Natal preparámos a **Trilogia 2160**: uma caixa de oferta com três vinhos do Douro DOC, um branco, um rosé e um tinto, pronta a oferecer.",
      imageUrl: `${IMG}/natal-caixa.jpg`,
      imageAlt: "Caixa de Natal Wine Portugal com três vinhos 2160 do Douro",
      ctaLabel: "Encomendar 2 caixas",
      deadline: "Encomendas até 30 de novembro chegam antes do Natal.",
      bulletsTitle: "Em cada caixa",
      bullets: TRILOGIA_BULLETS,
      secondImageUrl: `${IMG}/natal-mesa.jpg`,
    },
  },
  {
    key: "ano_novo",
    label: "Ano Novo",
    occasion: "Feliz Ano Novo",
    colors: { page: "#1A1A1A", header: "#0B0B0B", headerText: "#E9D8A6", accent: "#D4AF37", accentText: "#111111", ink: "#1A1A1A", card: "#FBF6E9", cardBorder: "#D4AF37", ornament: "#D4AF37", footer: "#0B0B0B", footerText: "#B8B2A2" },
    ornament: "✧",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Um brinde ao novo ano com vinhos do Douro",
      preheader: "Branco, rosé e tinto para a passagem de ano, com envio grátis.",
      eyebrow: "Passagem de ano",
      headline: "Um brinde ao que vem aí",
      body: "Obrigado por fazer parte deste ano connosco. Para a mesa da passagem de ano, a **Trilogia 2160** junta um branco fresco, um rosé elegante e um tinto do Douro numa só caixa.",
      imageUrl: `${IMG}/natal-servir.jpg`,
      imageAlt: "Vinho 2160 a ser servido numa mesa de festa",
      deadline: "Encomende até 23 de dezembro para receber antes da passagem de ano.",
      bulletsTitle: "Para a sua mesa",
      bullets: TRILOGIA_BULLETS,
    },
  },
  {
    key: "sao_valentim",
    label: "São Valentim",
    occasion: "Dia dos Namorados",
    colors: { page: "#FBEFF1", header: "#6E0F25", headerText: "#FBEFF1", accent: "#B3123A", accentText: "#FFFFFF", ink: "#3A0A16", card: "#FFFFFF", cardBorder: "#E7A1B0", ornament: "#E7A1B0", footer: "#6E0F25", footerText: "#F2C9D2" },
    ornament: "♥",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Um jantar a dois com vinhos do Douro",
      preheader: "Três vinhos para três momentos do jantar de São Valentim, com envio grátis.",
      eyebrow: "14 de fevereiro",
      headline: "Para um jantar a dois",
      body: "Um branco para começar, um rosé para a conversa e um tinto para a sobremesa. A **Trilogia 2160** traz os três numa caixa pronta a oferecer.",
      imageUrl: `${IMG}/natal-mesa.jpg`,
      imageAlt: "Os três vinhos 2160 numa mesa com vista para o Douro",
      offerTitle: "1 caixa · 3 garrafas",
      offerPrice: "49,90 €",
      offerOldPrice: "",
      offerNote: "Envio grátis para Portugal Continental",
      ctaUrl: `${SITE}/checkout?b=x1`,
      deadline: "Encomende até 10 de fevereiro para receber a tempo.",
      bulletsTitle: "Na caixa",
      bullets: TRILOGIA_BULLETS,
    },
  },
  {
    key: "dia_do_pai",
    label: "Dia do Pai",
    occasion: "Dia do Pai",
    colors: { page: "#EEF0EA", header: "#1F3A2E", headerText: "#EEF0EA", accent: "#8A5A2B", accentText: "#FFFFFF", ink: "#1F2A24", card: "#F7F3EA", cardBorder: "#B8925A", ornament: "#B8925A", footer: "#1F3A2E", footerText: "#C5D0C8" },
    ornament: "◆",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Para o pai que aprecia um bom vinho",
      preheader: "Três vinhos do Douro numa caixa pronta a oferecer, com envio grátis até 19 de março.",
      eyebrow: "19 de março",
      headline: "Para o pai que aprecia um bom vinho",
      body: "Este Dia do Pai, ofereça o Douro: a **Trilogia 2160** junta um branco, um rosé e um tinto numa caixa pronta a oferecer. Podemos enviar diretamente para a morada dele.",
      imageUrl: `${IMG}/natal-mesa.jpg`,
      imageAlt: "Os três vinhos 2160 numa mesa com vista para o Douro",
      offerTitle: "1 caixa · 3 garrafas",
      offerPrice: "49,90 €",
      offerOldPrice: "",
      offerNote: "Envio grátis para Portugal Continental",
      ctaUrl: `${SITE}/checkout?b=x1`,
      deadline: "Encomende até 14 de março para chegar a 19.",
      bulletsTitle: "Na caixa",
      bullets: TRILOGIA_BULLETS,
    },
  },
  {
    key: "dia_da_mae",
    label: "Dia da Mãe",
    occasion: "Dia da Mãe",
    colors: { page: "#F7F1EC", header: "#7A3E48", headerText: "#F7F1EC", accent: "#B5525F", accentText: "#FFFFFF", ink: "#3B2328", card: "#FFFFFF", cardBorder: "#D9A7A0", ornament: "#C98A7E", footer: "#7A3E48", footerText: "#EBD3CF" },
    ornament: "❀",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Para a mãe, um brinde especial",
      preheader: "Branco, rosé e tinto do Douro numa caixa pronta a oferecer, com envio grátis.",
      eyebrow: "Dia da Mãe",
      headline: "Um brinde especial para a mãe",
      body: "Este Dia da Mãe, ofereça uma caixa com três vinhos do Douro: a **Trilogia 2160**. Pronta a oferecer, e enviamos diretamente para a morada dela se preferir.",
      imageUrl: `${IMG}/natal-mesa.jpg`,
      imageAlt: "Os três vinhos 2160 numa mesa com vista para o Douro",
      offerTitle: "1 caixa · 3 garrafas",
      offerPrice: "49,90 €",
      offerOldPrice: "",
      offerNote: "Envio grátis para Portugal Continental",
      ctaUrl: `${SITE}/checkout?b=x1`,
      deadline: "Encomende até à quarta-feira anterior para chegar a tempo.",
      bulletsTitle: "Na caixa",
      bullets: TRILOGIA_BULLETS,
    },
  },
  {
    key: "classico",
    label: "Clássico (todo o ano)",
    occasion: "Vinhos do Douro",
    colors: { page: "#EEF2F8", header: "#1F4E9C", headerText: "#FFFFFF", accent: "#1F4E9C", accentText: "#FFFFFF", ink: "#132643", card: "#F4F7FB", cardBorder: "#9DB4DA", ornament: "#9DB4DA", footer: "#132643", footerText: "#BFCBE0" },
    ornament: "◇",
    headlineFont: SERIF,
    defaults: {
      ...base,
      subject: "Novidades da Wine Portugal",
      preheader: "Vinhos do Douro, diretamente do produtor para a sua mesa.",
      eyebrow: "Wine Portugal",
      headline: "Do Douro para a sua mesa",
      body: "Escrevemos-lhe com uma novidade da Wine Portugal. A **Trilogia 2160** junta um branco, um rosé e um tinto do Douro DOC numa só caixa.",
      imageUrl: `${IMG}/natal-mesa.jpg`,
      imageAlt: "Os três vinhos 2160 numa mesa com vista para o Douro",
      offerTitle: "1 caixa · 3 garrafas",
      offerPrice: "49,90 €",
      offerOldPrice: "",
      offerNote: "Envio grátis para Portugal Continental",
      ctaUrl: `${SITE}/?b=x1`,
      deadline: "",
      bulletsTitle: "",
      bullets: "",
    },
  },
];

export const themeOf = (key: string) => THEMES.find((t) => t.key === key) ?? THEMES[THEMES.length - 1];

/** Images already hosted on the site, offered in the editor (any https image URL also works, or an upload). */
export const HOSTED_IMAGES = [
  { url: `${IMG}/natal-caixa.jpg`, label: "Caixa de Natal (cena de Natal)" },
  { url: `${IMG}/natal-mesa.jpg`, label: "Três garrafas, mesa com vista para o Douro" },
  { url: `${IMG}/natal-servir.jpg`, label: "A servir vinho numa mesa de festa" },
  { url: `${IMG}/natal-entrega.jpg`, label: "Casal a oferecer a caixa (Natal)" },
  { url: `${IMG}/caixa-fundo-branco.jpg`, label: "Caixa em fundo branco" },
];

// ---- Holiday calendar ------------------------------------------------------------------------------------------

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
/** Portugal: Dia da Mãe is the first Sunday of May. */
function firstSundayOfMay(y: number) {
  const d = new Date(Date.UTC(y, 4, 1));
  d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
  return d;
}

export type Occasion = { template: string; name: string; date: Date; sendBy: Date };

const OCCASIONS: { template: string; name: string; date: (y: number) => Date; leadDays: number }[] = [
  { template: "natal", name: "Natal", date: (y) => new Date(Date.UTC(y, 11, 25)), leadDays: 35 }, // shipping cutoff 30/11
  { template: "ano_novo", name: "Passagem de ano", date: (y) => new Date(Date.UTC(y, 11, 31)), leadDays: 14 },
  { template: "sao_valentim", name: "São Valentim", date: (y) => new Date(Date.UTC(y, 1, 14)), leadDays: 12 },
  { template: "dia_do_pai", name: "Dia do Pai", date: (y) => new Date(Date.UTC(y, 2, 19)), leadDays: 12 },
  { template: "classico", name: "Páscoa", date: (y) => easter(y), leadDays: 14 },
  { template: "dia_da_mae", name: "Dia da Mãe", date: firstSundayOfMay, leadDays: 12 },
];

/** The next occasions from `today`, each with the day the campaign should go out at the latest. */
export function upcomingOccasions(today: Date, count = 4): Occasion[] {
  const y = today.getUTCFullYear();
  const start = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  const all: Occasion[] = [];
  for (const year of [y, y + 1]) {
    for (const o of OCCASIONS) {
      const date = o.date(year);
      if (date.getTime() < start) continue;
      all.push({ template: o.template, name: o.name, date, sendBy: new Date(date.getTime() - o.leadDays * 86_400_000) });
    }
  }
  return all.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, count);
}

// ---- Rendering ---------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const safeUrl = (u: string) => (/^https:\/\//i.test(u.trim()) ? u.trim() : "");

/** Adds the campaign's UTM tags to links into the shop (other links stay as they are). */
export function withUtm(url: string, campaign: string, contentTag: string) {
  const u = safeUrl(url);
  if (!u) return "";
  try {
    const p = new URL(u);
    if (p.hostname !== new URL(SITE).hostname) return u;
    p.searchParams.set("utm_source", "email");
    p.searchParams.set("utm_medium", "newsletter");
    p.searchParams.set("utm_campaign", campaign);
    p.searchParams.set("utm_content", contentTag);
    return p.toString();
  } catch {
    return "";
  }
}

/** "{{nome}}" → first name; without a name, the space before it (and the token) disappear: "Olá {{nome}}," → "Olá,". */
export function personalize(text: string, firstName: string | null | undefined) {
  const name = (firstName ?? "").trim();
  return name ? text.replace(/\{\{\s*nome\s*\}\}/gi, name) : text.replace(/\s*\{\{\s*nome\s*\}\}/gi, "");
}

export type RenderVars = { firstName?: string | null; unsubscribeUrl: string; campaignSlug: string };

export function renderNewsletter(themeKey: string, c: NewsletterContent, v: RenderVars) {
  const t = themeOf(themeKey);
  const k = t.colors;
  const P = (s: string) => personalize(s, v.firstName);
  const cta = withUtm(c.ctaUrl, v.campaignSlug, "botao");
  const img = safeUrl(c.imageUrl);
  const img2 = safeUrl(c.secondImageUrl);
  const paragraphs = P(c.body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:25px">${rich(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const bullets = c.bullets
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<tr><td width="26" valign="top" style="color:${k.ornament};font-size:15px;padding-top:1px">${t.ornament}</td><td style="padding-bottom:10px">${rich(b)}</td></tr>`)
    .join("");
  const divider = `<tr><td align="center" style="padding:6px 0 0;font-size:14px;letter-spacing:10px;color:${k.ornament}">${t.ornament}${t.ornament}${t.ornament}</td></tr>`;

  const html = `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(P(c.subject))}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:28px!important;line-height:34px!important}.price{font-size:42px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${k.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${k.page}">${esc(P(c.preheader))}${"&#8199;&#847;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${k.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#FFFFFF">
<tr><td align="center" style="background:${k.header};padding:18px 24px 16px">
  <span style="font-family:${SERIF};font-size:20px;letter-spacing:3px;color:${k.headerText}">WINE PORTUGAL</span><br>
  <span style="font-family:${SERIF};font-style:italic;font-size:14px;color:${k.ornament}">${t.ornament}&nbsp; ${esc(t.occasion)} &nbsp;${t.ornament}</span>
</td></tr>
${img ? `<tr><td style="padding:0;line-height:0">${cta ? `<a href="${esc(withUtm(c.ctaUrl, v.campaignSlug, "imagem"))}" target="_blank">` : ""}<img src="${esc(img)}" width="560" alt="${esc(c.imageAlt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0">${cta ? "</a>" : ""}</td></tr>` : ""}
<tr><td class="px" style="padding:32px 40px 4px;font-family:Arial,Helvetica,sans-serif;color:${k.ink}">
  ${c.eyebrow ? `<p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${k.accent};font-weight:bold">${esc(P(c.eyebrow))}</p>` : ""}
  <h1 class="h1" style="margin:0 0 16px;font-family:${t.headlineFont};font-weight:normal;font-size:32px;line-height:38px;color:${k.ink}">${esc(P(c.headline))}</h1>
  ${c.greeting ? `<p style="margin:0 0 14px;font-size:16px;line-height:25px">${esc(P(c.greeting))}</p>` : ""}
  ${paragraphs}
</td></tr>
${
  c.offerEnabled
    ? `<tr><td class="px" style="padding:12px 40px 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${k.card};border:2px solid ${k.cardBorder}"><tr><td align="center" style="padding:22px 16px 20px;font-family:Arial,Helvetica,sans-serif;color:${k.ink}">
    ${c.offerTitle ? `<p style="margin:0 0 4px;font-size:15px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">${esc(c.offerTitle)}</p>` : ""}
    ${c.offerPrice ? `<p class="price" style="margin:0;font-family:${SERIF};font-size:50px;line-height:58px;color:${k.accent}">${esc(c.offerPrice)}</p>` : ""}
    ${c.offerOldPrice ? `<p style="margin:2px 0 0;font-size:15px;color:#6B6460"><span style="text-decoration:line-through">${esc(c.offerOldPrice)}</span></p>` : ""}
    ${c.offerNote ? `<p style="margin:8px 0 0;font-size:15px;line-height:22px">${rich(c.offerNote)}</p>` : ""}
  </td></tr></table>
</td></tr>`
    : ""
}
${
  cta && c.ctaLabel
    ? `<tr><td align="center" class="px" style="padding:4px 40px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${k.accent}" style="border-radius:4px">
    <a href="${esc(cta)}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:${k.accentText};text-decoration:none;border-radius:4px">${esc(c.ctaLabel)}</a>
  </td></tr></table>
  ${c.ctaNote ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B6460">${esc(c.ctaNote)}</p>` : ""}
</td></tr>`
    : ""
}
${
  c.deadline
    ? `<tr><td class="px" style="padding:20px 40px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ${k.accent};padding:4px 0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${k.ink}"><strong>${esc(c.deadline)}</strong></td></tr></table></td></tr>`
    : `<tr><td style="padding:8px 0"></td></tr>`
}
${img2 ? `<tr><td style="padding:0;line-height:0"><img src="${esc(img2)}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>` : divider}
${
  bullets
    ? `<tr><td class="px" style="padding:28px 40px 8px;font-family:Arial,Helvetica,sans-serif;color:${k.ink}">
  ${c.bulletsTitle ? `<h2 style="margin:0 0 14px;font-family:${t.headlineFont};font-weight:normal;font-size:23px;line-height:29px">${esc(c.bulletsTitle)}</h2>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:22px">${bullets}</table>
</td></tr>`
    : ""
}
${c.closing ? `<tr><td class="px" style="padding:18px 40px 34px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${k.ink}">${esc(c.closing).replace(/\n/g, "<br>")}</td></tr>` : ""}
<tr><td class="px" style="background:${k.footer};padding:22px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${k.footerText}">
  <p style="margin:0 0 8px">Recebe este e-mail porque é cliente da Wine Portugal. Pode responder a este e-mail com qualquer dúvida.</p>
  <p style="margin:0 0 8px">W.O.P Wines of Portugal, Unipessoal Lda. · Rua Rodrigues Sampaio, 24 A, 1150-280 Lisboa<br>Venda proibida a menores de 18 anos. Seja responsável, beba com moderação.</p>
  <p style="margin:0"><a href="${esc(v.unsubscribeUrl)}" style="color:${k.ornament};text-decoration:underline">Não quero receber mais e-mails</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject: P(c.subject), html };
}

/** A slug for UTM tags and logs: "Natal 2026 · clientes" → "natal-2026-clientes". */
export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "newsletter";
