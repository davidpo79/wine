import { eur } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { funnel, pendingMultibanco, periodStats, trackingHealth } from "@/lib/stats";
import { startOfLisbonDay } from "@/lib/time";

export default async function Dashboard() {
  const [today, week, total, pending, f7, fAll, settings, health] = await Promise.all([
    periodStats(startOfLisbonDay(0)),
    periodStats(startOfLisbonDay(6)),
    periodStats(null),
    pendingMultibanco(),
    funnel(startOfLisbonDay(6)),
    funnel(null),
    getSettings(),
    trackingHealth(startOfLisbonDay(6)),
  ]);
  const daysLeft = Math.ceil((new Date(settings.cutoff_at).getTime() - Date.now()) / 86400000);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Painel</h1>
        <p className="text-sm text-muted">
          {daysLeft > 0 ? `Faltam ${daysLeft} dias para o fecho (30/11)` : "Prazo de Natal ultrapassado"} · Vendas {settings.sales_open ? "abertas" : "fechadas"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[["Hoje", today], ["Últimos 7 dias", week], ["Total", total]].map(([label, s]) => {
          const st = s as Awaited<ReturnType<typeof periodStats>>;
          return (
            <section key={label as string} className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{label as string}</h2>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="Encomendas" value={String(st.orders)} />
                <Stat label="Receita" value={eur(st.revenueCents)} />
                <Stat label="Ticket médio" value={eur(st.aovCents)} />
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Multibanco pendente</h2>
        <p className="mt-1 text-2xl font-semibold">{pending.count} encomendas · {eur(pending.valueCents)}</p>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Funil (eventos únicos, contagem anónima)</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1">Evento</th><th>7 dias</th><th>% do anterior</th><th>Total</th></tr></thead>
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
          Envios 7 dias: {health.map((h) => `${h.sentTo}/${h.status}: ${h.n}`).join(" · ") || "nenhum"}
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
