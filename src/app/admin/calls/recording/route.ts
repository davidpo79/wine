import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getObject } from "@/lib/bucket";
import { callingAdmin } from "../guard";

// Plays a stored call recording (private bucket object), for admins.
export async function GET(req: Request) {
  const me = await callingAdmin();
  if (me instanceof Response) return me;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const [r] = id ? await db.select().from(schema.humanCalls).where(eq(schema.humanCalls.id, id)).limit(1) : [];
  if (!r?.recordingKey) return new Response("no recording", { status: 404 });
  const o = await getObject(r.recordingKey);
  const stream = (o.body as unknown as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  return new Response(stream, { headers: { "Content-Type": o.contentType, "Cache-Control": "private, no-store" } });
}
