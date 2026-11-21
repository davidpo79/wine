import { cookies } from "next/headers";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { sendCreatorAlert } from "@/lib/email";
import { logFunnel } from "@/lib/tracking";
import { UTM_COOKIE, parseUtmCookie } from "@/lib/utm";

// UGC creator applications from /es/creadores (David, 21/11/2026). Stored for Admin → UGC creators, alert by email.
const Body = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().max(60).optional(),
  handle: z.string().trim().min(2).max(120),
  followers: z.string().trim().max(30).optional(),
  portfolio: z.string().trim().max(300).optional(),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Revisa tu nombre, email, perfil y la casilla de privacidad." }, { status: 400 });
  const a = parsed.data;
  // One application per email a day is enough (double clicks, retries).
  const dup = await db
    .select({ id: schema.creatorApplications.id })
    .from(schema.creatorApplications)
    .where(and(eq(schema.creatorApplications.email, a.email), gte(schema.creatorApplications.createdAt, new Date(Date.now() - 24 * 3600_000))))
    .limit(1);
  if (dup.length) return Response.json({ ok: true });
  const jar = await cookies();
  const [row] = await db
    .insert(schema.creatorApplications)
    .values({
      name: a.name,
      email: a.email,
      phone: a.phone || null,
      city: a.city || null,
      handle: a.handle,
      followers: a.followers || null,
      portfolio: a.portfolio || null,
      message: a.message || null,
      utm: parseUtmCookie(jar.get(UTM_COOKIE)?.value),
    })
    .returning();
  await logFunnel("CreatorApplication", `ugc_${row.id}`);
  await sendCreatorAlert(row).catch((e) => console.error("[creadores] alert", e));
  return Response.json({ ok: true });
}
