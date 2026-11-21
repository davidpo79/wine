import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contractByToken } from "@/lib/creator-contract-service";
import { CreatorUpload } from "@/components/creators/CreatorUpload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sube tus vídeos | Wine Portugal", robots: { index: false, follow: false } };

/** A creator uploads their videos (personal link, after signing the contract). */
export default async function SubirPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (locale !== "es") notFound();
  const c = await contractByToken(token);
  if (!c || c.status === "void") notFound();
  const files =
    c.status === "signed"
      ? await db.select().from(schema.creatorUploads).where(eq(schema.creatorUploads.contractId, c.id)).orderBy(desc(schema.creatorUploads.createdAt))
      : [];
  return (
    <CreatorUpload
      token={token}
      name={c.creatorName}
      signed={c.status === "signed"}
      videos={c.videos}
      files={files.filter((f) => f.status !== "uploading").map((f) => ({ id: f.id, name: f.fileName, size: f.sizeBytes, status: f.status, note: f.note }))}
    />
  );
}
