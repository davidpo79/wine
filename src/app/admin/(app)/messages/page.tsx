import Link from "next/link";
import { desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { telnyxConfigured } from "@/lib/telnyx";
import { whatsappConfigured, whatsappMissing } from "@/lib/whatsapp";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { STEPS, type StepKey } from "@/lib/recovery";
import { lisbonDateTime } from "@/lib/time";
import { testEmailAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

const Dot = ({ ok }: { ok: boolean }) => <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-green-600" : "bg-xmas"}`} />;

export default async function MessagesPage() {
  const me = await requireAdmin({ role: "admin" });
  await loadOutboundSettings();
  const settings = await getSettings();
  const telnyxEmail = process.env.EMAIL_PROVIDER === "telnyx";
  const emailOk = !!process.env.EMAIL_FROM && (telnyxEmail ? !!process.env.TELNYX_API_KEY : !!process.env.RESEND_API_KEY);
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [steps, sent] = await Promise.all([
    db
      .select({ s: schema.recoverySteps, email: schema.orders.email, consentMessages: schema.orders.consentMessages, consentCalls: schema.orders.consentCalls, status: schema.orders.status })
      .from(schema.recoverySteps)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.recoverySteps.orderId))
      .where(gte(schema.recoverySteps.createdAt, since))
      .orderBy(desc(schema.recoverySteps.scheduledAt))
      .limit(60),
    db.select().from(schema.inboxMessages).where(eq(schema.inboxMessages.direction, "out")).orderBy(desc(schema.inboxMessages.createdAt)).limit(25),
  ]);
  const rows: [string, boolean, string][] = [
    ["Email (customer emails)", emailOk, emailOk ? `${telnyxEmail ? "Telnyx" : "Resend"} · from ${process.env.EMAIL_FROM}` : `Missing: ${[!process.env.EMAIL_FROM && "EMAIL_FROM", !telnyxEmail && !process.env.RESEND_API_KEY && "RESEND_API_KEY"].filter(Boolean).join(", ")}`],
    ["Alerts to you (new order, new message)", !!process.env.ADMIN_ALERT_EMAIL, process.env.ADMIN_ALERT_EMAIL ? `to ${process.env.ADMIN_ALERT_EMAIL}` : "ADMIN_ALERT_EMAIL not set (the Inbox in the admin still works)"],
    ["WhatsApp (abandoned checkout)", whatsappConfigured(), whatsappConfigured() ? "configured (Settings → Outbound calls → WhatsApp)" : `not configured: missing ${whatsappMissing().join(", ")} (Settings → Outbound calls → WhatsApp)`],
    ["SMS (fallback when WhatsApp fails)", telnyxConfigured("sms"), telnyxConfigured("sms") ? "Telnyx" : "not configured (TELNYX_API_KEY, TELNYX_FROM_NUMBER)"],
    ["AI phone call (abandoned checkout)", telnyxConfigured("voice"), telnyxConfigured("voice") ? "Telnyx" : "not configured"],
    ["Abandoned-checkout follow-up", settings.recovery_enabled, settings.recovery_enabled ? "on (Settings)" : "off in Settings"],
  ];
  const stepLabel = (k: string) => STEPS[k as StepKey]?.label ?? k;

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-semibold">Email &amp; messages</h1>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Status</h2>
        <ul className="mt-2 divide-y text-sm">
          {rows.map(([label, ok, note]) => (
            <li key={label} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span><Dot ok={ok} />{label}</span>
              <span className="text-xs text-muted">{note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Messages and calls only go to customers who ticked the consent box in the checkout. Email reminders need an email address only.
        </p>
      </section>

      <ActionForm action={testEmailAction} className="space-y-3 rounded-lg border bg-white p-4 text-sm">
        <h2 className="font-semibold">Send a test email</h2>
        <p className="text-muted">Goes through the same path as order emails and shows the provider&apos;s answer (for example “domain not verified”).</p>
        <label className="block max-w-sm">
          <span className="text-xs font-semibold">To</span>
          <input name="to" type="email" defaultValue={me.email} className="mt-1 w-full rounded border p-2" />
        </label>
        <Submit>Send test email</Submit>
      </ActionForm>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Abandoned checkouts: follow-ups, last 14 days</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">When</th><th>Order</th><th>Step</th><th>Status</th><th>Sent by</th><th>Detail</th></tr></thead>
            <tbody>
              {steps.map(({ s, email, consentMessages, status }) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="whitespace-nowrap py-1.5">{lisbonDateTime(s.attemptedAt ?? s.scheduledAt)}</td>
                  <td><Link className="underline" href={`/admin/orders/${encodeURIComponent(s.orderId)}`}>{s.orderId}</Link><div className="text-xs text-muted">{email} · {status}{consentMessages ? "" : " · no message consent"}</div></td>
                  <td>{stepLabel(s.step)}</td>
                  <td className={s.status === "failed" ? "text-xmas" : s.status === "done" ? "text-green-700" : ""}>{s.status}</td>
                  <td>{(s.channels ?? []).join(", ") || "·"}</td>
                  <td className="max-w-xs truncate text-xs text-muted" title={JSON.stringify(s.result ?? {})}>{s.result ? JSON.stringify(s.result).slice(0, 120) : ""}</td>
                </tr>
              ))}
              {!steps.length && <tr><td colSpan={6} className="py-3 text-muted">No abandoned checkouts in the last 14 days.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Last emails sent</h2>
        <ul className="mt-2 divide-y text-sm">
          {sent.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">
                <span className={m.status === "error" ? "text-xmas" : "text-green-700"}>{m.status === "error" ? "✗" : "✓"}</span> {m.kind} · {m.contact} · {m.subject}
                {m.error && <span className="text-xs text-xmas"> · {m.error}</span>}
              </span>
              <span className="text-xs text-muted">{lisbonDateTime(m.createdAt)}</span>
            </li>
          ))}
          {!sent.length && <li className="py-2 text-muted">No emails sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
