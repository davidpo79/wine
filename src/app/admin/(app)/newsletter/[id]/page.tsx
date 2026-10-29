import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lisbonDateTime } from "@/lib/time";
import { audienceOf, campaignStats, contactStats, contentOf, newsletterConfigured } from "@/lib/newsletter";
import { deleteCampaignAction, duplicateCampaignAction } from "../../../newsletter-actions";
import { Editor } from "./Editor";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin({ role: "admin" });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id)).limit(1);
  if (!c) notFound();
  const [stats, contacts, audience] = await Promise.all([campaignStats(id), contactStats(), audienceOf(c.audience)]);
  const editable = c.status === "draft" || c.status === "scheduled";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/newsletter" className="text-sm text-muted underline">
            ← Newsletter
          </Link>
          <h1 className="font-serif text-2xl font-semibold">{c.name}</h1>
        </div>
        <div className="flex gap-2">
          <form action={duplicateCampaignAction}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded border bg-white px-3 py-1.5 text-sm">Duplicate</button>
          </form>
          {c.status === "draft" && (
            <form action={deleteCampaignAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="rounded border bg-white px-3 py-1.5 text-sm text-red-700">Delete</button>
            </form>
          )}
        </div>
      </div>

      {stats.total > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Sent", stats.sent],
            ["Waiting", stats.queued],
            ["Opened", stats.opened],
            ["Clicked", stats.clicked],
            ["Failed or skipped", stats.failed + stats.skipped],
          ].map(([l, n]) => (
            <div key={String(l)} className="rounded-lg border bg-white p-3">
              <p className="text-xs uppercase text-muted">{l}</p>
              <p className="text-xl font-semibold tabular-nums">{n}</p>
            </div>
          ))}
        </div>
      )}
      {c.status === "scheduled" && c.scheduledAt && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Scheduled for {lisbonDateTime(c.scheduledAt)} (Lisbon) to {stats.queued} people.</p>}
      {c.status === "sending" && <p className="mt-3 rounded bg-blue-50 p-3 text-sm text-blue-900">Sending now: about 500 e-mails per minute. Refresh to see progress.</p>}

      <Editor
        id={c.id}
        status={c.status}
        editable={editable}
        ready={newsletterConfigured()}
        failed={stats.failed}
        initial={{ name: c.name, template: c.template, content: contentOf(c), audience: c.audience }}
        tags={contacts.tags}
        audienceCount={audience.length}
        myEmail={me.email}
      />
    </div>
  );
}
