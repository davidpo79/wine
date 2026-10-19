import { ptService } from "@/lib/pt-callers";
import { handlePtTelnyxWebhook } from "@/lib/pt-callers/telnyx";

// Telnyx Call Control events for the Portugal HR callers' calls, on the
// project's own Telnyx account. Signature verified with PT_TELNYX_PUBLIC_KEY
// only. Events update the technical call state; the rep records the outcome.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const out = await handlePtTelnyxWebhook(
    raw,
    { "telnyx-signature-ed25519": req.headers.get("telnyx-signature-ed25519"), "telnyx-timestamp": req.headers.get("telnyx-timestamp") },
    { env: () => process.env, service: ptService() },
  );
  return Response.json(out.body, { status: out.status });
}
