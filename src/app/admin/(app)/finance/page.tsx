import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { eur } from "@/lib/money";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { computeOrderCosts, dailyPnl, isAdCategory, lisbonDay } from "@/lib/profit";
import { costModelAction, expenseAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

export const dynamic = "force-dynamic";

const AD_PLATFORMS = [
  ["ads_meta", "Meta (Facebook / Instagram)"],
  ["ads_google", "Google"],
  ["ads_tiktok", "TikTok"],
  ["ads_influencers", "Influencers / partnerships"],
  ["ads_other", "Other advertising"],
] as const;
const CATEGORIES = [
  ...AD_PLATFORMS,
  ["agency", "Agency / freelancers"],
  ["creative", "Photos / creative"],
  ["packaging", "Packaging (bulk)"],
  ["tools", "Tools / software"],
  ["telecom", "SMS / WhatsApp / calls"],
  ["other", "Other"],
] as const;
const catLabel = (k: string) => CATEGORIES.find(([c]) => c === k)?.[1] ?? k;
const OTHER_CATEGORIES = CATEGORIES.filter(([k]) => !isAdCategory(k));
const toInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function Finance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = lisbonDay(new Date());
  const d14 = new Date();
  d14.setDate(d14.getDate() - 13);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : lisbonDay(d14);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const [settings, catalog] = await Promise.all([getSettings(), getCatalog()]);
  const { days, total, adsByPlatform } = await dailyPnl(from, to, settings);
  const allExpenses = await db.select().from(schema.expenses).orderBy(desc(schema.expenses.date)).limit(300);
  const adEntries = allExpenses.filter((e) => isAdCategory(e.category));
  const otherEntries = allExpenses.filter((e) => !isAdCategory(e.category));
  const roas = total.ads ? total.paid / total.ads : null;
  const cpa = total.ads && total.orders ? Math.round(total.ads / total.orders) : null;
  // Break-even: the most an order can cost in ads before it stops making money (average profit per order before ads).
  const breakEvenCpa = total.orders ? Math.round(total.before_ads / total.orders) : null;
  const breakEvenRoas = total.before_ads > 0 ? total.paid / total.before_ads : null;
  const m = settings.cost_model;
  const margin = total.paid ? Math.round((total.profit / total.net) * 100) : 0;
  const examples = (catalog?.bundles ?? []).map((b) => ({ b, c: computeOrderCosts({ totalCents: b.priceCents + b.shippingCents, qtyBoxes: b.qty, paymentMethodType: "card" }, [], settings) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Finance · profit & loss</h1>
          <p className="text-sm text-muted">Paid orders by payment day (Lisbon). Revenue includes VAT; costs exclude recoverable VAT. Refunded orders are excluded.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label>From<br /><input type="date" name="from" defaultValue={from} className="rounded border p-1.5" /></label>
          <label>To<br /><input type="date" name="to" defaultValue={to} className="rounded border p-1.5" /></label>
          <button className="rounded bg-night px-4 py-2 font-semibold text-white">Show</button>
          <a href={`/admin/export/finance?from=${from}&to=${to}`} className="rounded border bg-white px-3 py-2 font-medium hover:bg-paper">CSV</a>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          ["Revenue (incl. VAT)", eur(total.paid), `${total.orders} orders · ${total.boxes} boxes`],
          ["Order costs", eur(total.vat + total.product + total.shipping + total.fees + total.other), `VAT ${eur(total.vat)} · product ${eur(total.product)} · shipping ${eur(total.shipping)} · fees ${eur(total.fees)}`],
          ["Profit before ads", eur(total.before_ads), total.orders ? `${eur(Math.round(total.before_ads / total.orders))} per order` : "·"],
          ["Ad spend", eur(total.ads), roas != null ? `ROAS ${roas.toFixed(2)} · ${cpa != null ? `${eur(cpa)} per order` : "no orders"}` : "no ad spend entered"],
          ["Other expenses", eur(total.expenses), "agency, photos, tools…"],
          ["Net profit", eur(total.profit), `${margin}% of net revenue`],
        ].map(([k, v, sub], i) => (
          <div key={k} className={`rounded-lg border p-4 ${i === 5 ? (total.profit >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50") : i === 3 ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
            <p className="text-xs uppercase tracking-wider text-muted">{k}</p>
            <p className={`mt-1 text-2xl font-bold ${i === 5 ? (total.profit >= 0 ? "text-green-800" : "text-red-700") : ""}`}>{v}</p>
            <p className="mt-1 text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>

      <section className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-paper text-right text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="p-2 text-left">Day</th><th>Orders</th><th>Boxes</th><th>Revenue</th><th>VAT</th><th>Wine + boxes</th><th>Shipping</th><th>Payment fees</th><th>Other</th><th>Before ads</th><th>Ads</th><th>ROAS</th><th>Ads / order</th><th>Expenses</th><th className="pr-3">Net profit</th>
            </tr>
          </thead>
          <tbody className="text-right tabular-nums">
            {days.map((r) => (
              <tr key={r.day} className={`border-t ${r.day === today ? "bg-azulejo-soft/40" : ""}`}>
                <td className="p-2 text-left font-medium">{new Date(`${r.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</td>
                <td>{r.orders || "·"}</td>
                <td>{r.boxes || "·"}</td>
                <td>{r.paid ? eur(r.paid) : "·"}</td>
                <td className="text-muted">{r.vat ? eur(r.vat) : "·"}</td>
                <td className="text-muted">{r.product ? eur(r.product) : "·"}</td>
                <td className="text-muted">{r.shipping ? eur(r.shipping) : "·"}</td>
                <td className="text-muted">{r.fees ? eur(r.fees) : "·"}</td>
                <td className="text-muted">{r.other ? eur(r.other) : "·"}</td>
                <td>{r.before_ads ? eur(r.before_ads) : "·"}</td>
                <td className="text-amber-800">{r.ads ? eur(r.ads) : "·"}</td>
                <td className="text-muted">{r.ads && r.paid ? (r.paid / r.ads).toFixed(2) : "·"}</td>
                <td className={breakEvenCpa != null && r.ads && r.orders && r.ads / r.orders > breakEvenCpa ? "text-red-700" : "text-muted"}>{r.ads && r.orders ? eur(Math.round(r.ads / r.orders)) : r.ads ? "no orders" : "·"}</td>
                <td className="text-muted">{r.expenses ? eur(r.expenses) : "·"}</td>
                <td className={`pr-3 font-semibold ${r.profit < 0 ? "text-red-700" : r.profit > 0 ? "text-green-800" : "text-muted"}`}>{r.profit || r.expenses ? eur(r.profit) : "·"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-paper text-right font-bold tabular-nums">
            <tr>
              <td className="p-2 text-left">Total</td><td>{total.orders}</td><td>{total.boxes}</td><td>{eur(total.paid)}</td><td>{eur(total.vat)}</td><td>{eur(total.product)}</td><td>{eur(total.shipping)}</td><td>{eur(total.fees)}</td><td>{eur(total.other)}</td><td>{eur(total.before_ads)}</td><td>{eur(total.ads)}</td><td>{roas != null ? roas.toFixed(2) : "·"}</td><td>{cpa != null ? eur(cpa) : "·"}</td><td>{eur(total.expenses)}</td>
              <td className={`pr-3 ${total.profit < 0 ? "text-red-700" : "text-green-800"}`}>{eur(total.profit)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="rounded-lg border border-amber-300 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Advertising</h2>
          <p className="text-xs text-muted">Enter the spend from each ads manager (without VAT). A campaign over several days can be entered once with an end date; it is spread per day.</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Spend in period", eur(total.ads)],
            ["ROAS (revenue ÷ spend)", roas != null ? roas.toFixed(2) : "·"],
            ["Ad cost per order", cpa != null ? eur(cpa) : "·"],
            ["Break-even per order", breakEvenCpa != null ? `${eur(breakEvenCpa)}${breakEvenRoas ? ` · ROAS ${breakEvenRoas.toFixed(2)}` : ""}` : "·"],
          ].map(([k, v]) => (
            <div key={k} className="rounded border bg-paper/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted">{k}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Break-even = average profit per order before ads in this period: if ads cost more than this per order, each order loses money. Above the break-even ROAS the campaign is profitable.</p>
        {adsByPlatform.length > 0 && (
          <p className="mt-2 text-sm">{adsByPlatform.map((a) => `${catLabel(a.category)}: ${eur(a.cents)}`).join(" · ")}</p>
        )}
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <ActionForm action={expenseAction} className="grid content-start gap-2 text-sm sm:grid-cols-2">
            <label>Platform
              <select name="category" className="mt-1 block w-full rounded border p-1.5">
                {AD_PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label>Spend €<input name="amount" required inputMode="decimal" placeholder="45,00" className="mt-1 block w-full rounded border p-1.5" /></label>
            <label>Date<input type="date" name="date" required defaultValue={today} className="mt-1 block w-full rounded border p-1.5" /></label>
            <label>Until (optional)<input type="date" name="end_date" className="mt-1 block w-full rounded border p-1.5" /></label>
            <label className="sm:col-span-2">Campaign<input name="description" maxLength={200} placeholder="e.g. Natal · Advantage+ · Lisboa" className="mt-1 block w-full rounded border p-1.5" /></label>
            <div className="sm:col-span-2"><Submit>Add ad spend</Submit></div>
          </ActionForm>
          <table className="w-full self-start text-sm">
            <tbody>
              {adEntries.slice(0, 60).map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="py-1.5 text-xs">{e.date}{e.endDate ? ` → ${e.endDate}` : ""}</td>
                  <td className="text-xs">{catLabel(e.category)}<br /><span className="text-muted">{e.description}</span></td>
                  <td className="text-right font-semibold">{eur(e.amountCents)}</td>
                  <td className="w-16 text-right">
                    <ActionForm action={expenseAction} confirm="Delete this ad spend?">
                      <input type="hidden" name="id" value={e.id} />
                      <button name="action" value="delete" className="text-xs text-red-700 underline">delete</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
              {adEntries.length === 0 && <tr><td className="py-3 text-center text-muted">No ad spend yet. Campaigns are still paused, so this stays empty until they run.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Other expenses</h2>
          <p className="text-xs text-muted">Anything not tied to one order and not advertising: agency, photos, tools, bulk packaging. Give an end date to spread an amount over several days (e.g. a monthly tool or a weekly ad budget). Amounts without recoverable VAT.</p>
          <ActionForm action={expenseAction} className="mt-3 grid gap-2 text-sm sm:grid-cols-[130px_130px_1fr]">
            <label>Date<input type="date" name="date" required defaultValue={today} className="mt-1 block w-full rounded border p-1.5" /></label>
            <label>Until (optional)<input type="date" name="end_date" className="mt-1 block w-full rounded border p-1.5" /></label>
            <label>Category
              <select name="category" className="mt-1 block w-full rounded border p-1.5">
                {OTHER_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2">Description<input name="description" maxLength={200} placeholder="e.g. Product photos" className="mt-1 block w-full rounded border p-1.5" /></label>
            <label>Amount €<input name="amount" required inputMode="decimal" placeholder="120,00" className="mt-1 block w-full rounded border p-1.5" /></label>
            <div className="sm:col-span-3"><Submit>Add expense</Submit></div>
          </ActionForm>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {otherEntries.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="py-1.5 text-xs">{e.date}{e.endDate ? ` → ${e.endDate}` : ""}</td>
                  <td className="text-xs">{catLabel(e.category)}<br /><span className="text-muted">{e.description}</span></td>
                  <td className="text-right font-semibold">{eur(e.amountCents)}</td>
                  <td className="w-16 text-right">
                    <ActionForm action={expenseAction} confirm="Delete this expense?">
                      <input type="hidden" name="id" value={e.id} />
                      <button name="action" value="delete" className="text-xs text-red-700 underline">delete</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
              {otherEntries.length === 0 && <tr><td className="py-3 text-center text-muted">No expenses yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Costs per order</h2>
          <p className="text-xs text-muted">Used for every paid order (snapshot at payment). Without recoverable VAT.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs uppercase text-muted"><tr><th className="text-left">Offer</th><th>Customer pays</th><th>VAT</th><th>Costs</th><th>Profit</th></tr></thead>
              <tbody className="text-right tabular-nums">
                {examples.map(({ b, c }) => (
                  <tr key={b.key} className="border-t">
                    <td className="py-1 text-left">{b.qty} box{b.qty > 1 ? "es" : ""} ({b.qty * 3} bottles)</td>
                    <td>{eur(c.paid)}</td><td>{eur(c.vat)}</td><td>{eur(c.costs)}</td><td className="font-semibold text-green-800">{eur(c.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionForm action={costModelAction} className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label>VAT in price %<input name="vat_percent" defaultValue={String(m.vat_percent).replace(".", ",")} className="mt-1 block w-full rounded border p-1.5" /></label>
              <label>3 wines (per box) €<input name="wine_per_box" defaultValue={toInput(m.wine_per_box_cents)} className="mt-1 block w-full rounded border p-1.5" /></label>
              <label>Gift box (per box) €<input name="gift_box" defaultValue={toInput(m.gift_box_cents)} className="mt-1 block w-full rounded border p-1.5" /></label>
              <label>Shipping carton (per parcel) €<input name="shipping_box" defaultValue={toInput(m.shipping_box_cents)} className="mt-1 block w-full rounded border p-1.5" /></label>
              <label>Other per order €<input name="other_per_order" defaultValue={toInput(m.other_per_order_cents)} className="mt-1 block w-full rounded border p-1.5" /></label>
            </div>
            <fieldset className="rounded border p-2">
              <legend className="px-1 text-xs font-semibold">Delivery (CTT) by boxes per parcel. Above the last row a new parcel starts.</legend>
              {Array.from({ length: Math.max(m.delivery_tiers.length + 1, 3) }).map((_, i) => (
                <div key={i} className="mt-1 grid grid-cols-2 gap-2">
                  <label className="text-xs">Up to boxes<input name={`tier_max_${i}`} type="number" min={1} defaultValue={m.delivery_tiers[i]?.max_boxes ?? ""} className="mt-0.5 block w-full rounded border p-1.5" /></label>
                  <label className="text-xs">Cost €<input name={`tier_cost_${i}`} defaultValue={m.delivery_tiers[i] ? toInput(m.delivery_tiers[i].cents) : ""} className="mt-0.5 block w-full rounded border p-1.5" /></label>
                </div>
              ))}
            </fieldset>
            <fieldset className="rounded border p-2">
              <legend className="px-1 text-xs font-semibold">Payment fees (% of what the customer pays + fixed per charge)</legend>
              {(["card", "mb_way", "multibanco", "other"] as const).map((k) => (
                <div key={k} className="mt-1 grid grid-cols-[110px_1fr_1fr] items-end gap-2">
                  <span className="pb-2 text-xs font-medium">{k === "card" ? "Card / wallets" : k === "mb_way" ? "MB WAY" : k === "multibanco" ? "Multibanco" : "Other"}</span>
                  <label className="text-xs">%<input name={`fee_pct_${k}`} defaultValue={String(m.payment_fees[k].percent).replace(".", ",")} className="mt-0.5 block w-full rounded border p-1.5" /></label>
                  <label className="text-xs">Fixed €<input name={`fee_fixed_${k}`} defaultValue={toInput(m.payment_fees[k].fixed_cents)} className="mt-0.5 block w-full rounded border p-1.5" /></label>
                </div>
              ))}
              <p className="mt-2 text-xs text-muted">List prices for reference: Stripe card 1,5% + 0,25 €; ifthenpay MB WAY 0,7% + 0,07 €, Multibanco 1,5% + 0,20 € (+ VAT). Check your contracts.</p>
            </fieldset>
            {settings.upsell_products.length > 0 && (
              <fieldset className="rounded border p-2">
                <legend className="px-1 text-xs font-semibold">Cost of upsell products (per unit)</legend>
                {settings.upsell_products.map((p) => (
                  <label key={p.key} className="mt-1 grid grid-cols-[1fr_110px] items-center gap-2 text-xs">
                    <span>{p.name} <span className="text-muted">(sells at {eur(p.price_cents)})</span></span>
                    <input name={`product_cost_${p.key}`} defaultValue={toInput(p.cost_cents ?? 0)} className="rounded border p-1.5" />
                  </label>
                ))}
                {settings.upsell_products.some((p) => !p.cost_cents) && <p className="mt-1 text-xs text-amber-700">Set the cost of each product, otherwise its profit is overstated.</p>}
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="apply_past" className="h-4 w-4" /> Also recalculate past paid orders with these costs</label>
            <Submit>Save costs</Submit>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
