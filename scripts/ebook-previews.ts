// Uploads the e-book PDF to private/ and rasterizes selected pages to public/ebook/ for the landing page.
// Requires poppler (pdftoppm) locally. Usage: npm run ebook:previews -- ./ebook.pdf 1,5,9,14
import "./load-env";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putObject } from "../src/lib/bucket";
import { SITE } from "../src/lib/site";

const [pdf, pagesArg = "1,2,3,4"] = process.argv.slice(2);
if (!pdf) {
  console.error("Usage: npm run ebook:previews -- <ebook.pdf> [pages, e.g. 1,5,9,14]");
  process.exit(1);
}
await putObject(SITE.ebookKey, readFileSync(pdf), "application/pdf");
console.log(`uploaded ${SITE.ebookKey}`);

const out = mkdtempSync(join(tmpdir(), "ebook-"));
const keys: string[] = [];
for (const p of pagesArg.split(",").map((n) => parseInt(n, 10))) {
  execFileSync("pdftoppm", ["-f", String(p), "-l", String(p), "-jpeg", "-jpegopt", "quality=82", "-scale-to", "900", pdf, join(out, `p${p}`)]);
  const file = readdirSync(out).find((f) => f.startsWith(`p${p}`) && f.endsWith(".jpg"))!;
  const key = `public/ebook/page-${p}.jpg`;
  await putObject(key, readFileSync(join(out, file)), "image/jpeg");
  keys.push(key);
  console.log(`uploaded ${key}`);
}
console.log("\nSet these keys in settings.ebook_previews (admin → Definições) or paste them to Claude:", JSON.stringify(keys));
process.exit(0);
