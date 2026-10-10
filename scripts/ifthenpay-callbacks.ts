// Prints the ifthenpay callback URLs for this site, and (with --activate) registers them via the API.
// Usage: tsx scripts/ifthenpay-callbacks.ts [--activate]
// Needs SITE_URL, IFTHENPAY_ANTI_PHISHING_KEY, IFTHENPAY_BACKOFFICE_KEY and the method keys in the environment.
import "./load-env";
import { activateCallback, callbackTemplates, methodKey } from "../src/lib/ifthenpay";

const site = process.env.SITE_URL ?? "https://vinho.prendadenatal.com";
const t = callbackTemplates(site);
const plan: [string, string | null, string][] = [
  ["MBWAY", methodKey("MBWAY"), t.MBWAY],
  ["MB", methodKey("MB"), t.MB],
  ["CCARD", methodKey("CCARD"), t.CCARD],
  ["APPLE", methodKey("APPLE"), t.GATEWAY],
  ["GOOGLE", methodKey("GOOGLE"), t.GATEWAY],
];
for (const [m, key, url] of plan) {
  console.log(`\n${m} (${key ? "key set" : "no key, skipped"})\n  ${url}`);
  if (!key || !process.argv.includes("--activate")) continue;
  try {
    console.log("  ->", await activateCallback(m, key, url));
  } catch (e) {
    console.log("  -> FAILED", e instanceof Error ? e.message : e);
  }
}
if (!process.argv.includes("--activate")) console.log("\nDry run. Add --activate to register these URLs at ifthenpay.");
