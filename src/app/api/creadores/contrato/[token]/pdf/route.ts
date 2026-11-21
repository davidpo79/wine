import { contractByToken } from "@/lib/creator-contract-service";

/** The signed PDF for the creator (the personal link is the key). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await contractByToken(token);
  if (!c?.signedPdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(c.signedPdf, "base64")), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Contrato_UGC_Wine_Portugal_${c.id}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
