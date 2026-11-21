import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lisbonDateTime } from "@/lib/time";
import { contractLink, createAndSendContract } from "@/lib/creator-contract-service";

// UGC creators who applied through /es/creadores (David, 21/11/2026).
const STATUS: Record<string, string> = { new: "New", contacted: "Contacted", chosen: "Chosen", rejected: "Not a fit" };

async function setStatus(f: FormData) {
  "use server";
  await requireAdmin({ role: "admin" });
  const id = Number(f.get("id"));
  const status = String(f.get("status"));
  if (!id || !(status in STATUS)) return;
  await db.update(schema.creatorApplications).set({ status, notes: String(f.get("notes") ?? "").slice(0, 1000) || null }).where(eq(schema.creatorApplications.id, id));
  revalidatePath("/admin/creators");
}

// One click next to the creator's name: create the contract with these terms and send the signing link by email + SMS.
async function sendContract(f: FormData) {
  "use server";
  const admin = await requireAdmin({ role: "admin" });
  const id = Number(f.get("id"));
  const fee = Math.round(Number(String(f.get("fee") ?? "").replace(",", ".")) * 100);
  const videos = Math.max(1, Math.min(20, Number(f.get("videos")) || 1));
  const seconds = Math.max(5, Math.min(180, Number(f.get("seconds")) || 30));
  const delivery = String(f.get("delivery") ?? "");
  if (!id || !(fee > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(delivery)) return;
  await createAndSendContract(id, { videos, seconds, feeCents: fee, deliveryDate: delivery }, String(f.get("signer") ?? "").trim() || admin.email);
  revalidatePath("/admin/creators");
}

const link = (v: string) => (/^https?:\/\//.test(v) ? v : v.startsWith("@") ? `https://www.instagram.com/${v.slice(1)}` : null);

export default async function Creators() {
  await requireAdmin({ role: "admin" });
  const rows = await db.select().from(schema.creatorApplications).orderBy(desc(schema.creatorApplications.createdAt)).limit(1000);
  const contracts = await db.select().from(schema.creatorContracts).orderBy(desc(schema.creatorContracts.createdAt));
  const byApp = new Map<number, typeof contracts>();
  for (const c of contracts) if (c.applicationId) byApp.set(c.applicationId, [...(byApp.get(c.applicationId) ?? []), c]);
  const inTwoWeeks = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">UGC creators</h1>
      <p className="mt-1 text-sm text-muted">
        Applications from <a href="/es/creadores" target="_blank" className="underline">/es/creadores</a> · {rows.length} total · {rows.filter((r) => r.status === "new").length} new ·{" "}
        {rows.filter((r) => r.status === "chosen").length} chosen
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-2">Date</th><th>Name</th><th>Contact</th><th>Profile</th><th>Examples / message</th><th>Status / notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const profile = link(r.handle);
              const wa = r.phone ? `https://wa.me/${r.phone.replace(/\D/g, "").replace(/^(?!34)(\d{9})$/, "34$1")}` : null;
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 text-xs">{lisbonDateTime(r.createdAt)}</td>
                  <td className="min-w-[260px] p-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">{r.city}</span>
                    {(byApp.get(r.id) ?? []).map((c) => (
                      <span key={c.id} className="mt-1 block text-xs">
                        {c.status === "signed" ? (
                          <a href={`/admin/creators/contract/${c.id}`} target="_blank" className="font-medium text-green-700 underline">✓ Contract #{c.id} signed · PDF</a>
                        ) : (
                          <span className="text-amber-700">Contract #{c.id} sent ({c.sentVia}) · not signed yet</span>
                        )}{" "}
                        <a href={contractLink(c.token)} target="_blank" className="text-muted underline">link</a>
                      </span>
                    ))}
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer font-semibold text-azulejo">📝 Send contract (email + SMS)</summary>
                      <form action={sendContract} className="mt-1 grid grid-cols-2 gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <label>Fee €<input name="fee" required inputMode="decimal" placeholder="60" className="w-full rounded border px-1 py-0.5" /></label>
                        <label>Videos<input name="videos" type="number" min={1} max={20} defaultValue={1} className="w-full rounded border px-1 py-0.5" /></label>
                        <label>Seconds<input name="seconds" type="number" min={5} max={180} defaultValue={30} className="w-full rounded border px-1 py-0.5" /></label>
                        <label>Delivery by<input name="delivery" type="date" required defaultValue={inTwoWeeks} className="w-full rounded border px-1 py-0.5" /></label>
                        <label className="col-span-2">Signs for the company<input name="signer" placeholder="Name" className="w-full rounded border px-1 py-0.5" /></label>
                        <button className="col-span-2 rounded bg-azulejo px-2 py-1 font-semibold text-white">Send by email + SMS</button>
                      </form>
                    </details>
                  </td>
                  <td className="text-xs">
                    <a href={`mailto:${r.email}`} className="text-azulejo underline">{r.email}</a>
                    {r.phone && <span className="block">{r.phone}{wa && <a href={wa} target="_blank" className="ml-2 text-green-700 underline">WhatsApp</a>}</span>}
                  </td>
                  <td className="text-xs">
                    {profile ? <a href={profile} target="_blank" className="text-azulejo underline">{r.handle}</a> : r.handle}
                    {r.followers && <span className="block text-muted">{r.followers} followers</span>}
                  </td>
                  <td className="max-w-xs text-xs">
                    {r.portfolio && <a href={r.portfolio} target="_blank" className="block break-all text-azulejo underline">{r.portfolio}</a>}
                    {r.message && <span className="mt-1 block whitespace-pre-wrap text-muted">{r.message}</span>}
                  </td>
                  <td className="p-2">
                    <form action={setStatus} className="flex flex-col gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="status" defaultValue={r.status} className="rounded border px-2 py-1 text-xs">
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input name="notes" defaultValue={r.notes ?? ""} placeholder="Notes" className="rounded border px-2 py-1 text-xs" />
                      <button className="rounded bg-night px-2 py-1 text-xs text-white">Save</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted">No applications yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
