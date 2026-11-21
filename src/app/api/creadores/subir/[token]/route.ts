import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { abortMultipart, bucketConfigured, completeMultipart, startMultipart, uploadPart } from "@/lib/bucket";
import { contractByToken } from "@/lib/creator-contract-service";
import { sendCreatorUploadAlert } from "@/lib/email";

// UGC creator video uploads, any size (David, 21/11/2026): the browser cuts each file into parts of PART_SIZE and
// sends them here one by one; each part goes to the bucket as one part of an S3 multipart upload. No CORS on the
// bucket needed, no size limit (10,000 parts × 8 MB = 80 GB per file).
const PART_SIZE = 8 * 1024 * 1024;
export const maxDuration = 300;

const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "video";

async function contractFor(token: string) {
  const c = await contractByToken(token);
  if (!c || c.status !== "signed") return null;
  return c;
}

const Start = z.object({ name: z.string().min(1).max(300), size: z.number().int().min(1), type: z.string().max(120).optional() });
const Complete = z.object({ u: z.number().int(), parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10000), ETag: z.string().min(1).max(200) })).min(1).max(10000) });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = new URL(req.url).searchParams.get("a");
  if (!bucketConfigured()) return Response.json({ error: "Subida no disponible ahora mismo." }, { status: 503 });
  const c = await contractFor(token);
  if (!c) return Response.json({ error: "Primero tienes que firmar el contrato." }, { status: 403 });

  if (a === "start") {
    const p = Start.safeParse(await req.json().catch(() => null));
    if (!p.success) return Response.json({ error: "Archivo no válido." }, { status: 400 });
    const type = p.data.type || "application/octet-stream";
    const key = `private/ugc/${c.id}/${Date.now()}-${safeName(p.data.name)}`;
    const uploadId = await startMultipart(key, type);
    const [row] = await db
      .insert(schema.creatorUploads)
      .values({ contractId: c.id, applicationId: c.applicationId, key, fileName: p.data.name.slice(0, 300), sizeBytes: p.data.size, contentType: type, uploadId })
      .returning({ id: schema.creatorUploads.id });
    return Response.json({ u: row.id, partSize: PART_SIZE });
  }

  const completeBody = a === "complete" ? Complete.safeParse(await req.json().catch(() => null)) : null;
  const u = completeBody?.success ? completeBody.data.u : Number(new URL(req.url).searchParams.get("u"));
  const [row] = await db
    .select()
    .from(schema.creatorUploads)
    .where(and(eq(schema.creatorUploads.id, u || 0), eq(schema.creatorUploads.contractId, c.id)))
    .limit(1);

  if (a === "part") {
    const n = Number(new URL(req.url).searchParams.get("n"));
    if (!row?.uploadId || row.status !== "uploading" || !(n >= 1 && n <= 10000)) return Response.json({ error: "Subida no encontrada." }, { status: 404 });
    const body = new Uint8Array(await req.arrayBuffer());
    if (!body.byteLength || body.byteLength > PART_SIZE) return Response.json({ error: "Parte no válida." }, { status: 400 });
    const etag = await uploadPart(row.key, row.uploadId, n, body);
    return Response.json({ ETag: etag });
  }

  if (a === "complete") {
    const p = completeBody!;
    if (!p.success || !row?.uploadId || row.status !== "uploading") return Response.json({ error: "Subida no encontrada." }, { status: 404 });
    await completeMultipart(row.key, row.uploadId, p.data.parts);
    await db.update(schema.creatorUploads).set({ status: "new", uploadId: null, uploadedAt: new Date() }).where(eq(schema.creatorUploads.id, row.id));
    await sendCreatorUploadAlert(c.creatorName, c.applicationId, row.fileName, row.sizeBytes).catch((e) => console.error("[ugc] upload alert", e));
    return Response.json({ ok: true });
  }

  if (a === "abort") {
    if (row?.uploadId && row.status === "uploading") {
      await abortMultipart(row.key, row.uploadId);
      await db.delete(schema.creatorUploads).where(eq(schema.creatorUploads.id, row.id));
    }
    return Response.json({ ok: true });
  }
  return Response.json({ error: "?" }, { status: 400 });
}
