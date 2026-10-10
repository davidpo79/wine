import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { lisbonDateTime } from "@/lib/time";

export async function GET() {
  if (!(await getAdmin())) return new Response("unauthorized", { status: 401 });
  const rows = await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
  const csv = toCsv(
    ["data", "nome", "email", "telemovel", "consentimento_telefone", "estado_contacto", "notas", "codigo", "consentimento", "texto_consentimento", "cancelado", "utm_source", "utm_campaign", "utm_content"],
    rows.map((l) => [lisbonDateTime(l.createdAt), l.name, l.email, l.phone, l.consentPhone ? "sim" : "nao", l.contactStatus, l.contactNotes, l.promoCode, l.consentMarketing ? "sim" : "nao", l.consentText, lisbonDateTime(l.unsubscribedAt), l.utm?.utm_source, l.utm?.utm_campaign, l.utm?.utm_content]),
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
