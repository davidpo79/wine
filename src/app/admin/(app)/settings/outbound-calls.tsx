import { OUTBOUND_FIELDS, loadOutboundSettings, savedOutbound } from "@/lib/outbound-settings";
import { humanCallMissing } from "@/lib/telnyx-call-control";
import { ptFlags } from "@/lib/pt-callers/flags";
import { apolloKeyTestAction, outboundCallsAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

const GROUPS: Record<string, { title: string; text: string }> = {
  telnyx: { title: "Telnyx", text: "Shared by the admin browser phone, the Portugal callers and the AI abandoned-checkout call." },
  human: { title: "Admin → customer calls", text: "The Call button on orders and leads." },
  pt: { title: "Portugal HR callers", text: "Apollo lead list and the sales reps' calls (Admin → Portugal HR callers)." },
};

/** Admin → Settings → Outbound calls. A value saved here wins over Railway; an empty field uses Railway's value. */
export async function OutboundCallsSection() {
  await loadOutboundSettings(true);
  const saved = savedOutbound();
  const value = (k: string) => saved[k] ?? process.env[k] ?? "";
  const source = (k: string) => (saved[k] !== undefined ? "saved here" : process.env[k] ? "from Railway" : "not set");
  const missing = humanCallMissing();
  const pt = ptFlags();
  const secret = (k: string) => (process.env[k] ? "set in Railway" : "NOT set in Railway");
  return (
    <section className="mt-6 space-y-4 rounded-lg border bg-white p-5 text-sm">
      <div>
        <h2 className="font-semibold">Outbound calls</h2>
        <p className="text-muted">
          Every call setting is controlled here. A value saved here wins over the Railway variable of the same name; an empty field falls back to Railway. API keys stay in Railway only (they are secrets
          and are never stored in the database or shown here).
        </p>
        <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          <li>TELNYX_API_KEY: <b>{secret("TELNYX_API_KEY")}</b></li>
          <li>APOLLO_API_KEY: <b>{secret("APOLLO_API_KEY")}</b></li>
          <li>SITE_URL: <b>{process.env.SITE_URL ? "set in Railway" : "NOT set in Railway"}</b></li>
          <li>Browser phone: <b>{missing.length ? `missing ${missing.join(", ")}` : "ready"}</b></li>
          <li>Portugal callers: <b>{pt.live ? "LIVE" : "demo mode (switches off)"}</b></li>
          <li>Do-not-call list (Portugal): <b>no source connected, every Portugal-callers dial is refused</b></li>
        </ul>
      </div>

      <ActionForm action={outboundCallsAction} className="space-y-5">
        {Object.entries(GROUPS).map(([g, info]) => (
          <fieldset key={g} className="space-y-2 rounded border p-3">
            <legend className="px-1 font-semibold">{info.title}</legend>
            <p className="text-xs text-muted">{info.text}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {OUTBOUND_FIELDS.filter((f) => f.group === g).map((f) => {
                const v = value(f.key);
                const label = (
                  <span className="block text-xs font-semibold">
                    {f.label} <span className="font-normal text-muted">({source(f.key)})</span>
                  </span>
                );
                if (f.kind === "bool" || f.kind === "bool01")
                  return (
                    <label key={f.key} className="flex items-start gap-2">
                      <input type="checkbox" name={f.key} value={f.kind === "bool" ? "true" : "1"} defaultChecked={f.kind === "bool" ? v === "true" : v === "1"} className="mt-1" />
                      <span>
                        {label}
                        <span className="block text-xs text-muted">{f.hint}</span>
                      </span>
                    </label>
                  );
                if (f.kind === "select")
                  return (
                    <label key={f.key} className="block">
                      {label}
                      <select name={f.key} defaultValue={v} className="mt-1 w-full rounded border p-2">
                        <option value="">(Railway / default)</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      <span className="block text-xs text-muted">{f.hint}</span>
                    </label>
                  );
                return (
                  <label key={f.key} className="block">
                    {label}
                    <input name={f.key} defaultValue={v} inputMode={f.kind === "int" ? "numeric" : undefined} className="mt-1 w-full rounded border p-2 font-mono text-xs" />
                    <span className="block text-xs text-muted">{f.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <Submit>Save outbound calls settings</Submit>
      </ActionForm>

      <ActionForm action={apolloKeyTestAction} className="flex flex-wrap items-center gap-3 border-t pt-4">
        <span className="text-muted">Checks APOLLO_API_KEY with Apollo&apos;s free people search (1 result, 0 credits, nothing stored).</span>
        <Submit>Test Apollo key</Submit>
      </ActionForm>
    </section>
  );
}
