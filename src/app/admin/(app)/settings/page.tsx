import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { lisbonDate } from "@/lib/time";
import { settingsAction, ga4TestAction, cttTestAction, ebookAction } from "../../actions";
import { EBOOK_LOCALES } from "@/lib/ebook";
import { ActionForm, Submit } from "../../ui";
import { COUNTRIES, MARKETS } from "@/lib/markets";
import { PER_BOX_FLOOR_CENTS } from "@/lib/settings-defaults";

export default async function SettingsPage() {
  await requireAdmin({ role: "admin" });
  const s = await getSettings();
  const cutoff = new Date(s.cutoff_at);
  const time = cutoff.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>
      <ActionForm action={settingsAction} className="mt-4 space-y-5 rounded-lg border bg-white p-5 text-sm">
        <fieldset>
          <legend className="font-semibold">Christmas delivery cutoff (Lisbon time)</legend>
          <div className="mt-2 flex gap-3">
            <input type="date" name="cutoff_date" defaultValue={lisbonDate(cutoff)} className="rounded border p-2" />
            <input type="time" name="cutoff_time" defaultValue={time} className="rounded border p-2" />
          </div>
        </fieldset>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="sales_open" defaultChecked={s.sales_open} className="h-4 w-4" /> Sales open
        </label>
        <fieldset>
          <legend className="font-semibold">After the cutoff</legend>
          <label className="mt-2 flex items-center gap-2"><input type="radio" name="post_cutoff_mode" value="closed" defaultChecked={s.post_cutoff_mode === "closed"} /> Close orders (shows WhatsApp contact)</label>
          <label className="mt-1 flex items-center gap-2"><input type="radio" name="post_cutoff_mode" value="after_christmas" defaultChecked={s.post_cutoff_mode === "after_christmas"} /> Keep selling with an &quot;Entrega após o Natal&quot; notice</label>
        </fieldset>
        <label className="block font-semibold">Announcement bar, pt-PT (one item per line)
          <textarea name="announcement" rows={4} defaultValue={s.announcement.join("\n")} className="mt-1 w-full rounded border p-2 font-normal" />
        </label>
        <label className="block font-semibold">Delivery text (pt-PT)
          <input name="delivery_text" defaultValue={s.delivery_text} className="mt-1 w-full rounded border p-2 font-normal" />
        </label>
        <fieldset className="rounded border p-3">
          <legend className="px-1 font-semibold">Countries (markets)</legend>
          <p className="text-xs text-muted">
            Portugal ships from the Douro (CTT, MB WAY, Multibanco). Germany, the Netherlands, Belgium and Luxembourg ship from the Belgian warehouse and pay with Stripe (iDEAL and Bancontact must be enabled in the
            Stripe dashboard). Open a country only once excise duty and VAT for it are sorted. Logged-in admins always see every country open, to test.
          </p>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1">Country</th>
                <th>Open</th>
                <th>Delivery days (shown)</th>
                <th>Own cutoff (optional)</th>
              </tr>
            </thead>
            <tbody>
              {COUNTRIES.map((c) => {
                const m = s.markets?.[c] ?? { enabled: false, delivery_days: "", cutoff_at: null };
                return (
                  <tr key={c} className="border-t">
                    <td className="py-1.5 font-semibold">
                      {c} · {MARKETS[c].locales.join("/")}
                    </td>
                    <td>
                      <input type="checkbox" name={`mk_${c}_enabled`} defaultChecked={m.enabled} className="h-4 w-4" />
                    </td>
                    <td>
                      <input name={`mk_${c}_days`} defaultValue={m.delivery_days} placeholder={c === "PT" ? "2 a 4" : "e.g. 2-4"} className="w-24 rounded border p-1.5" />
                    </td>
                    <td>
                      <input type="date" name={`mk_${c}_cutoff`} defaultValue={m.cutoff_at ? lisbonDate(new Date(m.cutoff_at)) : ""} className="rounded border p-1.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">Delivery days are inserted in the copy of that country&apos;s language (&quot;Delivery in 2-4 working days&quot;). Empty: no delivery time is shown. Own cutoff: 23:59 Lisbon time that day; empty = the cutoff above.</p>
        </fieldset>
        <label className="block font-semibold">Stock cap in boxes (optional)
          <input name="stock_cap" type="number" min={0} defaultValue={s.stock_cap_boxes ?? ""} placeholder="no limit" className="mt-1 w-40 rounded border p-2 font-normal" />
          <span className="block text-xs font-normal text-muted">When paid boxes reach this number, the site shows &quot;Esgotado&quot; (sold out).</span>
        </label>
        <label className="block font-semibold">E-book preview pages (bucket keys, one per line)
          <textarea name="ebook_previews" rows={4} defaultValue={(s.ebook_previews ?? []).join("\n")} placeholder="public/ebook/page-1.jpg" className="mt-1 w-full rounded border p-2 font-mono text-xs font-normal" />
          <span className="block text-xs font-normal text-muted">Generated with npm run ebook:previews. Empty: the site shows illustrated cards.</span>
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="recovery_enabled" defaultChecked={s.recovery_enabled} className="h-4 w-4" /> Abandoned-checkout follow-up (20 min message, AI call at 2 h in call hours, final email next day)
        </label>
        <fieldset className="rounded border p-3">
          <legend className="px-1 font-semibold">Exit popup and discount code</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="exit_popup_enabled" defaultChecked={s.exit_popup_enabled} className="h-4 w-4" /> Show exit-intent popup</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <label>Code<input name="lead_code" defaultValue={s.lead_code} className="mt-1 block w-32 rounded border p-2 font-mono uppercase" /></label>
            <label>Discount %<input name="lead_discount_percent" type="number" min={0} max={30} defaultValue={s.lead_discount_percent} className="mt-1 block w-24 rounded border p-2" /></label>
            <label>Valid up to (boxes)<input name="lead_code_max_qty" type="number" min={1} max={10} defaultValue={s.lead_code_max_qty} className="mt-1 block w-24 rounded border p-2" /></label>
            <label>Step-2 code (mobile number: + free shipping)<input name="lead_plus_code" defaultValue={s.lead_plus_code} placeholder="empty = no step 2" className="mt-1 block w-40 rounded border p-2 font-mono uppercase" /></label>
          </div>
          <p className="mt-1 text-xs text-muted">The discount never takes a bundle below the €{(PER_BOX_FLOOR_CENTS / 100).toFixed(2)} per-box floor. Portuguese page only. The code keeps working even if the popup is off.</p>
        </fieldset>
        <fieldset className="rounded border p-3">
          <legend className="px-1 font-semibold">One-time offer (before payment)</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="upsell_enabled" defaultChecked={s.upsell_enabled} className="h-4 w-4" /> Show the one-time offer when the customer clicks Pay</label>
          <p className="mt-1 text-xs text-muted">Main offer (automatic): one more Trilogia box at the next tier price. Extra products shown below it:</p>
          {s.upsell_products.map((p, i) => (
            <div key={p.key} className="mt-2 grid gap-2 rounded border p-2 sm:grid-cols-[1fr_90px_90px_70px]">
              <input type="hidden" name={`up_key_${i}`} value={p.key} />
              <label className="text-xs">Name<input name={`up_name_${i}`} defaultValue={p.name} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
              <label className="text-xs">Price €<input name={`up_price_${i}`} defaultValue={(p.price_cents / 100).toFixed(2).replace(".", ",")} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
              <label className="text-xs">Was €<input name={`up_compare_${i}`} defaultValue={(p.compare_cents / 100).toFixed(2).replace(".", ",")} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
              <label className="flex items-center gap-1 pt-5 text-xs"><input type="checkbox" name={`up_active_${i}`} defaultChecked={p.active} /> Active</label>
              <label className="text-xs sm:col-span-4">Description (pt-PT)<input name={`up_desc_${i}`} defaultValue={p.description} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
              <label className="text-xs sm:col-span-4">Photo URL (https://… or /path; empty = no photo)<input name={`up_image_${i}`} defaultValue={p.image ?? ""} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
            </div>
          ))}
        </fieldset>
        <fieldset className="rounded border p-3">
          <legend className="px-1 font-semibold">Printed gift card (checkout order bump)</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="gc_enabled" defaultChecked={s.gift_card.enabled} className="h-4 w-4" /> Offer the printed card in the checkout (unticked by default, as EU law requires)</label>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <label>Price €<input name="gc_price" defaultValue={(s.gift_card.price_cents / 100).toFixed(2).replace(".", ",")} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
            <label>Cost per card €<input name="gc_cost" defaultValue={(s.gift_card.cost_cents / 100).toFixed(2).replace(".", ",")} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
            <label>VAT %<input name="gc_vat" defaultValue={String(s.gift_card.vat_percent)} className="mt-1 block w-full rounded border p-1.5 text-sm" /></label>
          </div>
          <p className="mt-1 text-xs text-muted">Cards to print: Admin → Gift cards. Cost and VAT feed the profit in Finance.</p>
        </fieldset>
        <label className="block font-semibold">Real customer reviews (one per line: Name | City | Text | Source)
          <textarea name="reviews" rows={4} defaultValue={(s.reviews ?? []).map((r) => [r.name, r.city ?? "", r.text, r.source ?? ""].join(" | ")).join("\n")} placeholder="Ana | Porto | Chegou impecável, a caixa é linda. | Google" className="mt-1 w-full rounded border p-2 font-normal" />
          <span className="block text-xs font-normal text-muted">Only real reviews (EU law). Shown on the checkout page; empty = hidden.</span>
        </label>
        <Submit>Save settings</Submit>
      </ActionForm>

      <section className="mt-6 space-y-3 rounded-lg border bg-white p-5 text-sm">
        <h2 className="font-semibold">Gift e-book (Sabores de Portugal)</h2>
        <p className="text-xs text-muted">One PDF per language. Customers get the edition in their language (confirmation email and thank-you page), and the landing page shows the guide in that language. Portuguese is always offered.</p>
        <ActionForm action={ebookAction} className="flex flex-wrap items-end gap-2">
          <label>Language
            <select name="locale" className="mt-1 block rounded border p-2">
              {EBOOK_LOCALES.map((l) => {
                const f = s.ebook_files?.[l];
                const on = l === "pt" || (s.ebook_locales ?? []).includes(l);
                const file = f ? `${(f.bytes / 1048576).toFixed(1)} MB, ${new Date(f.uploaded_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })}` : l === "pt" ? "original" : "no PDF";
                return <option key={l} value={l}>{`${l.toUpperCase()} · ${file} · ${on ? "offered" : "off"}`}</option>;
              })}
            </select>
          </label>
          <label>PDF (for upload)<input type="file" name="file" accept="application/pdf" className="mt-1 block text-xs" /></label>
          <Submit name="action" value="upload">Upload</Submit>
          <Submit name="action" value="on" className="!bg-white !text-night border">Offer</Submit>
          <Submit name="action" value="off" className="!bg-white !text-night border">Turn off</Submit>
        </ActionForm>
      </section>
      <ActionForm action={cttTestAction} className="mt-6 space-y-3 rounded-lg border bg-white p-5 text-sm">
        <h2 className="font-semibold">CTT: test the API connection</h2>
        <p className="text-muted">
          Asks CTT for a token and reads the account settings and carriers. Nothing is created at CTT.
          Uses CTT_APP_ID, CTT_PUBLIC_KEY and CTT_SECRET_KEY from Railway; to try another application id without changing Railway, type it below.
        </p>
        <label className="block">
          <span className="text-xs font-semibold">Application id to test (optional)</span>
          <input name="app_id" placeholder="empty = CTT_APP_ID" className="mt-1 w-full max-w-xs rounded border p-2" />
        </label>
        <Submit>Test CTT connection</Submit>
      </ActionForm>

      <ActionForm action={ga4TestAction} className="mt-6 space-y-3 rounded-lg border bg-white p-5 text-sm">
        <h2 className="font-semibold">Google Analytics: server connection</h2>
        <p className="text-muted">
          Purchases reach GA4 from the server (Measurement Protocol). This sends one test event, <code>server_check</code>, the same way.
          GA4 accepts any secret silently, so the check is seeing it in GA4 → Admin → DebugView.
        </p>
        <Submit>Send test event</Submit>
      </ActionForm>
    </div>
  );
}
