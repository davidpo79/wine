import { and, countDistinct, gte, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, schema } from "@/db";
import { getCatalog } from "@/lib/catalog";
import { SITE } from "@/lib/site";
import { BF_OFFER_IDS, BF_OFFERS, type BfOfferId } from "@/lib/black-friday";
import { BF_PANEL_TITLE, bfPanelLinks } from "@/lib/bf-panels";
import { LOCALES } from "@/lib/markets";
import { homeHref } from "@/lib/i18n/paths";
import { CopyLink } from "./CopyLink";

export const dynamic = "force-dynamic";

const FLAG: Record<string, string> = { pt: "🇵🇹", es: "🇪🇸", de: "🇩🇪", nl: "🇳🇱", fr: "🇫🇷", ru: "🇷🇺", en: "🇬🇧" };
const eur = (c: number) => `€${(c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Row = { locale: string; href: string; prices?: string; checkout?: { label: string; href: string }[] };

/** Visits (distinct sessions) per page path in the last 24 h and 7 days. */
async function visits(paths: string[]) {
  const since = (h: number) => new Date(Date.now() - h * 3600_000);
  const q = (h: number) =>
    db
      .select({ path: schema.journeyEvents.path, n: countDistinct(schema.journeyEvents.sessionId) })
      .from(schema.journeyEvents)
      .where(and(inArray(schema.journeyEvents.path, paths), gte(schema.journeyEvents.createdAt, since(h))))
      .groupBy(schema.journeyEvents.path);
  const [d, w] = await Promise.all([q(24), q(24 * 7)]);
  const m = new Map<string, { day: number; week: number }>();
  for (const p of paths) m.set(p, { day: 0, week: 0 });
  for (const r of d) if (r.path) m.get(r.path)!.day = Number(r.n);
  for (const r of w) if (r.path) m.get(r.path)!.week = Number(r.n);
  return m;
}

/** Admin → All pages & links: every landing page ("panel") of the shop in one place, with its checkout links. */
export default async function LinksPage() {
  await requireAdmin({ role: "admin" });
  const groups: { title: string; note?: string; rows: Row[] }[] = [];
  for (const id of BF_OFFER_IDS as BfOfferId[]) {
    const o = BF_OFFERS[id];
    const catalog = await getCatalog(o.slug).catch(() => null);
    const bundles = (catalog?.bundles ?? []).slice().sort((a, b) => a.qty - b.qty);
    const prices = bundles.map((b) => `${b.qty}× ${eur(b.priceCents)}`).join(" · ");
    groups.push({
      title: `Black Friday · ${BF_PANEL_TITLE[id] ?? o.contentName}`,
      note: `Delivers to ${o.countries.join(", ")}`,
      rows: bfPanelLinks(id).map((l) => ({
        ...l,
        prices,
        checkout: bundles.map((b) => ({ label: `${b.qty} box${b.qty > 1 ? "es" : ""}`, href: `/checkout?b=${b.key}&l=${l.locale}` })),
      })),
    });
  }
  groups.push({ title: "Christmas · Trilogia 2160 (main site)", rows: LOCALES.map((l) => ({ locale: l, href: homeHref(l) })) });
  const v = await visits(groups.flatMap((g) => g.rows.map((r) => r.href)));
  const full = (href: string) => `${SITE.url}${href}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">All pages & links</h1>
        <p className="text-sm text-muted">Every landing page of the shop, by offer and language, with direct checkout links. Visits are distinct visitors on that exact page (last 24 h / 7 days).</p>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="overflow-hidden rounded-lg border bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-paper/60 px-4 py-2">
            <h2 className="font-semibold">{g.title}</h2>
            <span className="text-xs text-muted">{[g.note, g.rows[0]?.prices].filter(Boolean).join(" · ")}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.href} className="border-b last:border-0 align-top">
                  <td className="w-10 px-4 py-2 text-lg">{FLAG[r.locale] ?? r.locale}</td>
                  <td className="px-2 py-2">
                    <a href={r.href} target="_blank" rel="noopener" className="break-all font-mono text-xs text-azulejo underline">
                      {full(r.href)}
                    </a>
                    {r.checkout?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                        Checkout:
                        {r.checkout.map((c) => (
                          <a key={c.href} href={c.href} target="_blank" rel="noopener" className="underline">
                            {c.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-xs text-muted" title="Visitors in the last 24 h / 7 days">
                    {v.get(r.href)?.day ?? 0} / {v.get(r.href)?.week ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <a href={r.href} target="_blank" rel="noopener" className="rounded border px-2 py-1 text-xs hover:bg-paper">
                        Open
                      </a>
                      <CopyLink url={full(r.href)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
