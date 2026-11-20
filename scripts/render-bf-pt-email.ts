// Renders the Black Friday PT newsletter draft to an HTML file (preview only): npx tsx scripts/render-bf-pt-email.ts <out.html>
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BF_PT_CAMPAIGN, renderFor } from "@/lib/newsletter";

async function main() {
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.name, BF_PT_CAMPAIGN)).limit(1);
  if (!c) throw new Error("campaign draft not found");
  const r = renderFor(c, { id: 1, firstName: "Ana" });
  writeFileSync(process.argv[2] ?? "bf-pt-email.html", r.html);
  console.log("subject:", r.subject ?? "");
  process.exit(0);
}
main();
