import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";

// CTT Expresso acceptance certificate of a daily close (PDF), for logged-in admins and fulfilment users.
export async function GET(req: Request) {
  const me = await getAdmin().catch(() => null);
  if (!me || me.mustChangePassword) return new Response("unauthorized", { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [c] = Number.isInteger(id) ? await db.select().from(schema.cttCloses).where(eq(schema.cttCloses.id, id)) : [];
  if (!c?.pdf) return new Response("no document", { status: 404 });
  return new Response(Buffer.from(c.pdf, "base64"), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="CTT-fecho-${c.id}.pdf"`, "Cache-Control": "no-store" },
  });
}
