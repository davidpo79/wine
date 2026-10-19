import { optOut } from "@/lib/pt-callers/service";
import { jsonBody, repSession } from "../../guard";

// "Não contactar": permanent block of the person (Apollo id) and the number.
export async function POST(req: Request) {
  const me = await repSession();
  if (me instanceof Response) return me;
  return Response.json(await optOut(me, Number((await jsonBody(req)).leadId)));
}
