import { callHistory } from "@/lib/pt-callers/service";
import { jsonBody, repSession } from "../../guard";

// The lead's call history and summaries, for the dialer (rep: own leads only; admin: any lead).
export async function POST(req: Request) {
  const me = await repSession({ allowAdmin: true });
  if (me instanceof Response) return me;
  return Response.json(await callHistory(me, Number((await jsonBody(req)).leadId)));
}
