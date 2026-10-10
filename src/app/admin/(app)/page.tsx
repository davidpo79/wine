import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { eur } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { pendingMultibanco, periodStats, trackingHealth } from "@/lib/stats";
import { conversionFunnel, customerStats, PERIODS, upsellBreakdown, type Period } from "@/lib/analytics";
import { startOfLisbonDay } from "@/lib/time";

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0)}%` : "·");

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string; src?: string }> }) {
  await requireAdmin({ role: "admin" });
  const sp = await searchParams;
  const period: Period = sp.p && sp.p in PERIODS ? (sp.p as Period) : "7d";
  const adsOnly = sp.src === "ads";
  const since = period === "today" ? startOfLisbonDay(0) : period === "7d" ? startOfLisbonDay(6) : period === "30d" ? startOfLisbonDay(29) : null;
  const [stats, pending, settings, health, f, ups, cust] = await Promise.all([
    periodStats(since),
    pendingMultibanco(),
    getSettings(),
    trackingHealth(startOfLisbonDay(6)),
    conversionFunnel(since, adsOnly),
    upsellBreakdown(since),
    customerStats(since),
  ]);
  const daysLeft = Math.ceil((new Date(settings.cutoff_at).getTime() - Date.now()) / 86400000);
  const sessions = f.steps[0].count;
  const purchases = f.steps.find((s) => s.key === "purchase")!.count;
  const revenue = stats.revenueCents + ups.addonCents;
  const href = (p: Period, ads: boolean) => `/admin?p=${p}${ads ? "&src=ads" : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          {daysLeft > 0 ? `${daysLeft} days left until the cutoff` : "Christmas cutoff has passed"} · Sales {settings.sales_open ? "open" : "closed"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border bg-white">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={href(p, adsOnly)} className={`px-3 py-1.5 ${p === period ? "bg-night text-paper" : "hover:bg-paper"}`}>{PERIODS[p]}</Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border bg-white">
          <Link href={href(period, false)} className={`px-3 py-1.5 ${!adsOnly ? "bg-night text-paper" : "hover:bg-paper"}`}>All traffic</Link>
          <Link href={href(period, true)} className={`px-3 py-1.5 ${adsOnly ? "bg-night text-paper" : "hover:bg-paper"}`}>From ads</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sessions" value={String(sessions)} note={adsOnly ? "from ads" : undefined} />
        <Kpi label="Orders" value={String(stats.orders)} note={`x1 ${stats.byBundle.x1?.orders ?? 0} · x2 ${stats.byBundle.x2?.orders ?? 0} · x3 ${stats.byBundle.x3?.orders ?? 0}`} />
        <Kpi label="Revenue" value={eur(revenue)} note={ups.addonCents ? `incl. ${eur(ups.addonCents)} add-ons` : undefined} />
        <Kpi label="Conversion rate" value={pct(purchases, sessions)} note="purchases / sessions" />
        <Kpi label="Average order" value={stats.orders ? eur(Math.round(revenue / stats.orders)) : "·"} />
        <Kpi label="Returning customers" value={cust.customers ? pct(cust.returning, cust.customers) : "·"} note={`${cust.returning} returning · ${cust.newCustomers} new`} />
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Conversion funnel · {PERIODS[period]}{adsOnly ? " · from ads" : ""}</h2>
          <p className="text-xs text-muted">% of sessions · drop-off from the previous step</p>
        </div>
        <ol className="mt-4 space-y-3">
          {f.steps.map((s, i) => {
            const prev = i ? f.steps[i - 1].count : 0;
            const width = sessions ? Math.max(0.5, (s.count / sessions) * 100) : 0;
            return (
              <li key={s.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="hidden truncate text-xs text-muted sm:block">{s.hint}</p>
                </div>
                <div className="h-7 rounded bg-paper">
                  <div className={`h-7 rounded ${s.key === "upsell" ? "bg-gold" : s.key === "purchase" ? "bg-green-700" : "bg-azulejo"}`} style={{ width: `${Math.min(100, width)}%` }} />
                </div>
                <div className="text-right text-sm">
                  <span className="font-semibold">{s.count}</span> <span className="text-muted">{i ? pct(s.count, sessions) : ""}</span>
                  {i > 0 && prev > 0 && s.count <= prev && <p className="text-xs text-muted">{s.key === "upsell" ? `${pct(s.count, prev)} of buyers` : `${pct(s.count, prev)} of prev.`}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">
          Sessions, product views and add-to-cart are counted per visit (one browser tab, anonymous). Checkout onward is counted per order and attributed to the visit that opened the checkout. Visits before 10/10/2026 have no source.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Upsells · {PERIODS[period]}</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Offer</th><th>Shown</th><th>Took it</th><th>Take rate</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              <tr className="border-t"><td className="py-1.5">Printed card (checkout bump)</td><td>{ups.orders}</td><td>{ups.bump.orders}</td><td>{pct(ups.bump.orders, ups.orders)}</td><td className="text-right">{eur(ups.bump.cents)}</td></tr>
              <tr className="border-t"><td className="py-1.5">One-time offer before paying<br /><span className="text-xs text-muted">Multibanco</span></td><td>{ups.before.shown}</td><td>{ups.before.orders}</td><td>{pct(ups.before.orders, ups.before.shown)}</td><td className="text-right">{eur(ups.before.cents)}</td></tr>
              <tr className="border-t"><td className="py-1.5">One-click offer after paying<br /><span className="text-xs text-muted">card / Apple Pay / Google Pay / MB WAY</span></td><td>{ups.after.shown}</td><td>{ups.after.orders}</td><td>{pct(ups.after.orders, ups.after.shown)}</td><td className="text-right">{eur(ups.after.cents)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Paid orders: {ups.orders} · add-on revenue {eur(ups.addonCents)}{ups.orders ? ` · +${eur(Math.round(ups.addonCents / ups.orders))} per order` : ""}. “Shown” for the bump = every paid order saw it in the checkout.
          </p>
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">New vs returning customers · {PERIODS[period]}</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Kpi label="New" value={String(cust.newCustomers)} plain />
            <Kpi label="Returning" value={String(cust.returning)} plain />
            <Kpi label="Returning rate" value={cust.customers ? pct(cust.returning, cust.customers) : "·"} plain />
          </div>
          {cust.customers > 0 && (
            <div className="mt-3 flex h-3 overflow-hidden rounded bg-paper">
              <div className="bg-azulejo" style={{ width: `${(cust.newCustomers / cust.customers) * 100}%` }} />
              <div className="bg-gold" style={{ width: `${(cust.returning / cust.customers) * 100}%` }} />
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Orders from returning customers: {cust.returningOrders} of {cust.orders} · {eur(cust.returningCents)}. A customer is returning when the same email (or phone) already had a paid order on this site. Orders from wine-portugal.com are not included.
          </p>
        </section>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Sessions by source · {PERIODS[period]}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Source</th><th>Sessions</th><th>Added to cart</th><th>Checkouts</th><th>Purchases</th><th>Conversion</th></tr></thead>
            <tbody>
              {f.sources.filter((s) => !adsOnly || s.source.endsWith(" ads")).map((s) => (
                <tr key={s.source} className="border-t">
                  <td className="py-1.5 font-medium">{s.source}</td>
                  <td>{s.sessions}</td>
                  <td>{s.carts}</td>
                  <td>{s.checkouts}</td>
                  <td>{s.purchases}</td>
                  <td>{pct(s.purchases, s.sessions)}</td>
                </tr>
              ))}
              {!f.sources.length && <tr><td colSpan={6} className="py-3 text-muted">No visits yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Pending Multibanco</h2>
        <p className="mt-1 text-2xl font-semibold">{pending.count} orders · {eur(pending.valueCents)}</p>
        <p className="mt-2 text-xs text-muted">Tracking sends, 7 days: {health.map((h) => `${h.sentTo}/${h.status}: ${h.n}`).join(" · ") || "none"}</p>
      </section>
    </div>
  );
}

function Kpi({ label, value, note, plain }: { label: string; value: string; note?: string; plain?: boolean }) {
  return (
    <div className={plain ? "" : "rounded-lg border bg-white p-3"}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="truncate text-xs text-muted">{note}</p>}
    </div>
  );
}
