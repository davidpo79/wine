import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { homeHref } from "@/lib/i18n/paths";
import { enabledCountries, homeLocaleFor, visitor } from "@/lib/visitor";
import { LandingRoute, landingMetadata } from "./landing-route";
import { bfHref, bfOpen } from "@/lib/black-friday";
import "./landing.css";

export const dynamic = "force-dynamic";

export const metadata = landingMetadata("pt");

/** Portuguese home. Visitors from another open market (by IP), or who chose another language, go to their page. */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (!sp.lang) {
    const settings = await getSettings();
    const v = await visitor();
    // Visitors from Spain go to the Black Friday box while it sells (Spain has no Christmas Trilogia).
    if (v.ipCountry === "ES" && (!v.savedLocale || v.savedLocale === "es") && bfOpen(settings.black_friday) && settings.black_friday.countries.includes("ES")) redirect(bfHref("es"));
    const target = homeLocaleFor(v, await enabledCountries(settings));
    if (target !== "pt") {
      const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])) as [string, string][]).toString();
      redirect(`${homeHref(target)}${qs ? `?${qs}` : ""}`);
    }
  }
  return <LandingRoute locale="pt" />;
}
