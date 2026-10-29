"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { HOSTED_IMAGES, THEMES, renderNewsletter, slugify, themeOf, type NewsletterContent } from "@/lib/newsletter/templates";
import {
  audienceCountAction,
  cancelCampaignAction,
  retryFailedAction,
  saveCampaignAction,
  scheduleCampaignAction,
  testCampaignAction,
  uploadNewsletterImageAction,
} from "../../../newsletter-actions";

type Audience = { tags: string[]; excludeBuyersSince: string | null };
type Props = {
  id: number;
  status: string;
  editable: boolean;
  ready: boolean;
  failed: number;
  initial: { name: string; template: string; content: NewsletterContent; audience: Audience };
  tags: [string, number][];
  audienceCount: number;
  myEmail: string;
};

const input = "mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm font-normal";
const label = "block text-xs font-semibold";

export function Editor(p: Props) {
  const [name, setName] = useState(p.initial.name);
  const [template, setTemplate] = useState(p.initial.template);
  const [c, setC] = useState<NewsletterContent>(p.initial.content);
  const [aud, setAud] = useState<Audience>(p.initial.audience);
  const [count, setCount] = useState(p.audienceCount);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [testTo, setTestTo] = useState(p.myEmail);
  const [when, setWhen] = useState("");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [pending, start] = useTransition();
  const first = useRef(true);

  const set = <K extends keyof NewsletterContent>(k: K, v: NewsletterContent[K]) => {
    setC((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  // Live audience size while tags and the buyers filter change.
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => audienceCountAction(aud).then(setCount), 300);
    return () => clearTimeout(t);
  }, [aud]);

  const preview = useMemo(() => renderNewsletter(template, c, { firstName: "Maria", unsubscribeUrl: "#", campaignSlug: slugify(name) }).html, [template, c, name]);

  const run = (f: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await f();
      setMsg(r);
    });
  const save = () =>
    run(async () => {
      const r = await saveCampaignAction(p.id, { name, template, content: c, audience: aud });
      if (r.ok) setDirty(false);
      return r;
    });
  const saveThen = (next: () => Promise<{ ok?: string; error?: string }>) =>
    run(async () => {
      if (dirty && p.editable) {
        const r = await saveCampaignAction(p.id, { name, template, content: c, audience: aud });
        if (r.error) return r;
        setDirty(false);
      }
      return next();
    });

  const field = (k: keyof NewsletterContent, l: string, opts: { rows?: number; hint?: string; placeholder?: string } = {}) => (
    <label className={label}>
      {l}
      {opts.rows ? (
        <textarea id={`nl-${k}`} rows={opts.rows} value={String(c[k])} onChange={(e) => set(k, e.target.value as never)} disabled={!p.editable} className={input} placeholder={opts.placeholder} />
      ) : (
        <input id={`nl-${k}`} value={String(c[k])} onChange={(e) => set(k, e.target.value as never)} disabled={!p.editable} className={input} placeholder={opts.placeholder} />
      )}
      {opts.hint && <span className="mt-0.5 block font-normal text-muted">{opts.hint}</span>}
    </label>
  );

  const imagePicker = (k: "imageUrl" | "secondImageUrl", l: string) => (
    <div className="space-y-1">
      <label className={label}>
        {l}
        <select
          id={`nl-${k}-pick`}
          value={HOSTED_IMAGES.some((i) => i.url === c[k]) ? c[k] : c[k] ? "custom" : ""}
          onChange={(e) => e.target.value !== "custom" && set(k, e.target.value)}
          disabled={!p.editable}
          className={input}
        >
          <option value="">No image</option>
          {HOSTED_IMAGES.map((i) => (
            <option key={i.url} value={i.url}>
              {i.label}
            </option>
          ))}
          <option value="custom">Other (address or upload below)</option>
        </select>
      </label>
      <input id={`nl-${k}`} value={c[k]} onChange={(e) => set(k, e.target.value)} disabled={!p.editable} className={input} placeholder="https://…" aria-label={`${l} address`} />
      {p.editable && (
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif"
          aria-label={`Upload ${l}`}
          className="block text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("image", f);
            run(async () => {
              const r = await uploadNewsletterImageAction(fd);
              if (r.url) set(k, r.url);
              return r;
            });
          }}
        />
      )}
    </div>
  );

  return (
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <div className="space-y-5">
        {!p.editable && <p className="rounded bg-paper p-3 text-sm">This campaign is {p.status}. Duplicate it to send a new version.</p>}

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Design</legend>
          <label className={label}>
            Campaign name (only for you)
            <input id="nl-name" value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} disabled={!p.editable} className={input} />
          </label>
          <label className={label}>
            Template
            <select id="nl-template" value={template} onChange={(e) => (setTemplate(e.target.value), setDirty(true))} disabled={!p.editable} className={input}>
              {THEMES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {p.editable && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Replace all texts with this template's default texts?")) {
                  setC({ ...themeOf(template).defaults });
                  setDirty(true);
                }
              }}
              className="text-xs underline"
            >
              Use this template&apos;s default texts
            </button>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Inbox</legend>
          {field("subject", "Subject", { hint: "{{nome}} becomes the first name." })}
          {field("preheader", "Preview text", { hint: "The grey line next to the subject in the inbox." })}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Content</legend>
          {imagePicker("imageUrl", "Main image")}
          {field("imageAlt", "Image description", { hint: "Shown when images are blocked." })}
          {field("eyebrow", "Small line above the headline")}
          {field("headline", "Headline")}
          {field("greeting", "Greeting", { hint: "“Olá {{nome}},” → “Olá Maria,”, or “Olá,” when there is no name." })}
          {field("body", "Text", { rows: 6, hint: "Blank line = new paragraph. **text** = bold." })}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Offer and button</legend>
          <label className="flex items-center gap-2 text-sm">
            <input id="nl-offerEnabled" type="checkbox" checked={c.offerEnabled} onChange={(e) => set("offerEnabled", e.target.checked)} disabled={!p.editable} />
            Show the price box
          </label>
          {c.offerEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">{field("offerTitle", "Above the price")}</div>
              {field("offerPrice", "Price")}
              {field("offerOldPrice", "Old price (crossed out)")}
              <div className="col-span-2">{field("offerNote", "Under the price")}</div>
            </div>
          )}
          {field("ctaLabel", "Button text", { hint: "Empty = no button." })}
          {field("ctaUrl", "Button link", { hint: "Links to the shop get campaign tracking (UTM) automatically. /checkout?b=x2 opens the checkout with 2 boxes." })}
          {field("ctaNote", "Under the button")}
          {field("deadline", "Deadline line", { hint: "Empty = no deadline line." })}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Bottom of the e-mail</legend>
          {imagePicker("secondImageUrl", "Second image")}
          {field("bulletsTitle", "List title")}
          {field("bullets", "List (one item per line)", { rows: 4 })}
          {field("closing", "Sign-off", { rows: 2 })}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border bg-white p-4">
          <legend className="px-1 text-sm font-semibold">Who receives it</legend>
          {p.tags.length === 0 ? (
            <p className="text-sm text-muted">No contacts yet: import a list on the Newsletter page.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">No tag ticked = everyone subscribed.</p>
              {p.tags.map(([t, n]) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={aud.tags.includes(t)}
                    disabled={!p.editable}
                    onChange={(e) => {
                      setAud((a) => ({ ...a, tags: e.target.checked ? [...a.tags, t] : a.tags.filter((x) => x !== t) }));
                      setDirty(true);
                    }}
                  />
                  {t} <span className="text-muted">({n})</span>
                </label>
              ))}
            </div>
          )}
          <label className={label}>
            Leave out people who already bought on the site since
            <input
              id="nl-exclude-since"
              type="date"
              value={aud.excludeBuyersSince ?? ""}
              disabled={!p.editable}
              onChange={(e) => {
                setAud((a) => ({ ...a, excludeBuyersSince: e.target.value || null }));
                setDirty(true);
              }}
              className={input}
            />
          </label>
          <p className="text-sm">
            <b className="tabular-nums">{count}</b> people will receive it.
          </p>
        </fieldset>

        <div className="sticky bottom-0 space-y-3 rounded-lg border bg-white p-4 shadow-lg">
          {msg?.error && <p className="text-sm font-medium text-red-700">{msg.error}</p>}
          {msg?.ok && <p className="text-sm font-medium text-green-700">{msg.ok}</p>}
          {p.editable && (
            <button type="button" onClick={save} disabled={pending || !dirty} className="w-full rounded bg-[#0F2340] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? "…" : dirty ? "Save" : "Saved"}
            </button>
          )}
          <div className="flex gap-2">
            <input id="nl-test-to" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" aria-label="Send a test to" />
            <button type="button" disabled={pending || !p.ready} onClick={() => saveThen(() => testCampaignAction(p.id, testTo))} className="rounded border px-3 py-1.5 text-sm font-semibold">
              Send test
            </button>
          </div>
          {p.editable && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                <input id="nl-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" aria-label="Send at (Lisbon time)" />
                <button
                  type="button"
                  disabled={pending || !when || !p.ready}
                  onClick={() => window.confirm(`Schedule for ${count} people?`) && saveThen(() => scheduleCampaignAction(p.id, when))}
                  className="rounded border px-3 py-1.5 text-sm font-semibold"
                >
                  Schedule
                </button>
              </div>
              <button
                type="button"
                disabled={pending || !p.ready}
                onClick={() => window.confirm(`Send now to ${count} people? This cannot be undone once it starts.`) && saveThen(() => scheduleCampaignAction(p.id, "now"))}
                className="w-full rounded bg-[#9E1B22] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Send now to {count} people
              </button>
              <p className="text-xs text-muted">Times are Lisbon time. Send a test to yourself first.</p>
            </div>
          )}
          {(p.status === "scheduled" || p.status === "sending") && (
            <button type="button" disabled={pending} onClick={() => window.confirm("Stop this campaign?") && run(() => cancelCampaignAction(p.id))} className="w-full rounded border border-red-700 px-4 py-2 text-sm font-semibold text-red-700">
              Stop sending
            </button>
          )}
          {p.failed > 0 && (
            <button type="button" disabled={pending} onClick={() => run(() => retryFailedAction(p.id))} className="w-full rounded border px-4 py-2 text-sm font-semibold">
              Retry {p.failed} failed
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="sticky top-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Preview · <b>{c.subject.replace(/\{\{\s*nome\s*\}\}/gi, "Maria")}</b>
            </p>
            <div className="flex overflow-hidden rounded border text-xs">
              {(["desktop", "mobile"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? "bg-[#0F2340] text-white" : "bg-white"}`}>
                  {v === "desktop" ? "Computer" : "Phone"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-paper p-3">
            <iframe title="E-mail preview" srcDoc={preview} sandbox="" className="mx-auto block h-[80vh] rounded bg-white" style={{ width: view === "desktop" ? 620 : 375 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
