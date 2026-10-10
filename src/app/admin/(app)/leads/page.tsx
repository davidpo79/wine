import { desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lisbonDateTime } from "@/lib/time";

export default async function Leads() {
  const leads = await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(1000);
  const emails = leads.map((l) => l.email);
  const buyers = emails.length
    ? await db
        .select({ email: sql<string>`lower(${schema.orders.email})` })
        .from(schema.orders)
        .where(inArray(schema.orders.status, ["paid", "preparing", "shipped", "delivered"]))
    : [];
  const bought = new Set(buyers.map((b) => b.email));
  const converted = leads.filter((l) => bought.has(l.email)).length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Leads</h1>
        <a href="/admin/export/leads" className="rounded border bg-white px-3 py-2 text-sm font-medium hover:bg-paper">Export leads (CSV)</a>
      </div>
      <p className="mt-1 text-sm text-muted">
        {leads.length} leads from the exit popup · {converted} bought ({leads.length ? Math.round((converted / leads.length) * 100) : 0}%) · {leads.filter((l) => l.unsubscribedAt).length} unsubscribed
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-2">Date</th><th>Name</th><th>Email</th><th>Code</th><th>UTM</th><th>Bought</th><th>Reminder</th><th>Status</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{lisbonDateTime(l.createdAt)}</td>
                <td>{l.name}</td>
                <td>{l.email}</td>
                <td className="font-mono text-xs">{l.promoCode}</td>
                <td className="text-xs">{l.utm ? Object.values(l.utm).join(" / ") : ""}</td>
                <td>{bought.has(l.email) ? "Yes" : ""}</td>
                <td className="text-xs">{lisbonDateTime(l.reminderSentAt)}</td>
                <td className="text-xs">{l.unsubscribedAt ? "Unsubscribed" : l.consentMarketing ? "Subscribed" : ""}</td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted">No leads yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
