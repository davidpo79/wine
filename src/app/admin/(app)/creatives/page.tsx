import { readdirSync } from "node:fs";
import { join } from "node:path";
import { requireAdmin } from "@/lib/auth";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { publicUrl } from "@/lib/bucket";
import { creativeAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

type SP = { concept?: string; status?: string };

// The ads actually uploaded to Meta are rendered by scripts/ads and served from public/ads (Meta fetches them by URL).
// List them here, grouped by concept, so they can be seen and downloaded without knowing the file names.
function library() {
  const files: string[] = [];
  for (const dir of ["ads", "ads/anim", "lp"]) {
    try {
      for (const f of readdirSync(join(process.cwd(), "public", dir))) if (/\.(jpe?g|png|webp|mp4)$/i.test(f) && !/-(768|thumb)\./.test(f)) files.push(`${dir}/${f}`);
    } catch {}
  }
  const groups = new Map<string, string[]>();
  for (const f of files.sort()) {
    const k = f.startsWith("lp/") ? "photos (landing page)" : f.replace(/^ads\/(anim\/)?/, "").replace(/(_reel)?(_video)?(_cover)?_?(9x16|4x5|1x1)?\.(jpe?g|png|webp|mp4)$/i, "");
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return groups;
}

export default async function Creatives({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin({ role: "admin" });
  const sp = await searchParams;
  const all = await db.select().from(schema.creatives).orderBy(asc(schema.creatives.conceptKey), asc(schema.creatives.variation), asc(schema.creatives.format));
  const rows = all.filter((c) => (!sp.concept || c.conceptKey === sp.concept) && (!sp.status || c.status === sp.status));
  // Group the 3 formats of one ad (concept + variation) into one card.
  const groups = new Map<string, typeof rows>();
  for (const c of rows) {
    const k = `${c.conceptKey}_v${c.variation}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const concepts = [...new Set(all.map((c) => c.conceptKey))];
  const count = (s: string) => new Set(all.filter((c) => c.status === s).map((c) => `${c.conceptKey}_v${c.variation}`)).size;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Ads · review board</h1>
        <a href="/admin/export/creatives" className="rounded border bg-white px-3 py-2 text-sm font-medium hover:bg-paper">Export approved (ZIP)</a>
      </div>
      <p className="mt-1 text-sm text-muted">Approved {count("approved")} · Rejected {count("rejected")} · To review {count("draft")}</p>
      <form className="mt-3 flex flex-wrap gap-3 text-sm">
        <select name="concept" defaultValue={sp.concept ?? ""} className="rounded border p-1.5">
          <option value="">All concepts</option>
          {concepts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="rounded border p-1.5">
          <option value="">All statuses</option>
          <option value="draft">To review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="rounded bg-night px-3 py-1.5 font-semibold text-white">Filter</button>
      </form>
      {groups.size === 0 && <p className="mt-6 text-sm text-muted">Nothing to review here. The ads already made are in the library below.</p>}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[...groups.entries()].map(([k, items]) => {
          const c = items[0];
          return (
            <article key={k} className={`rounded-lg border-2 bg-white p-4 ${c.status === "approved" ? "border-green-500" : c.status === "rejected" ? "border-red-400" : "border-transparent"}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-mono font-semibold">{k}</h2>
                <span className="text-xs text-muted">version {c.version} · {c.status}</span>
              </div>
              <div className="mt-3 flex items-start gap-2">
                {items.map((it) => (
                  <figure key={it.id} className="flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(it.imageKey)} alt={`${k} ${it.format}`} className="w-full rounded border" loading="lazy" />
                    <figcaption className="text-center text-xs text-muted">{it.format}</figcaption>
                  </figure>
                ))}
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div><dt className="text-xs uppercase text-muted">Primary text</dt><dd className="whitespace-pre-wrap">{c.primaryText}</dd></div>
                <div><dt className="text-xs uppercase text-muted">Headline</dt><dd className="font-semibold">{c.headline}</dd></div>
                <div><dt className="text-xs uppercase text-muted">Description</dt><dd>{c.description}</dd></div>
                <div><dt className="text-xs uppercase text-muted">CTA · utm_content</dt><dd>{c.cta} · {c.utmContent}</dd></div>
              </dl>
              {c.feedback && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">Feedback: {c.feedback}</p>}
              {items.map((it) => it.id).slice(0, 1).map((id) => (
                <ActionForm key={id} action={creativeAction} className="mt-3">
                  {items.map((it) => <input key={it.id} type="hidden" name="ids" value={it.id} />)}
                  <input type="hidden" name="id" value={id} />
                  <textarea name="feedback" rows={2} placeholder="Feedback (required to reject)" defaultValue={c.feedback ?? ""} className="w-full rounded border p-2 text-sm" />
                  <div className="mt-2 flex gap-2">
                    <Submit name="decision" value="approved" className="!bg-green-700">Approve</Submit>
                    <Submit name="decision" value="rejected" className="!bg-red-700">Reject</Submit>
                  </div>
                </ActionForm>
              ))}
            </article>
          );
        })}
      </div>
      <h2 className="mt-10 font-serif text-2xl font-semibold">Ad library</h2>
      <p className="mt-1 text-sm text-muted">Every image and video in /ads (the files uploaded to Meta) and the original photos of the landing page. Tap a file name to open or download it.</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[...library().entries()].map(([k, files]) => (
          <article key={k} className="rounded-lg border bg-white p-4">
            <h3 className="font-mono font-semibold">{k}</h3>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {files.map((f) => (
                <figure key={f} className="w-[calc(50%-0.25rem)]">
                  {f.endsWith(".mp4") ? (
                    <video src={`/${f}`} controls preload="metadata" playsInline className="w-full rounded border bg-black" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/${f}`} alt={f} className="w-full rounded border" loading="lazy" />
                  )}
                  <figcaption className="mt-1 break-all text-center text-xs">
                    <a href={`/${f}`} download className="text-azulejo underline">{f.replace(/^(ads|lp)\//, "")}</a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
