import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { eur } from "@/lib/money";
import { sessionTimeline } from "@/lib/journey-stats";
import { isInAppNoise } from "@/lib/journey";

type Props = Record<string, unknown> | null;

/** One line per journey event, in plain English. */
function describe(name: string, p: Props): string {
  const v = (k: string) => (p?.[k] == null ? "" : String(p[k]));
  switch (name) {
    case "page_view":
      return `Opened the page${v("ref") ? ` from ${v("ref")}` : ""}${v("utm_content") ? ` · ad ${v("utm_content")}` : ""}${v("vw") ? ` · screen ${v("vw")}×${v("vh")}` : ""}`;
    case "page_leave":
      return `Left the page after ${Math.round(Number(p?.dur ?? 0) / 1000)}s (${Math.round(Number(p?.active ?? 0) / 1000)}s visible), scrolled ${v("scroll")}%`;
    case "scroll":
      return `Scrolled to ${v("pct")}%`;
    case "section":
      return `Saw section “${v("id")}”`;
    case "click":
      return `Clicked “${v("label")}”${v("href") ? ` → ${v("href")}` : ""}${v("bundle") ? ` (bundle ${v("bundle")})` : ""}`;
    case "rage_click":
      return `Rage-clicked “${v("label")}”`;
    case "bundle_select":
      return `Chose bundle ${v("bundle")} (${v("where")})`;
    case "lang_switch":
      return `Switched language to ${v("to")}`;
    case "exit_popup_shown":
      return `Exit popup shown (${v("trigger")})`;
    case "exit_popup_submit":
      return `Exit popup: left their ${v("step")}`;
    case "checkout_view":
      return `Checkout opened · bundle ${v("bundle")} · ${v("country")}${p?.resumed ? " · resumed" : ""}`;
    case "field_focus":
      return `Clicked into ${v("field")}`;
    case "field_done":
      return v("value") ? `${v("field")}: chose ${v("value")}` : "checked" in (p ?? {}) ? `${v("field")}: ${p?.checked ? "ticked" : "unticked"}` : `${v("field")}: ${p?.filled ? "filled in" : "left empty"}`;
    case "field_error":
      return `Error on ${v("field")}${v("msg") ? `: “${v("msg")}”` : ""}`;
    case "country_change":
      return `Changed delivery country ${v("from")} → ${v("to")}`;
    case "promo_apply":
      return `Tried a promo code: ${p?.ok ? "accepted" : "invalid"}`;
    case "pay_click":
      return `Clicked “Pagar” with ${v("method")}${p?.configured === false ? " (method not configured)" : ""}`;
    case "offer_shown":
      return `One-time offer shown before paying`;
    case "offer_accept":
      return `Accepted the offer: ${(p?.keys as string[] | undefined)?.join(", ")}`;
    case "offer_decline":
      return `Declined the offer`;
    case "pay_invalid":
      return `Pay blocked, fields to fix: ${v("fields")}`;
    case "payment_start":
      return `Payment started: ${v("method")} (${v("kind")})`;
    case "payment_error":
      return `Payment error at ${v("stage")}${v("method") ? ` · ${v("method")}` : ""}${v("code") ? ` · ${v("code")}` : ""}${v("msg") ? ` · “${v("msg")}”` : ""}`;
    case "mbway_wait":
      return `Waiting for MB WAY approval in the app`;
    case "mbway_result":
      return `MB WAY: ${v("state")}`;
    case "upsell_view":
      return `After-payment offer shown`;
    case "upsell_accept":
      return `Accepted after-payment offer ${v("offer")}`;
    case "upsell_decline":
      return `Declined after-payment offer`;
    case "thankyou_view":
      return `Thank-you page`;
    case "js_error":
      return isInAppNoise(p?.msg) ? `In-app browser noise (ignored): ${v("msg")}` : `JavaScript error: ${v("msg")} ${v("at")}`;
    default:
      return name;
  }
}

const tone = (name: string) =>
  /error|rage/.test(name) ? "text-xmas" : /thankyou|payment_start|checkout_view|pay_click/.test(name) ? "font-semibold" : /scroll|section|field_focus|page_leave/.test(name) ? "text-muted" : "";

export default async function SessionPage({ params }: { params: Promise<{ sid: string }> }) {
  await requireAdmin({ role: "admin" });
  const { sid } = await params;
  const t = await sessionTimeline(decodeURIComponent(sid));
  if (!t.events.length) notFound();
  const first = t.events[0];
  const clarity = process.env.CLARITY_PROJECT_ID;
  const rows = [
    ...t.events.map((e) => ({ at: e.createdAt, kind: "visit" as const, path: e.path, text: describe(e.name, e.props ?? null), cls: tone(e.name) })),
    ...t.orderEvents.map((e) => ({ at: e.createdAt, kind: "order" as const, path: null, text: `${e.type}${e.payload ? ` · ${JSON.stringify(e.payload).slice(0, 140)}` : ""}`, cls: /fail|error|reject/.test(e.type) ? "text-xmas" : "" })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const fmt = (d: Date) => d.toLocaleString("en-GB", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  let lastPath: string | null = null;

  return (
    <div className="space-y-5">
      <Link href="/admin/funnel" className="text-sm text-muted underline">← Funnel &amp; visits</Link>
      <div>
        <h1 className="font-serif text-2xl font-semibold">Visit journey</h1>
        <p className="mt-1 text-sm text-muted">
          {fmt(first.createdAt)} · {first.source ?? "Unknown source"} · {first.device} · {first.browser} · {first.country ?? "??"} · {first.locale ?? "pt"} · {t.events.length} events
        </p>
        {t.order && (
          <p className="mt-1 text-sm">
            Order <Link className="underline" href={`/admin/orders/${encodeURIComponent(t.order.id)}`}>{t.order.id}</Link> · {t.order.status} · {eur(t.order.totalCents)}
          </p>
        )}
        {clarity && (
          <p className="mt-2 rounded bg-paper px-3 py-2 text-xs">
            Screen recording (only if the visitor accepted statistics cookies): in{" "}
            <a className="underline" href={`https://clarity.microsoft.com/projects/view/${encodeURIComponent(clarity)}/impressions`} target="_blank" rel="noreferrer">Clarity → Recordings</a>, filter by custom tag <code>wp_sid</code> = <code className="select-all">{first.sessionId}</code>
          </p>
        )}
      </div>
      <ol className="rounded-lg border bg-white">
        {rows.map((r, i) => {
          const newPath = r.kind === "visit" && r.path !== lastPath;
          if (r.kind === "visit") lastPath = r.path;
          return (
            <li key={i} className="border-t first:border-t-0">
              {newPath && <p className="bg-paper px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">{r.path}</p>}
              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-1.5 text-sm">
                <span className="whitespace-nowrap text-xs text-muted">{fmt(r.at).split(" ").pop()}</span>
                <span className={r.cls}>
                  {r.kind === "order" && <span className="mr-1 rounded bg-gold/20 px-1.5 text-xs">server</span>}
                  {r.text}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
