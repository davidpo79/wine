import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lisbonDateTime } from "@/lib/time";
import { bucketConfigured, presignedGet } from "@/lib/bucket";
import { contractLink, sendCreatorLink, uploadLink } from "@/lib/creator-contract-service";

// One UGC creator: details, contracts (signed PDF, payment) and the videos they uploaded, to review (David, 21/11/2026).

const UPLOAD: Record<string, [string, string]> = {
  new: ["Waiting for review", "bg-amber-100 text-amber-800"],
  approved: ["Approved", "bg-green-100 text-green-800"],
  rejected: ["Changes requested", "bg-red-100 text-red-800"],
};

async function reviewUpload(status: "approved" | "rejected", f: FormData) {
  "use server";
  await requireAdmin({ role: "admin" });
  const id = Number(f.get("id"));
  if (!id || !["approved", "rejected", "new"].includes(status)) return;
  await db.update(schema.creatorUploads).set({ status, note: String(f.get("note") ?? "").slice(0, 500) || null, reviewedAt: new Date() }).where(eq(schema.creatorUploads.id, id));
  revalidatePath(`/admin/creators/${f.get("app")}`);
  revalidatePath("/admin/creators");
}

async function markPaid(f: FormData) {
  "use server";
  await requireAdmin({ role: "admin" });
  const id = Number(f.get("id"));
  const paid = f.get("paid") === "1";
  await db.update(schema.creatorContracts).set({ paidAt: paid ? new Date() : null }).where(eq(schema.creatorContracts.id, id));
  revalidatePath(`/admin/creators/${f.get("app")}`);
  revalidatePath("/admin/creators");
}

async function resend(f: FormData) {
  "use server";
  await requireAdmin({ role: "admin" });
  await sendCreatorLink(Number(f.get("id")));
  revalidatePath(`/admin/creators/${f.get("app")}`);
}

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const eur = (c: number) => `${(c / 100).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} €`;

export default async function CreatorCard({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ role: "admin" });
  const id = Number((await params).id);
  const [app] = await db.select().from(schema.creatorApplications).where(eq(schema.creatorApplications.id, id || 0)).limit(1);
  if (!app) notFound();
  const contracts = await db.select().from(schema.creatorContracts).where(eq(schema.creatorContracts.applicationId, app.id)).orderBy(desc(schema.creatorContracts.createdAt));
  const uploads = await db.select().from(schema.creatorUploads).where(eq(schema.creatorUploads.applicationId, app.id)).orderBy(desc(schema.creatorUploads.createdAt));
  const ready = uploads.filter((u) => u.status !== "uploading");
  const urls = new Map<number, string>();
  if (bucketConfigured()) for (const u of ready) urls.set(u.id, await presignedGet(u.key, 3600).catch(() => ""));
  const dl = new Map<number, string>();
  if (bucketConfigured()) for (const u of ready) dl.set(u.id, await presignedGet(u.key, 3600, u.fileName).catch(() => ""));
  const wa = app.phone ? `https://wa.me/${app.phone.replace(/\D/g, "").replace(/^(\d{9})$/, "34$1")}` : null;

  return (
    <div>
      <Link href="/admin/creators" className="text-sm text-muted underline">← All creators</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{app.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {app.city} · applied {lisbonDateTime(app.createdAt)} · status <b>{app.status}</b>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`mailto:${app.email}`} className="rounded border bg-white px-3 py-1.5">✉️ {app.email}</a>
          {app.phone && <a href={`tel:${app.phone}`} className="rounded border bg-white px-3 py-1.5">📞 {app.phone}</a>}
          {wa && <a href={wa} target="_blank" className="rounded border bg-white px-3 py-1.5 text-green-700">WhatsApp</a>}
          <a href={/^https?:/.test(app.handle) ? app.handle : `https://www.instagram.com/${app.handle.replace(/^@/, "")}`} target="_blank" className="rounded border bg-white px-3 py-1.5">
            {app.handle}{app.followers ? ` · ${app.followers}` : ""}
          </a>
        </div>
      </div>
      {(app.portfolio || app.message) && (
        <p className="mt-3 rounded-lg border bg-white p-3 text-sm">
          {app.portfolio && <a href={app.portfolio} target="_blank" className="block break-all text-azulejo underline">{app.portfolio}</a>}
          {app.message && <span className="mt-1 block whitespace-pre-wrap text-muted">{app.message}</span>}
        </p>
      )}

      <h2 className="mt-8 font-serif text-xl font-semibold">Contract</h2>
      {!contracts.length && <p className="mt-2 text-sm text-muted">No contract yet: send one from the list (📝 Send contract).</p>}
      <div className="mt-2 space-y-3">
        {contracts.map((c) => (
          <div key={c.id} className="rounded-lg border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>#{c.id}</b> · {c.videos} video{c.videos > 1 ? "s" : ""} · {c.seconds}s · {eur(c.feeCents)} · delivery by {c.deliveryDate}
              </span>
              {c.status === "signed" ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Signed {c.signedAt ? lisbonDateTime(c.signedAt) : ""}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Waiting for signature (sent {c.sentVia})</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.status === "signed" && <a href={`/admin/creators/contract/${c.id}`} target="_blank" className="rounded bg-night px-3 py-1.5 text-white">📄 Signed contract (PDF)</a>}
              <a href={c.status === "signed" ? uploadLink(c.token) : contractLink(c.token)} target="_blank" className="rounded border px-3 py-1.5">
                {c.status === "signed" ? "Creator's upload page" : "Signing page"}
              </a>
              <form action={resend}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="app" value={app.id} />
                <button className="rounded border px-3 py-1.5">↻ Resend {c.status === "signed" ? "upload" : "signing"} link (email + SMS)</button>
              </form>
              {c.status === "signed" && (
                <form action={markPaid} className="ml-auto">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="app" value={app.id} />
                  <input type="hidden" name="paid" value={c.paidAt ? "0" : "1"} />
                  {c.paidAt ? (
                    <button className="rounded bg-green-100 px-3 py-1.5 text-green-800">✓ Paid {lisbonDateTime(c.paidAt)} (undo)</button>
                  ) : (
                    <button className="rounded bg-azulejo px-3 py-1.5 font-semibold text-white">💶 Mark {eur(c.feeCents)} as paid</button>
                  )}
                </form>
              )}
            </div>
            {c.status === "signed" && c.iban && <p className="mt-2 text-xs text-muted">IBAN {c.iban} · DNI/NIE {c.idNumber} · {c.address}</p>}
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-serif text-xl font-semibold">
        Videos <span className="text-base font-normal text-muted">({ready.length} uploaded · {ready.filter((u) => u.status === "new").length} waiting for review)</span>
      </h2>
      {!ready.length && <p className="mt-2 text-sm text-muted">Nothing uploaded yet.</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ready.map((u) => (
          <div key={u.id} className="overflow-hidden rounded-lg border bg-white text-sm">
            {(u.contentType ?? "").startsWith("image/") ? (
              <img src={urls.get(u.id)} alt="" className="aspect-[9/16] w-full bg-black object-contain" />
            ) : (
              <video src={urls.get(u.id)} controls preload="metadata" className="aspect-[9/16] w-full bg-black" />
            )}
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="break-all font-medium">{u.fileName}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${UPLOAD[u.status]?.[1] ?? ""}`}>{UPLOAD[u.status]?.[0] ?? u.status}</span>
              </div>
              <p className="text-xs text-muted">{mb(u.sizeBytes)} · {u.uploadedAt ? lisbonDateTime(u.uploadedAt) : ""}</p>
              <form className="mt-2 space-y-1">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="app" value={app.id} />
                <input name="note" defaultValue={u.note ?? ""} placeholder="Note for the creator (optional)" className="w-full rounded border px-2 py-1 text-xs" />
                <div className="flex gap-1">
                  <button formAction={reviewUpload.bind(null, "approved")} className="flex-1 rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white">✓ Approve</button>
                  <button formAction={reviewUpload.bind(null, "rejected")} className="flex-1 rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">✗ Ask for changes</button>
                </div>
              </form>
              {dl.get(u.id) && <a href={dl.get(u.id)} className="mt-2 block text-center text-xs text-azulejo underline">⬇ Download original</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
