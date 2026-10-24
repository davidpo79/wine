import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PERIODS, type Period } from "@/lib/analytics";
import { breakdown, FUNNEL_STEPS, fieldStats, funnelOf, journeySessions, reached, topEvents, type SessionRow } from "@/lib/journey-stats";
import { JOURNEY_RETENTION_DAYS } from "@/lib/journey";
import { startOfLisbonDay } from "@/lib/time";

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0)}%` : "·");
const dur = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const FIELD_LABEL: Record<string, string> = {
  email: "Email",
  tel: "Mobile",
  "given-name": "First name",
  "family-name": "Surname",
  "address-line1": "Address",
  "address-line2": "Address line 2",
  "postal-code": "Postal code",
  city: "City",
  nif: "NIF",
  country: "Country",
};
type Sp = { p?: string; src?: string; dev?: string; cc?: string; ads?: string; v?: string };
const VIEWS = { all: "All visits", checkout: "Reached checkout, no purchase", purchased: "Purchased", problems: "Errors or rage clicks" } as const;

function furthest(s: SessionRow) {
  return [...FUNNEL_STEPS].reverse().find((st) => reached(s, st.key))!;
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdmin({ role: "admin" });
  const sp = await searchParams;
  const period: Period = sp.p && sp.p in PERIODS ? (sp.p as Period) : "7d";
  const since = period === "today" ? startOfLisbonDay(0) : period === "7d" ? startOfLisbonDay(6) : period === "30d" ? startOfLisbonDay(29) : null;
  const filter = { since, source: sp.src, device: sp.dev, country: sp.cc, adsOnly: sp.ads === "1" };
  const sessions = await journeySessions(filter);
  const [fields, top] = await Promise.all([fieldStats(sessions, since), topEvents(sessions, since)]);
  const steps = funnelOf(sessions);
  const visits = sessions.length;
  const view = (sp.v && sp.v in VIEWS ? sp.v : "all") as keyof typeof VIEWS;
  const listed = sessions
    .filter((s) => (view === "checkout" ? s.checkout && !s.purchased : view === "purchased" ? s.purchased : view === "problems" ? s.rage > 0 || s.jsErrors > 0 || s.paymentError : true))
    .slice(0, 150);
  const clarity = process.env.CLARITY_PROJECT_ID;

  const href = (patch: Partial<Sp>) => {
    const q = new URLSearchParams();
    const next = { ...sp, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/funnel${s ? `?${s}` : ""}`;
  };
  const active = [sp.src && `source: ${sp.src}`, sp.dev && `device: ${sp.dev}`, sp.cc && `country: ${sp.cc}`, sp.ads === "1" && "from ads"].filter(Boolean);
  const sectionReach = top.sections;
  const scrollMarks = [25, 50, 75, 100].map((m) => ({ m, n: sessions.filter((s) => s.maxScroll >= m).length }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Funnel &amp; visits</h1>
        <p className="text-sm text-muted">
          Every step of every visit, anonymous. Kept {JOURNEY_RETENTION_DAYS} days.{" "}
          {clarity ? (
            <a className="underline" href={`https://clarity.microsoft.com/projects/view/${encodeURIComponent(clarity)}/impressions`} target="_blank" rel="noreferrer">Recordings &amp; heatmaps in Clarity ↗</a>
          ) : (
            <span>Clarity not connected (CLARITY_PROJECT_ID).</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded-lg border bg-white">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={href({ p })} className={`px-3 py-1.5 ${p === period ? "bg-night text-paper" : "hover:bg-paper"}`}>{PERIODS[p]}</Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border bg-white">
          <Link href={href({ ads: undefined })} className={`px-3 py-1.5 ${sp.ads !== "1" ? "bg-night text-paper" : "hover:bg-paper"}`}>All traffic</Link>
          <Link href={href({ ads: "1" })} className={`px-3 py-1.5 ${sp.ads === "1" ? "bg-night text-paper" : "hover:bg-paper"}`}>From ads</Link>
        </div>
        {active.length > 0 && (
          <span className="rounded-full bg-paper px-3 py-1 text-xs">
            {active.join(" · ")} · <Link className="underline" href={href({ src: undefined, dev: undefined, cc: undefined, ads: undefined })}>clear</Link>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Visits" value={String(visits)} />
        <Kpi label="Reached checkout" value={pct(steps[3].count, visits)} note={`${steps[3].count} visits`} />
        <Kpi label="Checkout → paid" value={pct(steps[9].count, steps[3].count)} note={`${steps[9].count} purchases`} />
        <Kpi label="Visit → paid" value={pct(steps[9].count, visits)} />
        <Kpi label="Median time on site" value={dur(median(sessions.map((s) => s.activeMs)))} note="while the tab was visible" />
        <Kpi label="Visits with problems" value={String(sessions.filter((s) => s.rage || s.jsErrors || s.paymentError).length)} note="rage clicks, JS or payment errors" />
      </div>

      <section className="min-w-0 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Step by step · {PERIODS[period]}</h2>
          <p className="text-xs text-muted">% of visits · % of the previous step · visits lost at this step</p>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => {
            const prev = i ? steps[i - 1].count : 0;
            const lost = i ? prev - s.count : 0;
            return (
              <li key={s.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="hidden truncate text-xs text-muted sm:block">{s.hint}</p>
                </div>
                <div className="h-7 rounded bg-paper">
                  <div className={`h-7 rounded ${s.key === "purchased" ? "bg-green-700" : "bg-azulejo"}`} style={{ width: `${visits ? Math.max(0.5, Math.min(100, (s.count / visits) * 100)) : 0}%` }} />
                </div>
                <div className="text-right text-sm">
                  <span className="font-semibold">{s.count}</span> <span className="text-muted">{i ? pct(s.count, visits) : ""}</span>
                  {i > 0 && prev > 0 && (
                    <p className="text-xs text-muted">
                      {pct(s.count, prev)} of prev.{lost > 0 && <span className="text-xmas"> · −{lost}</span>}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">A visit is one browser tab. A visit that resumed its checkout from a recovery link counts as having passed the earlier steps. Data starts when this screen was released (17/10/2026).</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {(
          [
            ["source", "By source", "src"],
            ["device", "By device", "dev"],
            ["browser", "By browser / app", null],
            ["country", "By country (IP)", "cc"],
          ] as const
        ).map(([dim, title, param]) => (
          <section key={dim} className="min-w-0 rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1"></th><th>Visits</th><th>Saw offers</th><th>Checkout</th><th>Pagar</th><th>Paid</th><th>Conv.</th></tr></thead>
                <tbody>
                  {breakdown(sessions, dim).slice(0, 12).map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="py-1.5 font-medium">{param ? <Link className="hover:underline" href={href({ [param]: r.key })}>{r.key}</Link> : r.key}</td>
                      <td>{r.sessions}</td>
                      <td>{pct(r.sawOffers, r.sessions)}</td>
                      <td>{r.checkout}</td>
                      <td>{r.payClick}</td>
                      <td>{r.purchased}</td>
                      <td>{pct(r.purchased, r.sessions)}</td>
                    </tr>
                  ))}
                  {!visits && <tr><td colSpan={7} className="py-3 text-muted">No visits yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="min-w-0 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Checkout fields</h2>
        <p className="mt-1 text-xs text-muted">Visits that reached the checkout. “Left here” = the last field touched by visits that did not pay: where people give up.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Field</th><th>Clicked into</th><th>Filled</th><th>Error shown</th><th>Left here</th></tr></thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.field} className="border-t">
                  <td className="py-1.5 font-medium">{FIELD_LABEL[f.field] ?? f.field}</td>
                  <td>{f.focused}</td>
                  <td>{f.filled ? `${f.filled} (${pct(f.filled, f.focused)})` : "·"}</td>
                  <td className={f.errors ? "text-xmas" : ""}>{f.errors || "·"}</td>
                  <td className={f.abandoned ? "font-semibold text-xmas" : ""}>{f.abandoned || "·"}</td>
                </tr>
              ))}
              {!fields.length && <tr><td colSpan={5} className="py-3 text-muted">No checkout visits yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="min-w-0 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Landing: how far people read</h2>
          <div className="mt-3 space-y-1.5 text-sm">
            {scrollMarks.map((s) => (
              <Bar key={s.m} label={`Scrolled ${s.m}%`} n={s.n} of={visits} />
            ))}
          </div>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Sections seen</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            {sectionReach.map((s) => (
              <Bar key={s.key} label={s.key} n={s.sessions} of={visits} />
            ))}
          </div>
        </section>
        <section className="min-w-0 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Most clicked</h2>
          <Top rows={top.clicks.filter((r) => !r.key.endsWith(" · checkout_cta"))} />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="min-w-0 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Validation errors shown</h2>
          <Top rows={top.errors} empty="None." />
          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted">Payment errors</h2>
          <Top rows={top.payment} empty="None." />
        </section>
        <section className="min-w-0 rounded-lg border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Rage clicks</h2>
          <p className="text-xs text-muted">3+ clicks on the same place within a second: usually something that looks clickable and is not, or a slow button.</p>
          <Top rows={top.rage} empty="None." />
          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted">JavaScript errors</h2>
          <Top rows={top.js} empty="None." />
          {top.jsNoise.length > 0 && (
            <>
              <h2 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted">In-app browser noise (ignored)</h2>
              <p className="text-xs text-muted">Thrown by the Facebook / Instagram app&apos;s own browser code, not by the site; the visitor sees nothing. Not counted as visits with problems.</p>
              <Top rows={top.jsNoise} empty="None." />
            </>
          )}
        </section>
      </div>

      <section className="min-w-0 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Visits</h2>
          <div className="flex flex-wrap gap-1 text-xs">
            {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
              <Link key={v} href={href({ v: v === "all" ? undefined : v })} className={`rounded-full border px-2.5 py-1 ${v === view ? "bg-night text-paper" : "bg-white hover:bg-paper"}`}>{VIEWS[v]}</Link>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Started</th><th>Source</th><th>Device</th><th>Country</th><th>Pages</th><th>Time</th><th>Scroll</th><th>Furthest step</th><th>Order</th><th></th></tr></thead>
            <tbody>
              {listed.map((s) => {
                const st = furthest(s);
                return (
                  <tr key={s.sessionId} className="border-t">
                    <td className="py-1.5 whitespace-nowrap">{s.firstAt.toLocaleString("en-GB", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{s.source}</td>
                    <td>{s.device} · {s.browser}</td>
                    <td>{s.country}</td>
                    <td>{s.pages}</td>
                    <td>{dur(s.activeMs)}</td>
                    <td>{s.maxScroll}%</td>
                    <td className={s.purchased ? "font-semibold text-green-700" : ""}>
                      {st.label}
                      {(s.rage > 0 || s.jsErrors > 0 || s.paymentError) && <span className="ml-1 text-xmas" title="rage clicks, JS or payment errors">⚠</span>}
                    </td>
                    <td>{s.orderId ? <Link className="underline" href={`/admin/orders/${encodeURIComponent(s.orderId)}`}>{s.orderId}</Link> : ""}</td>
                    <td><Link className="text-azulejo underline" href={`/admin/funnel/${encodeURIComponent(s.sessionId)}`}>Journey</Link></td>
                  </tr>
                );
              })}
              {!listed.length && <tr><td colSpan={10} className="py-3 text-muted">No visits.</td></tr>}
            </tbody>
          </table>
        </div>
        {listed.length === 150 && <p className="mt-2 text-xs text-muted">Showing the latest 150.</p>}
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="truncate text-xs text-muted">{note}</p>}
    </div>
  );
}

function Bar({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5rem] items-center gap-2">
      <span className="truncate">{label}</span>
      <div className="h-4 rounded bg-paper">
        <div className="h-4 rounded bg-azulejo" style={{ width: `${of ? Math.min(100, (n / of) * 100) : 0}%` }} />
      </div>
      <span className="text-right text-xs text-muted">{n} · {pct(n, of)}</span>
    </div>
  );
}

function Top({ rows, empty = "No data yet." }: { rows: { key: string; n: number; sessions: number }[]; empty?: string }) {
  if (!rows.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <table className="mt-2 w-full text-sm">
      <thead><tr className="text-left text-xs text-muted"><th className="py-1"></th><th className="w-16">Times</th><th className="w-16">Visits</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t">
            <td className="max-w-0 truncate py-1.5" title={r.key}>{r.key}</td>
            <td>{r.n}</td>
            <td>{r.sessions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
