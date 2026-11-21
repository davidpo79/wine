import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";

/** Admin download of a signed UGC contract PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await getAdmin();
  if (!a || a.role !== "admin") return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [c] = await db.select().from(schema.creatorContracts).where(eq(schema.creatorContracts.id, Number(id) || 0)).limit(1);
  if (!c?.signedPdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(c.signedPdf, "base64")), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Contrato_UGC_${c.id}_${c.creatorName.replace(/[^A-Za-z0-9]+/g, "_")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
