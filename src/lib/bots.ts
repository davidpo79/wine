// Visits that are not people: Meta's ad-review browsers, crawlers, our own post-deploy smoke test and automated checks
// (Playwright/headless Chrome). They are kept under one source so the admin funnel counts only real visitors.
// No node imports: used in the browser (track-client) and on the server.

export const BOT_SOURCE = "Bots & tests";

// Meta reviews every ad by opening the site (and its checkout) from Azure data centres with a fixed, old Chrome
// build on Windows (seen 24/10/2026: Chrome/141.0.7390.37 while real Chrome was at 155). Matched exactly.
const BOT_UA = /headlesschrome|playwright|puppeteer|lighthouse|bot\b|bot\/|crawler|spider|facebookexternalhit|meta-externalagent|Chrome\/141\.0\.7390\.37 /i;

export function isBotUa(ua: string | null | undefined): boolean {
  return !!ua && BOT_UA.test(ua);
}

/** The funnel source to record: BOT_SOURCE for bots, the smoke test or automated browsers; otherwise the visit's own. */
export function funnelSource(src: string | null | undefined, ua: string | null | undefined): string | null {
  if (isBotUa(ua) || src === BOT_SOURCE || src === "smoke-test") return BOT_SOURCE;
  return src ?? null;
}
