import { headers } from "next/headers";
import { countryOfIp } from "@/lib/geo";
import { JourneyBatch, pruneJourney, saveJourney } from "@/lib/journey";
import { clientIp } from "@/lib/request";

// Visit journey batches from the browser (navigator.sendBeacon sends text/plain). Anonymous: no IP or user agent is stored.
export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > 64_000) return new Response(null, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const parsed = JourneyBatch.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const h = await headers();
  try {
    await saveJourney(parsed.data, { ua: h.get("user-agent"), country: countryOfIp(clientIp(h)) });
  } catch (e) {
    console.error("[journey] save failed", e);
  }
  // Retention without a cron: about once every 500 batches, drop events older than the retention period.
  if (Math.random() < 0.002) void pruneJourney().catch((e) => console.error("[journey] prune failed", e));
  return new Response(null, { status: 204 });
}
