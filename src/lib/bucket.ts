import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

export function bucketConfigured() {
  return Boolean(process.env.BUCKET_ENDPOINT && process.env.BUCKET_NAME && process.env.BUCKET_ACCESS_KEY_ID);
}

function s3() {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.BUCKET_ENDPOINT,
      region: process.env.BUCKET_REGION || "auto",
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.BUCKET_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

const Bucket = () => process.env.BUCKET_NAME!;

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  if (!key.startsWith("public/") && !key.startsWith("private/")) throw new Error("key must start with public/ or private/");
  await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ContentType: contentType }));
  return key;
}

export async function getObject(key: string) {
  const r = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key }));
  return { body: r.Body, contentType: r.ContentType ?? "application/octet-stream", length: r.ContentLength };
}

/** Size and date of an object, or null when the key does not exist. */
export async function headObject(key: string) {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
    return { bytes: r.ContentLength ?? 0, lastModified: r.LastModified ?? null, contentType: r.ContentType ?? null };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (e as Error).name === "NotFound") return null;
    throw e;
  }
}

/** The first bytes of an object (a ranged read, so a large file is not downloaded). */
export async function readHead(key: string, bytes: number) {
  const r = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return Buffer.from((await r.Body?.transformToByteArray()) ?? []);
}

export async function presignedGet(key: string, expiresInSeconds: number, downloadName?: string) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: Bucket(),
      Key: key,
      ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
    }),
    { expiresIn: expiresInSeconds },
  );
}

/** URL the browser can load for a bucket key under public/ (proxied through the app, never exposing credentials). */
export function publicUrl(key: string) {
  if (key.startsWith("/")) return key; // static file in /public
  return `/media/${key.replace(/^public\//, "")}`;
}
