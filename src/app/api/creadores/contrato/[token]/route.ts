import { headers } from "next/headers";
import { z } from "zod";
import { clientIp } from "@/lib/request";
import { requestSignCode, signContract } from "@/lib/creator-contract-service";

// Signing a UGC creator contract (lib/creator-contract.ts): "code" saves the details and emails a one-time code,
// "sign" checks it and stores the drawn signature with the signed PDF.
const Fields = z.object({
  name: z.string().trim().min(3).max(100),
  idNumber: z.string().trim().min(5).max(20),
  address: z.string().trim().min(5).max(200),
  phone: z.string().trim().min(6).max(30),
  iban: z.string().trim().transform((v) => v.replace(/\s+/g, "").toUpperCase()).pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/)),
  city: z.string().trim().min(2).max(60),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("code"), fields: Fields }),
  z.object({
    action: z.literal("sign"),
    fields: Fields,
    code: z.string().regex(/^\d{6}$/),
    accept: z.literal(true),
    signature: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(600_000),
  }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const iban = parsed.error.issues.some((i) => i.path.includes("iban"));
    return Response.json({ error: iban ? "Revisa el IBAN (por ejemplo ES12 3456 7890 1234 5678 9012)." : "Revisa los datos: todos los campos son obligatorios." }, { status: 400 });
  }
  const b = parsed.data;
  if (b.action === "code") {
    const r = await requestSignCode(token, b.fields);
    return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
  }
  const png = Buffer.from(b.signature.split(",")[1], "base64");
  if (png.length < 800) return Response.json({ error: "Dibuja tu firma en el recuadro." }, { status: 400 });
  const h = await headers();
  const r = await signContract(token, { code: b.code, signaturePng: png, fields: b.fields, ip: clientIp(h), userAgent: h.get("user-agent") });
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
}
