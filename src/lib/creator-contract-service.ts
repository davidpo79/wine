import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendContractCode, sendContractLink, sendSignedContract } from "./email";
import { normalizePhoneFor } from "./markets";
import { sendSms } from "./telnyx";
import { SITE } from "./site";
import {
  contractBlocks,
  contractHash,
  newContractToken,
  newOtp,
  otpHash,
  signedContractPdf,
  termsOf,
  type ContractTerms,
  type SignerFields,
} from "./creator-contract";

export const contractLink = (token: string) => `${SITE.url}/es/creadores/contrato/${token}`;

/** Admin, one click next to the creator's name: create the contract and send its link by email and by SMS. */
export async function createAndSendContract(applicationId: number, terms: ContractTerms, companySigner: string) {
  const [app] = await db.select().from(schema.creatorApplications).where(eq(schema.creatorApplications.id, applicationId)).limit(1);
  if (!app) throw new Error("application not found");
  const phone = app.phone ? normalizePhoneFor(app.phone, "ES") : null;
  const [c] = await db
    .insert(schema.creatorContracts)
    .values({ token: newContractToken(), applicationId, creatorName: app.name, email: app.email, phone, city: app.city, ...terms, companySigner })
    .returning();
  const link = contractLink(c.token);
  const via: string[] = [];
  const mail = await sendContractLink(c.email, c.creatorName, link).catch((e) => ({ error: String(e) }));
  if (!("error" in mail && mail.error) && !("skipped" in mail)) via.push("email");
  if (phone) {
    const first = c.creatorName.split(" ")[0];
    await sendSms(phone, `Hola ${first}, aquí tienes tu contrato de colaboración con Wine Portugal para revisar y firmar: ${link}`)
      .then(() => via.push("sms"))
      .catch((e) => console.error("[contract] sms", e instanceof Error ? e.message : e));
  }
  await db.update(schema.creatorContracts).set({ sentAt: new Date(), sentVia: via.join("+") || "none" }).where(eq(schema.creatorContracts.id, c.id));
  if (app.status === "new") await db.update(schema.creatorApplications).set({ status: "contacted" }).where(eq(schema.creatorApplications.id, app.id));
  return { id: c.id, link, via };
}

export async function contractByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [c] = await db.select().from(schema.creatorContracts).where(eq(schema.creatorContracts.token, token)).limit(1);
  return c ?? null;
}

type Fail = { ok: false; error: string; status: number };

/** Step 1 of signing: save the signer's details and email a one-time code (at most one a minute). */
export async function requestSignCode(token: string, fields: SignerFields): Promise<{ ok: true } | Fail> {
  const c = await contractByToken(token);
  if (!c || c.status === "void") return { ok: false, error: "Este contrato ya no está disponible.", status: 404 };
  if (c.status === "signed") return { ok: false, error: "Este contrato ya está firmado.", status: 409 };
  if (c.otpSentAt && Date.now() - c.otpSentAt.getTime() < 60_000) return { ok: false, error: "Espera un minuto antes de pedir otro código.", status: 429 };
  const code = newOtp();
  await db
    .update(schema.creatorContracts)
    .set({ creatorName: fields.name, idNumber: fields.idNumber, address: fields.address, phone: fields.phone, iban: fields.iban, city: fields.city, otpHash: otpHash(token, code), otpExpiresAt: new Date(Date.now() + 15 * 60_000), otpAttempts: 0, otpSentAt: new Date() })
    .where(eq(schema.creatorContracts.id, c.id));
  await sendContractCode(c.email, code);
  return { ok: true };
}

/** Step 2: check the code, freeze the text, build the signed PDF, email it to both sides. */
export async function signContract(
  token: string,
  input: { code: string; signaturePng: Buffer; fields: SignerFields; ip: string | null; userAgent: string | null },
): Promise<{ ok: true; id: number } | Fail> {
  const c = await contractByToken(token);
  if (!c || c.status === "void") return { ok: false, error: "Este contrato ya no está disponible.", status: 404 };
  if (c.status === "signed") return { ok: false, error: "Este contrato ya está firmado.", status: 409 };
  if (!c.otpHash || !c.otpExpiresAt || c.otpExpiresAt < new Date()) return { ok: false, error: "El código ha caducado. Pide uno nuevo.", status: 400 };
  if (c.otpAttempts >= 5) return { ok: false, error: "Demasiados intentos. Pide un código nuevo.", status: 429 };
  if (otpHash(token, input.code) !== c.otpHash) {
    await db.update(schema.creatorContracts).set({ otpAttempts: c.otpAttempts + 1 }).where(eq(schema.creatorContracts.id, c.id));
    return { ok: false, error: "El código no es correcto.", status: 400 };
  }
  const signedAt = new Date();
  const contract = { ...c, ...input.fields, creatorName: input.fields.name };
  const hash = contractHash(contractBlocks(contract, input.fields, signedAt));
  const pdf = await signedContractPdf({ contract, signer: input.fields, signaturePng: input.signaturePng, signedAt, ip: input.ip, userAgent: input.userAgent, hash });
  // Only the first signature counts (double taps, two tabs).
  const done = await db
    .update(schema.creatorContracts)
    .set({
      status: "signed",
      creatorName: input.fields.name,
      idNumber: input.fields.idNumber,
      address: input.fields.address,
      phone: input.fields.phone,
      iban: input.fields.iban,
      city: input.fields.city,
      signedAt,
      signerIp: input.ip,
      signerUa: input.userAgent?.slice(0, 400) ?? null,
      docHash: hash,
      signaturePng: input.signaturePng.toString("base64"),
      signedPdf: pdf.toString("base64"),
      otpHash: null,
    })
    .where(and(eq(schema.creatorContracts.id, c.id), ne(schema.creatorContracts.status, "signed")))
    .returning({ id: schema.creatorContracts.id });
  if (!done.length) return { ok: false, error: "No se ha podido guardar la firma.", status: 500 };
  if (c.applicationId) await db.update(schema.creatorApplications).set({ status: "chosen" }).where(eq(schema.creatorApplications.id, c.applicationId));
  await sendSignedContract(c.email, input.fields.name, c.id, pdf).catch((e) => console.error("[contract] signed email", e));
  return { ok: true, id: c.id };
}

export { termsOf };
