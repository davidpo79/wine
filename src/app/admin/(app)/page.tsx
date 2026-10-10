import { eur } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { funnel, pendingMultibanco, periodStats, trackingHealth, upsellStats } from "@/lib/stats";
import { startOfLisbonDay } from "@/lib/time";

export default async function Dashboard() {
  const [today, week, total, pending, f7, fAll, settings, health, ups] = await Promise.all([
    periodStats(startOfLisbonDay(0)),
    periodStats(startOfLisbonDay(6)),
    periodStats(null),
    pendingMultibanco(),
    funnel(startOfLisbonDay(6)),
    funnel(null),
    getSettings(),
    trackingHealth(startOfLisbonDay(6)),
    upsellStats(),
  ]);
  const daysLeft = Math.ceil((new Date(settings.cutoff_at).getTime() - Date.now()) / 86400000);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted">
          {daysLeft > 0 ? `${daysLeft} days left until the cutoff` : "Christmas cutoff has passed"} · Sales {settings.sales_open ? "open" : "closed"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[["Today", today], ["Last 7 days", week], ["All time", total]].map(([label, s]) => {
          const st = s as Awaited<ReturnType<typeof periodStats>>;
          return (
            <section key={label as string} className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{label as string}</h2>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="Orders" value={String(st.orders)} />
                <Stat label="Revenue" value={eur(st.revenueCents)} />
                <Stat label="AOV" value={eur(st.aovCents)} />
              </dl>
              <ul className="mt-3 space-y-0.5 text-sm">
                {["x1", "x2", "x3"].map((k) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-muted">{k}</span>
                    <span>{st.byBundle[k]?.orders ?? 0} · {eur(st.byBundle[k]?.revenueCents ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Post-purchase upsells (all time)</h2>
        <p className="mt-1 text-2xl font-semibold">{ups.count} add-ons · {eur(ups.valueCents)}</p>
        <p className="text-xs text-muted">{total.orders ? `${Math.round((ups.ordersAccepted / total.orders) * 100)}% of paid orders accepted an offer` : ""}</p>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Pending Multibanco</h2>
        <p className="mt-1 text-2xl font-semibold">{pending.count} orders · {eur(pending.valueCents)}</p>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Funnel (unique events, anonymous count)</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1">Event</th><th>7 days</th><th>% of previous</th><th>All time</th></tr></thead>
          <tbody>
            {f7.map((r, i) => (
              <tr key={r.name} className="border-t">
                <td className="py-1.5 font-medium">{r.name}</td>
                <td>{r.count}</td>
                <td className="text-muted">{i > 0 && f7[i - 1].count ? `${Math.round((r.count / f7[i - 1].count) * 100)}%` : ""}</td>
                <td>{fAll[i].count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Sends, 7 days: {health.map((h) => `${h.sentTo}/${h.status}: ${h.n}`).join(" · ") || "none"}
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
