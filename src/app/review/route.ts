import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Clickable customer-journey demo for reviewers (screens in public/review, built by scripts/demo-capture.ts).
export async function GET() {
  const html = await readFile(join(process.cwd(), "public/review/demo.html"), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-cache" } });
}
