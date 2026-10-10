// npm run report:daily  -> Postgres side of the daily report (orders, revenue, funnel, cutoff).
// Meta spend/CPA per ad is added by the Claude Code command /report-daily (read-only via the Meta Ads MCP).
import "./load-env";
import { sql as pg } from "../src/db";
import { funnel, pendingMultibanco, periodStats } from "../src/lib/stats";
import { getSettings } from "../src/lib/settings";
import { startOfLisbonDay, lisbonDate } from "../src/lib/time";
import { eur } from "../src/lib/money";

const json = process.argv.includes("--json");
const [yesterdayStart, todayStart] = [startOfLisbonDay(1), startOfLisbonDay(0)];
const [today, week, total, pending, f1, f7, settings] = await Promise.all([
  periodStats(todayStart),
  periodStats(startOfLisbonDay(6)),
  periodStats(null),
  pendingMultibanco(),
  funnel(yesterdayStart),
  funnel(startOfLisbonDay(6)),
  getSettings(),
]);
const daysLeft = Math.ceil((new Date(settings.cutoff_at).getTime() - Date.now()) / 86400000);
const report = { date: lisbonDate(), today, last7: week, total, pendingMultibanco: pending, funnelSinceYesterday: f1, funnel7d: f7, daysLeftToCutoff: daysLeft };

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (label: string, s: typeof today) =>
    `${label.padEnd(10)} ${String(s.orders).padStart(4)} enc. · ${eur(s.revenueCents).padStart(12)} · ticket ${eur(s.aovCents).padStart(10)} · ${["x1", "x2", "x3"].map((k) => `${k}:${s.byBundle[k]?.orders ?? 0}`).join(" ")}`;
  console.log(`\nRELATÓRIO DIÁRIO · ${report.date} (Europe/Lisbon)\n`);
  console.log(line("Hoje", today));
  console.log(line("7 dias", week));
  console.log(line("Total", total));
  console.log(`\nMultibanco pendente: ${pending.count} · ${eur(pending.valueCents)}`);
  console.log(`\nFunil 7 dias: ${f7.map((f) => `${f.name} ${f.count}`).join(" → ")}`);
  const pv = f7[0].count || 1;
  const purchases = f7[f7.length - 1].count;
  console.log(`Conversão 7d (Purchase / PageView): ${((purchases / pv) * 100).toFixed(2)}%`);
  console.log(`\nDias até ao fecho de Natal: ${daysLeft > 0 ? daysLeft : "prazo ultrapassado"}`);
  console.log(`\nMeta (gasto, compras, CPA, ROAS por anúncio): correr /report-daily no Claude Code.\n`);
}
await pg.end();
