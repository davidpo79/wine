"use client";

import { useActionState } from "react";
import type { CttConnectionCheck } from "@/lib/ctt";
import { cttTestAction } from "../../actions";
import { Submit } from "../../ui";

export function CttTest() {
  const [r, formAction] = useActionState(cttTestAction, undefined);
  return (
    <form action={formAction} className="mt-6 space-y-3 rounded-lg border bg-white p-5 text-sm">
      <h2 className="font-semibold">CTT: API connection</h2>
      <p className="text-muted">
        Asks CTT for a token (<code>POST /keys/</code>) and makes one read-only call with it (<code>POST /tracking/</code> with an empty list).
        No shipment or label is created and nothing is saved. CTT&apos;s replies are shown exactly as received.
      </p>
      <Submit>Test CTT connection</Submit>
      {r && <Result r={r} />}
    </form>
  );
}

function Result({ r }: { r: CttConnectionCheck }) {
  if (r.state === "not_configured") return <p className="font-medium text-amber-700">{r.message}. Set it in Railway; nothing was sent to CTT.</p>;
  return (
    <div className="space-y-2">
      <p className={`font-medium ${r.state === "ok" ? "text-green-700" : "text-red-700"}`}>
        {r.state === "ok" ? "Connected." : `Failed${r.error ? `: ${r.error}` : "."}`} <span className="font-normal text-muted">{r.base}{r.simulate ? " · X_SIMULATE: 1" : ""}</span>
      </p>
      {r.replies.map((x, i) => (
        <div key={i}>
          <p className="font-mono text-xs font-semibold">
            {x.method} {x.path} → HTTP {x.status}
          </p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 font-mono text-xs">{x.body || "(empty body)"}</pre>
        </div>
      ))}
    </div>
  );
}
