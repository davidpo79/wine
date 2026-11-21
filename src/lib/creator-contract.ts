import { createHash, randomBytes, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CreatorContract } from "@/db/schema";
import { SITE } from "./site";

// UGC creator contract with a simple electronic signature (David, 21/11/2026): the creator opens a personal link,
// fills in their details, confirms their email with a one-time code, draws a signature, and gets the signed PDF.
// Valid as an electronic signature under eIDAS (EU 910/2014); the audit page records who, when, from where and the
// SHA-256 of the exact text that was signed. Spanish text: the creators are in Spain.

export const CONTRACT_VERSION = "ugc-es-2026-11-21";

export type ContractTerms = { videos: number; seconds: number; feeCents: number; deliveryDate: string };
export type SignerFields = { name: string; idNumber: string; address: string; phone: string; iban: string; city: string };

export const newContractToken = () => randomBytes(18).toString("base64url");
export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const otpHash = (token: string, code: string) => createHash("sha256").update(`${token}:${code}`).digest("hex");

const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const dateEs = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
const deliveryEs = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dateEs(d);
};

/** One block of the contract: a heading, a paragraph (with **bold** runs) or a numbered list item. */
export type Block = { h?: string; p?: string; li?: string };

/** The contract text with this contract's terms and, when given, the signer's details. Blanks read "________". */
export function contractBlocks(c: Pick<CreatorContract, "id"> & ContractTerms, s: Partial<SignerFields> = {}, signedAt?: Date | null): Block[] {
  const v = (x?: string | null) => (x && x.trim() ? x.trim() : "________________");
  const n = c.videos;
  return [
    { p: `**De una parte**, ${SITE.legalName}, sociedad portuguesa con NIF ${SITE.nif} y domicilio en ${SITE.address}, que opera con la marca «Wine Portugal» (en adelante, **la Empresa**).` },
    { p: `**De otra parte**, D./Dña. **${v(s.name)}**, mayor de edad, con DNI/NIE ${v(s.idNumber)}, domicilio en ${v(s.address)} y teléfono ${v(s.phone)} (en adelante, **el Creador**).` },
    { p: "Ambas partes se reconocen capacidad suficiente para suscribir el presente contrato y acuerdan las siguientes cláusulas:" },
    { h: "1. Objeto" },
    { p: `El Creador se compromete a producir y entregar a la Empresa **${n} ${n === 1 ? "vídeo original" : "vídeos originales"}** en formato vertical (9:16), de una duración aproximada de ${c.seconds} segundos cada uno (en adelante, **los Materiales**), en los que presenta los productos de la Empresa.` },
    { p: "Los Materiales se realizarán **siguiendo las indicaciones, el guion o el briefing que facilite el equipo de marketing de la Empresa** (mensajes, tono, planos, producto, duración y formato). La Empresa podrá solicitar los ajustes razonables necesarios para que los Materiales se ajusten a dichas indicaciones, antes de su aceptación." },
    { h: "2. Producto" },
    { p: "La Empresa enviará al Creador, sin coste, los productos necesarios para la grabación. Dichos productos quedarán en poder del Creador y no forman parte de la remuneración económica." },
    { h: "3. Remuneración y pago" },
    { p: `En contraprestación por la producción de los Materiales y por la cesión de derechos prevista en este contrato, la Empresa abonará al Creador la cantidad total de **${eur(c.feeCents)} €**.` },
    { p: `**El pago se realizará con la entrega de los Materiales** conforme a las indicaciones de la Empresa, mediante transferencia bancaria a la cuenta IBAN ${v(s.iban)}. El Creador es responsable de sus propias obligaciones fiscales y, en su caso, emitirá la factura o el recibo correspondiente.` },
    { h: "4. Entrega" },
    { p: `El Creador entregará los Materiales a más tardar el **${deliveryEs(c.deliveryDate)}**, en la máxima calidad disponible, sin marcas de agua, sin subtítulos ni música salvo indicación de la Empresa, y, si se solicitan, junto con los archivos originales sin editar.` },
    { h: "5. Cesión de derechos de propiedad intelectual" },
    { p: "El Creador cede a la Empresa, **en exclusiva, con carácter irrevocable, para todo el mundo y por el plazo máximo de duración de los derechos** previsto por la ley, la totalidad de los derechos de explotación sobre los Materiales: reproducción, distribución, comunicación pública (incluida la puesta a disposición en internet y redes sociales) y transformación (edición, montaje, recorte, subtitulado, traducción, doblaje y combinación con otros contenidos)." },
    { p: "La cesión comprende cualquier medio, soporte y modalidad de explotación, conocido o por conocer, y en particular su uso en publicidad de pago (Meta, Instagram, Facebook, TikTok, Google, YouTube y otras plataformas), en la web, en el comercio electrónico, en email y en materiales comerciales de la Empresa, que podrá además ceder o sublicenciar estos derechos a terceros." },
    { p: "**La remuneración de la cláusula 3 incluye la totalidad de la contraprestación por esta cesión.** El Creador no tendrá derecho a ninguna remuneración, compensación, regalía ni pago adicional por el uso de los Materiales, cualquiera que sea su duración, alcance o resultados, y renuncia a cualquier reclamación futura por este concepto." },
    { h: "6. Derechos de imagen y voz" },
    { p: "El Creador autoriza expresamente a la Empresa a utilizar su imagen, voz y nombre o alias tal y como aparecen en los Materiales, para los mismos fines, territorios y plazo indicados en la cláusula 5, sin derecho a contraprestación adicional. El Creador declara conocer que, si revocara esta autorización conforme a la ley, deberá indemnizar a la Empresa por los daños y perjuicios causados, incluidos los costes de las campañas en curso." },
    { p: "La Empresa no está obligada a utilizar los Materiales, ni a mencionar al Creador cuando los utilice." },
    { h: "7. Garantías del Creador" },
    { li: "1. Los Materiales son originales y de su autoría, y su uso no vulnera derechos de terceros." },
    { li: "2. Si en los Materiales aparecen otras personas, el Creador habrá obtenido su autorización por escrito para los mismos usos, y la entregará a la Empresa si esta la solicita. No aparecerán menores de edad." },
    { li: "3. Los Materiales no incluirán música, marcas, logotipos ni obras de terceros sin autorización de la Empresa." },
    { li: "4. Al tratarse de bebidas alcohólicas, el Creador es mayor de 18 años y los Materiales promoverán un consumo moderado y responsable: no mostrarán consumo excesivo, conducción, actividades de riesgo ni asociarán el alcohol al éxito social o sexual." },
    { li: "5. El Creador mantendrá indemne a la Empresa frente a cualquier reclamación de terceros derivada del incumplimiento de estas garantías." },
    { h: "8. Publicaciones del Creador" },
    { p: "El Creador solo podrá publicar los Materiales en sus propias redes con el consentimiento previo de la Empresa y, en tal caso, identificándolos claramente como colaboración o publicidad (p. ej. «#publi» o la herramienta de contenido de marca de la plataforma)." },
    { h: "9. Naturaleza de la relación" },
    { p: "El Creador actúa como profesional independiente. Este contrato no crea ninguna relación laboral, societaria ni de agencia entre las partes, ni exclusividad para el Creador fuera de los Materiales." },
    { h: "10. Confidencialidad y protección de datos" },
    { p: `El Creador mantendrá la confidencialidad de los briefings, precios y campañas de la Empresa no publicados. La Empresa tratará los datos personales del Creador para gestionar este contrato y los pagos, conforme al Reglamento (UE) 2016/679; el Creador puede ejercer sus derechos escribiendo a ${SITE.email}.` },
    { h: "11. Firma electrónica, legislación y jurisdicción" },
    { p: "Las partes aceptan la firma electrónica de este contrato, que tendrá la misma validez que la firma manuscrita conforme al Reglamento (UE) 910/2014 (eIDAS). El contrato se rige por la legislación portuguesa; para cualquier controversia, las partes se someten a los tribunales de Lisboa, sin perjuicio de las normas imperativas aplicables." },
    { p: `Y en prueba de conformidad, las partes firman electrónicamente el presente contrato (n.º ${c.id}) en ${v(s.city)}, a ${signedAt ? dateEs(signedAt) : "la fecha de la firma"}.` },
  ];
}

/** SHA-256 of the exact signed text (version + every block), printed on the audit page. */
export function contractHash(blocks: Block[]) {
  const text = [CONTRACT_VERSION, ...blocks.map((b) => b.h ?? b.p ?? b.li ?? "")].join("\n");
  return createHash("sha256").update(text).digest("hex");
}

export const termsOf = (c: CreatorContract): ContractTerms => ({ videos: c.videos, seconds: c.seconds, feeCents: c.feeCents, deliveryDate: c.deliveryDate });
export const signerOf = (c: CreatorContract): Partial<SignerFields> => ({ name: c.creatorName, idNumber: c.idNumber ?? "", address: c.address ?? "", phone: c.phone ?? "", iban: c.iban ?? "", city: c.city ?? "" });

// ---------- PDF ----------

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 54, top: 58, bottom: 60 };
const WINE = rgb(0.369, 0.133, 0.204);
const INK = rgb(0.11, 0.14, 0.13);
const MUTED = rgb(0.4, 0.43, 0.41);

// pdf-lib's standard fonts are WinAnsi: keep the Spanish accents and €, swap everything else for safe characters.
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–|—/g, "-").replace(/[^\x20-\x7E -ÿ€«»·]/g, "?");

type Run = { text: string; bold: boolean };
const runsOf = (s: string): Run[] =>
  s
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    private doc: PDFDocument,
    private f: { reg: PDFFont; bold: PDFFont },
    private header: (p: PDFPage, n: number) => number,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = this.header(this.page, this.pageNo);
  }
  need(h: number) {
    if (this.y - h < M.bottom) this.newPage();
  }
  /** Wrapped text with bold runs; returns nothing, moves y. */
  para(s: string, o: { size?: number; indent?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = o.size ?? 9.6;
    const lh = size * 1.45;
    const left = M.x + (o.indent ?? 0);
    const width = A4.w - M.x - left;
    const words: { w: string; bold: boolean }[] = [];
    for (const r of runsOf(safe(s))) for (const w of r.text.split(/(\s+)/).filter((x) => x.length)) words.push({ w, bold: r.bold });
    let line: typeof words = [];
    let lw = 0;
    const flush = () => {
      this.need(lh);
      let x = left;
      // no leading space on a wrapped line
      while (line.length && !line[0].w.trim()) line.shift();
      for (const t of line) {
        const font = t.bold ? this.f.bold : this.f.reg;
        this.page.drawText(t.w, { x, y: this.y - size, size, font, color: o.color ?? INK });
        x += font.widthOfTextAtSize(t.w, size);
      }
      this.y -= lh;
      line = [];
      lw = 0;
    };
    for (const t of words) {
      const tw = (t.bold ? this.f.bold : this.f.reg).widthOfTextAtSize(t.w, size);
      if (lw + tw > width && t.w.trim() && line.length) flush();
      line.push(t);
      lw += tw;
    }
    if (line.length) flush();
    this.y -= o.gap ?? 4;
  }
  heading(s: string) {
    this.need(34);
    this.y -= 6;
    this.page.drawText(safe(s.toUpperCase()), { x: M.x, y: this.y - 10, size: 9.6, font: this.f.bold, color: WINE });
    this.y -= 17;
  }
}

async function logoPng() {
  return readFile(join(process.cwd(), "public/brand/logo.png"));
}

export type SignedPdfInput = {
  contract: CreatorContract;
  signer: SignerFields;
  signaturePng: Buffer;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  hash: string;
};

/** The signed contract as a PDF: logo header, the text, both signatures and an audit page. */
export async function signedContractPdf(i: SignedPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Contrato de colaboración UGC n.º ${i.contract.id}`);
  doc.setAuthor(SITE.legalName);
  doc.setCreationDate(i.signedAt);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(await logoPng());
  const sig = await doc.embedPng(i.signaturePng);

  const header = (p: PDFPage, n: number) => {
    const lw = 92;
    const lh = (logo.height / logo.width) * lw;
    p.drawImage(logo, { x: M.x, y: A4.h - M.top - lh + 14, width: lw, height: lh });
    const meta = [SITE.legalName, `NIF ${SITE.nif} · ${SITE.address.split(",")[0]}`, SITE.address.split(",").slice(1).join(",").trim()];
    meta.forEach((t, k) => {
      const s = safe(t);
      p.drawText(s, { x: A4.w - M.x - reg.widthOfTextAtSize(s, 7.6), y: A4.h - M.top + 4 - k * 10, size: 7.6, font: reg, color: MUTED });
    });
    p.drawLine({ start: { x: M.x, y: A4.h - M.top - 28 }, end: { x: A4.w - M.x, y: A4.h - M.top - 28 }, thickness: 1.4, color: WINE });
    const foot = safe(`Wine Portugal · Contrato de colaboración UGC n.º ${i.contract.id} · página ${n}`);
    p.drawText(foot, { x: (A4.w - reg.widthOfTextAtSize(foot, 7.2)) / 2, y: 30, size: 7.2, font: reg, color: MUTED });
    return A4.h - M.top - 42;
  };
  const w = new Writer(doc, { reg, bold }, header);
  w.para("**Contrato de colaboración para la creación de contenido (UGC)**", { size: 14, color: WINE, gap: 2 });
  w.para("Producción de vídeos y cesión de derechos de propiedad intelectual e imagen", { size: 9, color: MUTED, gap: 10 });
  for (const b of contractBlocks(i.contract, i.signer, i.signedAt)) {
    if (b.h) w.heading(b.h);
    else if (b.li) w.para(b.li, { indent: 10, gap: 2 });
    else if (b.p) w.para(b.p);
  }

  // Signatures
  w.need(150);
  w.y -= 18;
  const colW = (A4.w - 2 * M.x - 30) / 2;
  const top = w.y;
  const sigH = 62;
  const sw = Math.min(colW, (sig.width / sig.height) * sigH);
  w.page.drawImage(sig, { x: M.x + colW + 30, y: top - sigH, width: sw, height: sigH });
  const company = safe(`Emitido electrónicamente por ${SITE.legalName}`);
  w.page.drawText(safe("Wine Portugal"), { x: M.x, y: top - 34, size: 18, font: bold, color: WINE });
  w.page.drawText(company, { x: M.x, y: top - 52, size: 7.4, font: reg, color: MUTED });
  for (const x of [M.x, M.x + colW + 30]) w.page.drawLine({ start: { x, y: top - sigH - 6 }, end: { x: x + colW, y: top - sigH - 6 }, thickness: 0.8, color: INK });
  const lines = (x: number, ls: string[]) => ls.forEach((t, k) => w.page.drawText(safe(t), { x, y: top - sigH - 20 - k * 12, size: 8.6, font: k ? reg : bold, color: INK }));
  lines(M.x, ["Por la Empresa", SITE.legalName, `Representante: ${i.contract.companySigner}`]);
  lines(M.x + colW + 30, ["El Creador", i.signer.name, `DNI/NIE: ${i.signer.idNumber}`, `Firmado el ${dateEs(i.signedAt)}`]);
  w.y = top - sigH - 70;

  // Audit trail
  w.newPage();
  w.para("**Registro de firma electrónica**", { size: 13, color: WINE, gap: 8 });
  const row = (k: string, v: string) => w.para(`**${k}:** ${v}`, { gap: 3 });
  row("Contrato", `n.º ${i.contract.id} · versión ${CONTRACT_VERSION}`);
  row("Firmante", `${i.signer.name} · DNI/NIE ${i.signer.idNumber}`);
  row("Email verificado", `${i.contract.email} (código de un solo uso enviado por email e introducido por el firmante)`);
  row("Fecha y hora de la firma", `${i.signedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`);
  row("Dirección IP", i.ip ?? "-");
  row("Navegador", (i.userAgent ?? "-").slice(0, 220));
  row("Huella SHA-256 del texto firmado", i.hash);
  row("Emitido por", `${SITE.legalName} · ${i.contract.companySigner} · ${dateEs(i.contract.createdAt)}`);
  w.y -= 8;
  w.para("El firmante revisó el texto íntegro del contrato, aceptó expresamente sus condiciones marcando la casilla de aceptación, confirmó su dirección de email con un código de un solo uso y dibujó su firma. Cualquier modificación del texto cambiaría la huella SHA-256 indicada arriba. Firma electrónica conforme al Reglamento (UE) 910/2014 (eIDAS).", { size: 8.6, color: MUTED });
  return Buffer.from(await doc.save());
}
