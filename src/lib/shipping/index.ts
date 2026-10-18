// Shipping provider registry. Only CTT for now (Portugal ships from the Douro); markets shipping from the Belgian
// warehouse have no carrier integration yet and return null. Nothing calls this yet (zero behavior change).
//
// Env (server only): CTT_APP_ID (X-APPID) + CTT_SECRET (signing) switch on the real API; CTT_API_BASE overrides the
// endpoint; CTT_SIMULATE=1 sends X_SIMULATE: 1 (CTT validates, stores nothing); CTT_MOCK=1 forces the mock.
import { createCttClient } from "./ctt";
import { createMockCttServer } from "./ctt-mock";
import type { ShippingProvider } from "./types";

export type * from "./types";

const BASE = () => (process.env.CTT_API_BASE ?? "https://api.ctt.pt/ecommerce/v3").replace(/\/$/, "");
const env = (name: string) => process.env[`CTT_${name}`]?.trim() || null;

export function cttMode(): ShippingProvider["mode"] {
  if (env("MOCK") === "1" || !env("APP_ID") || !env("SECRET")) return "mock";
  return env("SIMULATE") === "1" ? "simulate" : "live";
}

/** The real API when CTT_APP_ID + CTT_SECRET are set, otherwise the in-process mock (same client code path). */
export function cttFromEnv(): ShippingProvider {
  const mode = cttMode();
  if (mode === "mock") {
    const server = createMockCttServer({ appId: "mock-app", secret: "mock-secret" });
    return createCttClient({ base: server.base, appId: "mock-app", secret: "mock-secret", fetch: server.fetch, mode: "mock" });
  }
  return createCttClient({ base: BASE(), appId: env("APP_ID")!, secret: env("SECRET")!, simulate: mode === "simulate" });
}

let ctt: ShippingProvider | null = null;

export function getShippingProvider(country: string): ShippingProvider | null {
  if (country.trim().toUpperCase() !== "PT") return null;
  return (ctt ??= cttFromEnv());
}
