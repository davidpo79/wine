import { getObject } from "@/lib/bucket";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.join("/");
  if (path.includes("..")) return new Response("not found", { status: 404 });
  try {
    const obj = await getObject(`public/${path}`);
    const body = obj.body as unknown as { transformToWebStream: () => ReadableStream };
    return new Response(body.transformToWebStream(), {
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
