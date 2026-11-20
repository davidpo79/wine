// Renders every email of the Black Friday welcome sequence, in every language, to HTML files (prices from the
// catalog, date from settings), and prints the schedule someone signing up now would get.
// Usage: tsx scripts/bf-welcome-preview.ts <out dir>
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS, WELCOME_LOCALES } from "../src/lib/bf-welcome/copy";
import { renderWelcome, scheduleFor, varsFor } from "../src/lib/bf-welcome";
import { getSettings } from "../src/lib/settings";

const out = process.argv[2] ?? "bf-welcome-preview";
mkdirSync(out, { recursive: true });
const settings = await getSettings();
for (const l of WELCOME_LOCALES) {
  console.log(l, scheduleFor(l, settings.black_friday.cutoff_at).map((p) => `${p.day}:${p.kind}@${p.at.toISOString()}`).join("  "));
  const stats = { orders: 40, multi: 45, gift: 20 };
  let v = await varsFor(l, "preview@example.com", "Ana María", stats);
  if (!v) {
    // A local database without this market's offer: preview with the Spanish prices.
    const es = await varsFor("es", "preview@example.com", "Ana María", stats);
    if (!es) continue;
    console.log(l, "no offer in the catalog: Spanish prices used for the preview");
    v = { ...es, product: "6 Poço do Canto Palhete 2019", link: es.link.replace("/es/", `/${l}/`) };
  }
  KINDS.forEach((k, i) => {
    const { subject, pre, html } = renderWelcome(l, k, i, v);
    writeFileSync(join(out, `${l}-${i}-${k}.html`), html);
    console.log(`  ${l} ${i} ${k}: ${subject} | ${pre}`);
  });
}
process.exit(0);
