import { setOutcome } from "@/lib/pt-callers/service";
import { jsonBody, repSession } from "../../guard";

export async function POST(req: Request) {
  const me = await repSession();
  if (me instanceof Response) return me;
  const b = await jsonBody(req);
  const r = await setOutcome(me, Number(b.leadId), { status: String(b.status ?? ""), note: typeof b.note === "string" ? b.note : undefined, callbackAt: typeof b.callbackAt === "string" ? b.callbackAt : undefined });
  return Response.json(r);
}
