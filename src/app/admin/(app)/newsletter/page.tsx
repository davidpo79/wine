import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lisbonDateTime } from "@/lib/time";
import { THEMES, themeOf, upcomingOccasions } from "@/lib/newsletter/templates";
import { contactStats, newsletterConfigured, newsletterFrom } from "@/lib/newsletter";
import { createCampaignAction, importContactsAction, syncShopAction } from "../../newsletter-actions";
import { ActionForm, Submit } from "../../ui";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending…", sent: "Sent", cancelled: "Stopped" };
const PILL: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-amber-100 text-amber-800",
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};
const day = (d: Date) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", timeZone: "UTC" });

export default async function Newsletter() {
  await requireAdmin({ role: "admin" });
  const S = schema.newsletterSends;
  const list = await db.select().from(schema.newsletterCampaigns).orderBy(desc(schema.newsletterCampaigns.updatedAt)).limit(100);
  const counts = await db
    .select({ id: S.campaignId, sent: sql<number>`count(*) filter (where ${S.status} = 'sent')::int`, opened: sql<number>`count(${S.openedAt})::int`, clicked: sql<number>`count(${S.clickedAt})::int` })
    .from(S)
    .groupBy(S.campaignId);
  const byId = new Map(counts.map((r) => [r.id, r]));
  const campaigns = list.map((c) => ({ ...c, sent: byId.get(c.id)?.sent ?? 0, opened: byId.get(c.id)?.opened ?? 0, clicked: byId.get(c.id)?.clicked ?? 0 }));
  const stats = await contactStats();
  const next = upcomingOccasions(new Date(), 4);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const ready = newsletterConfigured();

  return (
    <div className="max-w-6xl">
      <h1 className="font-serif text-3xl font-semibold">Newsletter</h1>
      <p className="mt-1 text-sm text-muted">
        Campaigns to your own list, sent from <b>{newsletterFrom() || "(no sender set)"}</b>.{" "}
        {!ready && <span className="font-semibold text-red-700">E-mail is not set up: RESEND_API_KEY and NEWSLETTER_FROM (or EMAIL_FROM) are needed to send.</span>}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Coming up</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {next.map((o) => {
            const late = o.sendBy.getTime() < Date.now();
            return (
              <form key={`${o.name}-${o.date.toISOString()}`} action={createCampaignAction} className="flex flex-col rounded-lg border bg-white p-4">
                <input type="hidden" name="template" value={o.template} />
                <input type="hidden" name="name" value={`${o.name} ${o.date.getUTCFullYear()}`} />
                <p className="font-semibold">{o.name}</p>
                <p className="text-sm text-muted">{day(o.date)}</p>
                <p className={`mt-2 text-xs ${late ? "font-semibold text-red-700" : "text-muted"}`}>
                  {late ? "Send now: ideal date has passed" : `Send by ${day(o.sendBy)}`}
                </p>
                <p className="mt-1 text-xs text-muted">Template: {themeOf(o.template).label}</p>
                <button className="mt-3 rounded border border-[#0F2340] px-3 py-1.5 text-sm font-semibold text-[#0F2340] hover:bg-paper">Create campaign</button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Campaigns</h2>
          <form action={createCampaignAction} className="flex flex-wrap items-center gap-2">
            <select name="template" className="rounded border bg-white px-2 py-2 text-sm" aria-label="Template">
              {THEMES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Campaign name" className="rounded border bg-white px-2 py-2 text-sm" />
            <button className="rounded bg-[#0F2340] px-4 py-2 text-sm font-semibold text-white">New campaign</button>
          </form>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase text-muted">
              <tr>
                <th className="p-3">Campaign</th>
                <th className="p-3">Template</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Sent</th>
                <th className="p-3 text-right">Opened</th>
                <th className="p-3 text-right">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted">
                    No campaigns yet. Pick an occasion above or create one from a template.
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">
                    <Link href={`/admin/newsletter/${c.id}`} className="font-medium underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="p-3">{themeOf(c.template).label}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[c.status] ?? ""}`}>{STATUS[c.status] ?? c.status}</span>
                    {c.status === "scheduled" && c.scheduledAt && <span className="ml-2 text-xs text-muted">{lisbonDateTime(c.scheduledAt)}</span>}
                    {c.status === "sent" && c.finishedAt && <span className="ml-2 text-xs text-muted">{lisbonDateTime(c.finishedAt)}</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{c.sent}</td>
                  <td className="p-3 text-right tabular-nums">{pct(c.opened, c.sent)}</td>
                  <td className="p-3 text-right tabular-nums">{pct(c.clicked, c.sent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Contacts</h2>
          <p className="mt-1 text-sm">
            <b>{stats.subscribed}</b> subscribed · {stats.unsubscribed} unsubscribed · {stats.bounced} bounced or marked as spam
          </p>
          {stats.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.tags.map(([t, n]) => (
                <span key={t} className="rounded-full bg-paper px-2 py-0.5 text-xs">
                  {t} · {n}
                </span>
              ))}
            </div>
          )}
          <ActionForm action={syncShopAction} className="mt-4">
            <p className="text-sm text-muted">Adds people who bought on this site and leads who agreed to receive offers. Leads who unsubscribed are unsubscribed here too.</p>
            <Submit className="mt-2">Add site customers and leads</Submit>
          </ActionForm>
        </div>

        <ActionForm action={importContactsAction} className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Import a list</h2>
          <p className="mt-1 text-sm text-muted">CSV or Excel (.xlsx) with an Email column, and a name column if you have one (Nome, First name…). Duplicates and invalid addresses are skipped.</p>
          <label className="mt-3 block text-sm font-medium">
            File
            <input id="nl-file" name="file" type="file" accept=".csv,.xlsx,.txt" className="mt-1 block w-full text-sm" />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Tag for this list
            <input id="nl-tag" name="tag" placeholder="clientes-woo" className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input id="nl-confirm" name="confirm" type="checkbox" className="mt-1" />
            These people are customers of the business or agreed to receive our e-mails.
          </label>
          <Submit className="mt-3">Import</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
