import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lisbonDateTime } from "@/lib/time";
import { leadAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

const STATUS: Record<string, string> = { new: "New", contacted: "Contacted", no_answer: "No answer", not_interested: "Not interested", converted: "Converted" };

export default async function Leads({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin({ role: "admin" });
  const { view } = await searchParams;
  const all = await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(2000);
  const buyers = await db
    .select({ email: sql<string>`lower(${schema.orders.email})` })
    .from(schema.orders)
    .where(inArray(schema.orders.status, ["paid", "preparing", "shipped", "delivered"]));
  const bought = new Set(buyers.map((b) => b.email));
  // Agent queue: phone + phone consent, has not bought, not unsubscribed, not closed out.
  const callable = all.filter((l) => l.phone && l.consentPhone && !bought.has(l.email) && !l.unsubscribedAt && !["converted", "not_interested"].includes(l.contactStatus));
  const leads = view === "call" ? callable : all;
  const converted = all.filter((l) => bought.has(l.email)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Leads</h1>
        <a href="/admin/export/leads" className="rounded border bg-white px-3 py-2 text-sm font-medium hover:bg-paper">Export leads (CSV)</a>
      </div>
      <p className="mt-1 text-sm text-muted">
        {all.length} leads · {all.filter((l) => l.phone).length} with mobile · {converted} bought ({all.length ? Math.round((converted / all.length) * 100) : 0}%) · {all.filter((l) => l.unsubscribedAt).length} unsubscribed
      </p>
      <div className="mt-3 flex gap-2 text-sm">
        <Link href="/admin/leads" className={`rounded px-3 py-1.5 ${view !== "call" ? "bg-night text-white" : "border bg-white"}`}>All ({all.length})</Link>
        <Link href="/admin/leads?view=call" className={`rounded px-3 py-1.5 ${view === "call" ? "bg-night text-white" : "border bg-white"}`}>To call ({callable.length})</Link>
      </div>
      {view === "call" && <p className="mt-2 text-xs text-muted">Leads with a mobile number and phone/WhatsApp consent who have not bought yet. Only contact people in this list.</p>}
      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-2">Date</th><th>Name</th><th>Email</th><th>Mobile</th><th>Code</th><th>Bought</th><th>Contact status / notes</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const wa = l.phone ? `https://wa.me/${l.phone.replace("+", "")}` : null;
              return (
                <tr key={l.id} className="border-t align-top">
                  <td className="p-2 text-xs">{lisbonDateTime(l.createdAt)}</td>
                  <td>{l.name}{l.unsubscribedAt && <span className="block text-xs text-red-700">unsubscribed</span>}</td>
                  <td className="text-xs">{l.email}</td>
                  <td className="text-xs">
                    {l.phone ? (
                      <>
                        <a href={`tel:${l.phone}`} className="text-azulejo underline">{l.phone}</a>
                        {wa && <a href={wa} target="_blank" className="ml-2 text-green-700 underline">WhatsApp</a>}
                        <span className="block text-muted">{l.consentPhone ? "call/WA consent ✓" : "no consent"}</span>
                      </>
                    ) : ""}
                  </td>
                  <td className="font-mono text-xs">{l.promoCode}</td>
                  <td>{bought.has(l.email) ? "Yes" : ""}</td>
                  <td className="py-1">
                    <ActionForm action={leadAction} className="flex flex-wrap items-start gap-1">
                      <input type="hidden" name="id" value={l.id} />
                      <select name="contact_status" defaultValue={l.contactStatus} className="rounded border p-1 text-xs">
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input name="contact_notes" defaultValue={l.contactNotes ?? ""} placeholder="Notes" className="min-w-40 flex-1 rounded border p-1 text-xs" />
                      <Submit className="!min-h-7 !px-2 !text-xs">Save</Submit>
                    </ActionForm>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">No leads.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
