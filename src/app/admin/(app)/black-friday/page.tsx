import Link from "next/link";
import { and, inArray, isNotNull, like, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { getCatalog } from "@/lib/catalog";
import { PAID_STATUSES } from "@/lib/stats";
import { BF_OFFER_IDS, BF_OFFERS, type BfOfferId } from "@/lib/black-friday";
import { bfPanel } from "@/lib/bf-panels";
import { bfPanelsAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

export const dynamic = "force-dynamic";

const eur = (c: number) => `€${(c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const FLAG: Record<string, string> = { DE: "🇩🇪", ES: "🇪🇸", NL: "🇳🇱", BE: "🇧🇪", PT: "🇵🇹" };

/** Paid boxes and revenue per offer and delivery country (orders of its bundles: bf1, bfq2...). */
async function soldByCountry(prefix: string) {
  const rows = await db
    .select({ country: schema.orders.country, boxes: sql<number>`coalesce(sum(${schema.orders.qtyBoxes}),0)::int`, revenue: sql<number>`coalesce(sum(${schema.orders.totalCents}),0)::int`, orders: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID_STATUSES]), isNotNull(schema.orders.paidAt), like(schema.orders.bundleKey, `${prefix}_`), sql`${schema.orders.bundleKey} ~ ${`^${prefix}[0-9]+$`}`))
    .groupBy(schema.orders.country);
  return rows;
}

/** Admin → Black Friday panels: every offer with its ad, prices, costs, profit per country and what is sold so far. */
export default async function BlackFridayPanels() {
  await requireAdmin({ role: "admin" });
  const settings = await getSettings();
  const bf = settings.black_friday;
  const offers = await Promise.all(
    BF_OFFER_IDS.map(async (id: BfOfferId) => {
      const o = BF_OFFERS[id];
      const [catalog, sold] = await Promise.all([getCatalog(o.slug), soldByCountry(o.prefix)]);
      const bundles = (catalog?.bundles ?? []).slice().sort((a, b) => a.qty - b.qty);
      const one = bundles.find((b) => b.qty === 1);
      return { panel: bfPanel(id, settings, one?.priceCents ?? null), bundles, sold, offer: o };
    }),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Black Friday panels</h1>
          <p className="text-xs text-muted">Ads and campaign status as in Meta on 22/11/2026.</p>
          <p className="text-sm text-muted">
            Each offer as in the panels: price with VAT and delivery, costs per box, {bf.fee_percent ?? 3}% payment fee, {bf.marketing_percent ?? 20}% marketing and the VAT of the delivery country. Orders until {new Date(bf.cutoff_at).toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" })} (Berlin).
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/products" className="underline">Edit prices</Link>
          <Link href="/admin/settings" className="underline">Edit costs</Link>
        </div>
      </div>

      <ActionForm action={bfPanelsAction} className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Boxes available and marketing</h2>
        <div className="mt-2 flex flex-wrap items-end gap-4 text-xs">
          {BF_OFFER_IDS.map((id) => (
            <label key={id}>
              {BF_OFFERS[id].contentName}
              <input name={`stock_${id}`} defaultValue={bf.stock?.[id] ?? ""} placeholder="—" className="mt-1 block w-24 rounded border p-1.5 text-sm" />
            </label>
          ))}
          <label>
            Payment fee (%)
            <input name="fee_percent" defaultValue={bf.fee_percent ?? 3} className="mt-1 block w-20 rounded border p-1.5 text-sm" />
          </label>
          <label>
            Marketing (% of the price)
            <input name="marketing_percent" defaultValue={bf.marketing_percent ?? 20} className="mt-1 block w-20 rounded border p-1.5 text-sm" />
          </label>
          <Submit>Save</Submit>
        </div>
      </ActionForm>

      {offers.map(({ panel: p, bundles, sold, offer }) => {
        const soldBoxes = sold.reduce((n, r) => n + r.boxes, 0);
        return (
          <section key={p.id} className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">🍷 {p.title}</h2>
              <span className="text-xs text-muted">options {offer.prefix}1 · {offer.prefix}2 · {offer.prefix}3 · {offer.bottlesPerBox} bottles a box</span>
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
              <div className="grid grid-cols-2 gap-2 self-start">
                {p.ads.map((a) => (
                  <a key={a.src} href={a.src} target="_blank" rel="noreferrer" className={`block ${a.label.includes("paused") ? "opacity-50" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.src} alt={`Ad ${a.locale}`} className="w-full rounded border" loading="lazy" />
                    <span className="block text-[11px] leading-tight text-muted">{a.locale.toUpperCase()} · {a.label}</span>
                  </a>
                ))}
              </div>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  {p.campaigns.map((c) => (
                    <span key={c.country} className={`rounded-full px-3 py-1 text-xs font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                      {FLAG[c.country]} {c.country} · {c.active ? "running" : "paused"}
                      {c.budget ? ` · ${c.budget} €/day` : ""}
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.links.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1 text-xs hover:bg-paper-2">
                      {l.href} ↗
                    </a>
                  ))}
                </div>

                <table className="w-full text-left">
                  <thead className="text-xs text-muted"><tr><th className="py-1">Option</th><th>Price</th><th>Struck-through</th><th>Per box</th><th>Per bottle</th></tr></thead>
                  <tbody>
                    {bundles.map((b) => (
                      <tr key={b.key} className="border-t">
                        <td className="py-1">{b.qty} {b.qty === 1 ? "box" : "boxes"} <span className="text-xs text-muted">({b.key}{b.active ? "" : ", off"})</span></td>
                        <td className="font-semibold">{eur(b.priceCents)}</td>
                        <td>{b.compareAtCents ? <s>{eur(b.compareAtCents)}</s> : "—"}</td>
                        <td>{eur(Math.round(b.priceCents / b.qty))}</td>
                        <td>{eur(Math.round(b.priceCents / (b.qty * offer.bottlesPerBox)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div>
                  <p className="font-semibold">Costs per box (without VAT)</p>
                  <p className="text-muted">
                    Wine {eur(p.costs.wine_cents)} · transport to Belgium {eur(p.costs.transport_cents)} · shipping box {eur(p.costs.shipping_box_cents)} · handling {eur(p.costs.handling_cents)} · delivery {eur(p.costs.delivery_cents)} = <b className="text-ink">{eur(p.boxCost)}</b>
                  </p>
                </div>

                {p.price != null && (
                  <table className="w-full text-left">
                    <thead className="text-xs text-muted"><tr><th className="py-1">1 box at {eur(p.price)}</th><th>VAT</th><th>Fee</th><th>Marketing</th><th>Costs</th><th>Profit</th><th>Margin</th></tr></thead>
                    <tbody>
                      {p.countries.map((c) => (
                        <tr key={c.country} className="border-t">
                          <td className="py-1">{FLAG[c.country]} {c.country}</td>
                          <td>{eur(c.vat)} <span className="text-xs text-muted">({c.vatPercent}%)</span></td>
                          <td>{eur(c.fee)}</td>
                          <td>{eur(c.marketing)}</td>
                          <td>{eur(c.costs)}</td>
                          <td className={`font-semibold ${c.profit < 0 ? "text-red-700" : "text-green-800"}`}>{eur(c.profit)}</td>
                          <td>{pct(c.margin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {p.ifAllSold && (
                  <p className="rounded bg-paper-2 p-2">
                    If all <b>{p.stock}</b> boxes sell: sales <b>{eur(p.ifAllSold.sales)}</b> · marketing budget <b>{eur(p.ifAllSold.marketing)}</b> · profit{" "}
                    <b>{p.ifAllSold.profitMin === p.ifAllSold.profitMax ? eur(p.ifAllSold.profitMin) : `${eur(p.ifAllSold.profitMin)} – ${eur(p.ifAllSold.profitMax)}`}</b> before overheads and income tax.
                  </p>
                )}

                <div>
                  <p className="font-semibold">Sold so far (paid orders)</p>
                  {sold.length ? (
                    <p className="text-muted">
                      {sold.map((r) => `${FLAG[r.country] ?? ""} ${r.country}: ${r.boxes} boxes, ${r.orders} orders, ${eur(r.revenue)}`).join(" · ")}
                      {p.stock ? ` · ${soldBoxes} of ${p.stock} boxes (${pct(soldBoxes / p.stock)})` : ""}
                    </p>
                  ) : (
                    <p className="text-muted">No paid orders yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
