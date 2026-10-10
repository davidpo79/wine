import { getSettings } from "@/lib/settings";
import { lisbonDate } from "@/lib/time";
import { settingsAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

export default async function SettingsPage() {
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
        <label className="block font-semibold">Stock cap in boxes (optional)
          <input name="stock_cap" type="number" min={0} defaultValue={s.stock_cap_boxes ?? ""} placeholder="no limit" className="mt-1 w-40 rounded border p-2 font-normal" />
          <span className="block text-xs font-normal text-muted">When paid boxes reach this number, the site shows &quot;Esgotado&quot; (sold out).</span>
        </label>
        <label className="block font-semibold">E-book preview pages (bucket keys, one per line)
          <textarea name="ebook_previews" rows={4} defaultValue={(s.ebook_previews ?? []).join("\n")} placeholder="public/ebook/page-1.jpg" className="mt-1 w-full rounded border p-2 font-mono text-xs font-normal" />
          <span className="block text-xs font-normal text-muted">Generated with npm run ebook:previews. Empty: the site shows illustrated cards.</span>
        </label>
        <Submit>Save settings</Submit>
      </ActionForm>
    </div>
  );
}
