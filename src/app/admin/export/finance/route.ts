import { getAdmin } from "@/lib/auth";
import { euros, toCsv } from "@/lib/csv";
import { getSettings } from "@/lib/settings";
import { dailyPnl, lisbonDay } from "@/lib/profit";

// Daily P&L as CSV (same numbers as Admin → Finance).
export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = ok(sp.get("to")) ?? lisbonDay(new Date());
  const from = ok(sp.get("from")) ?? to;
  const { days, total } = await dailyPnl(from, to, await getSettings());
  const row = (d: string, r: typeof total) => [d, r.orders, r.boxes, euros(r.paid), euros(r.vat), euros(r.net), euros(r.product), euros(r.shipping), euros(r.fees), euros(r.other), euros(r.before_ads), euros(r.ads), euros(r.expenses), euros(r.profit)];
  const csv = toCsv(
    ["dia", "encomendas", "caixas", "receita_iva_incl", "iva", "receita_liquida", "vinho_e_caixas", "envio", "comissoes_pagamento", "outros", "lucro_antes_publicidade", "publicidade", "outras_despesas", "lucro_liquido"],
    [...[...days].reverse().map((r) => row(r.day, r)), row("TOTAL", total)],
  );
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lucro-${from}-${to}.csv"` } });
}
