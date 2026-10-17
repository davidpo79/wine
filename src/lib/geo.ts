import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Reader, type CountryResponse } from "mmdb-lib";

// Visitor country from the IP address. Database: IP to Country Lite by DB-IP (https://db-ip.com, CC BY 4.0),
// data/geo/dbip-country-lite.mmdb.gz, refreshed monthly. Loaded once, in memory (about 8 MB).

let reader: Reader<CountryResponse> | null | undefined;

function db() {
  if (reader !== undefined) return reader;
  try {
    reader = new Reader<CountryResponse>(gunzipSync(readFileSync(join(process.cwd(), "data/geo/dbip-country-lite.mmdb.gz"))));
  } catch (e) {
    console.warn("[geo] database not available", e);
    reader = null;
  }
  return reader;
}

export function countryOfIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  try {
    return db()?.get(ip.replace(/^::ffff:/, ""))?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}
