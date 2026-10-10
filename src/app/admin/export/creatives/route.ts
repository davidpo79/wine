import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/auth";
import { getObject } from "@/lib/bucket";

export async function GET() {
  const me = await getAdmin();
  if (!me || me.mustChangePassword || me.role !== "admin") return new Response("unauthorized", { status: 401 });
  const rows = await db.select().from(schema.creatives).where(eq(schema.creatives.status, "approved"));
  const files: Record<string, Uint8Array> = {};
  const manifest = rows.map((c) => ({ name: `${c.conceptKey}_v${c.variation}`, format: c.format, primary_text: c.primaryText, headline: c.headline, description: c.description, cta: c.cta, utm_content: c.utmContent }));
  for (const c of rows) {
    try {
      const obj = await getObject(c.imageKey);
      const body = obj.body as unknown as { transformToByteArray: () => Promise<Uint8Array> };
      files[`${c.conceptKey}/${c.conceptKey}_v${c.variation}_${c.format}.png`] = await body.transformToByteArray();
    } catch {}
  }
  files["approved.json"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const zip = zipSync(files, { level: 0 });
  return new Response(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="anuncios-aprovados.zip"` },
  });
}
