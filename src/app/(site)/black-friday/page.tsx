import { redirect } from "next/navigation";
import { bfHref } from "@/lib/black-friday";
import { visitor } from "@/lib/visitor";
import { bfLocaleForVisitor } from "@/lib/black-friday-visitor";

export const dynamic = "force-dynamic";

/** One link for the ads: German or Spanish by the visitor's saved choice, location (IP) or phone language. */
export default async function BlackFridayEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])) as [string, string][]).toString();
  redirect(`${bfHref(bfLocaleForVisitor(await visitor()) ?? "es")}${qs ? `?${qs}` : ""}`);
}
