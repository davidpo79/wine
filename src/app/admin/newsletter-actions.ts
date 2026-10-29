"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { bucketConfigured, publicUrl, putObject } from "@/lib/bucket";
import { SITE } from "@/lib/site";
import { lisbonToUtc } from "@/lib/time";
import { THEMES, themeOf, type NewsletterContent } from "@/lib/newsletter/templates";
import { EMAIL_RX, audienceOf, cancelCampaign, cleanTag, normEmail, parseContactsFile, queueCampaign, sendTest, syncFromShop, upsertContacts } from "@/lib/newsletter";
import type { FormState } from "./actions";

const K = schema.newsletterCampaigns;
type Result = { ok?: string; error?: string; url?: string; count?: number };

export async function createCampaignAction(fd: FormData) {
  const me = await requireAdmin({ role: "admin" });
  const template = themeOf(String(fd.get("template") ?? "")).key;
  const name = String(fd.get("name") ?? "").trim().slice(0, 120) || `${themeOf(template).label} ${new Date().getFullYear()}`;
  const [c] = await db.insert(K).values({ name, template, content: { ...themeOf(template).defaults }, createdBy: me.email }).returning({ id: K.id });
  redirect(`/admin/newsletter/${c.id}`);
}

const CONTENT_KEYS = Object.keys(THEMES[0].defaults) as (keyof NewsletterContent)[];

/** Saves the editor (draft or scheduled campaigns only). A scheduled campaign goes back to draft when edited. */
export async function saveCampaignAction(
  id: number,
  input: { name: string; template: string; content: Partial<NewsletterContent>; audience: { tags: string[]; excludeBuyersSince: string | null } },
): Promise<Result> {
  await requireAdmin({ role: "admin" });
  const [c] = await db.select().from(K).where(eq(K.id, id)).limit(1);
  if (!c) return { error: "Campaign not found." };
  if (!["draft", "scheduled"].includes(c.status)) return { error: `A campaign that is ${c.status} cannot be edited. Duplicate it instead.` };
  const content: Record<string, unknown> = {};
  for (const k of CONTENT_KEYS) {
    const v = input.content[k];
    if (typeof v === "boolean") content[k] = v;
    else if (typeof v === "string") content[k] = v.slice(0, k === "body" ? 5000 : 600);
  }
  const audience = {
    tags: (input.audience.tags ?? []).map(cleanTag).filter(Boolean).slice(0, 20),
    excludeBuyersSince: /^\d{4}-\d{2}-\d{2}$/.test(input.audience.excludeBuyersSince ?? "") ? input.audience.excludeBuyersSince : null,
  };
  await db
    .update(K)
    .set({ name: input.name.trim().slice(0, 120) || c.name, template: themeOf(input.template).key, content, audience, status: "draft", scheduledAt: null, updatedAt: new Date() })
    .where(eq(K.id, id));
  if (c.status === "scheduled") await db.delete(schema.newsletterSends).where(and(eq(schema.newsletterSends.campaignId, id), eq(schema.newsletterSends.status, "queued")));
  revalidatePath(`/admin/newsletter/${id}`);
  return { ok: c.status === "scheduled" ? "Saved. The campaign went back to draft: schedule it again." : "Saved." };
}

export async function audienceCountAction(audience: { tags: string[]; excludeBuyersSince: string | null }): Promise<number> {
  await requireAdmin({ role: "admin" });
  return (await audienceOf({ tags: audience.tags ?? [], excludeBuyersSince: audience.excludeBuyersSince || null })).length;
}

export async function testCampaignAction(id: number, to: string): Promise<Result> {
  await requireAdmin({ role: "admin" });
  const email = normEmail(to);
  if (!EMAIL_RX.test(email)) return { error: "Write a valid e-mail address." };
  const [c] = await db.select().from(K).where(eq(K.id, id)).limit(1);
  if (!c) return { error: "Campaign not found." };
  const r = await sendTest(c, email);
  return "error" in r && r.error ? { error: `Not sent: ${r.error}` } : { ok: `Test sent to ${email}.` };
}

/** when: "now" or a Lisbon "YYYY-MM-DDTHH:MM". */
export async function scheduleCampaignAction(id: number, when: string): Promise<Result> {
  await requireAdmin({ role: "admin" });
  let at = new Date();
  if (when !== "now") {
    const m = when.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
    if (!m) return { error: "Pick a date and time." };
    at = lisbonToUtc(m[1], m[2]);
    if (at.getTime() < Date.now() - 60_000) return { error: "That time is in the past." };
  }
  const r = await queueCampaign(id, at);
  revalidatePath(`/admin/newsletter/${id}`);
  revalidatePath("/admin/newsletter");
  if (!r.ok) return { error: r.error };
  return { ok: when === "now" ? `Sending to ${r.count} people. It starts within a minute and takes a few minutes.` : `Scheduled for ${r.count} people.`, count: r.count };
}

export async function cancelCampaignAction(id: number): Promise<Result> {
  await requireAdmin({ role: "admin" });
  await cancelCampaign(id);
  revalidatePath(`/admin/newsletter/${id}`);
  revalidatePath("/admin/newsletter");
  return { ok: "Stopped. Nobody else will receive it." };
}

export async function retryFailedAction(id: number): Promise<Result> {
  await requireAdmin({ role: "admin" });
  const S = schema.newsletterSends;
  const r = await db.update(S).set({ status: "queued", error: null }).where(and(eq(S.campaignId, id), eq(S.status, "failed"))).returning({ id: S.id });
  if (!r.length) return { error: "Nothing failed." };
  await db.update(K).set({ status: "sending", finishedAt: null }).where(eq(K.id, id));
  revalidatePath(`/admin/newsletter/${id}`);
  return { ok: `${r.length} queued again.` };
}

export async function duplicateCampaignAction(fd: FormData) {
  const me = await requireAdmin({ role: "admin" });
  const [c] = await db.select().from(K).where(eq(K.id, Number(fd.get("id")))).limit(1);
  if (!c) return;
  const [n] = await db.insert(K).values({ name: `${c.name} (copy)`, template: c.template, content: c.content, audience: c.audience, createdBy: me.email }).returning({ id: K.id });
  redirect(`/admin/newsletter/${n.id}`);
}

export async function deleteCampaignAction(fd: FormData) {
  await requireAdmin({ role: "admin" });
  const id = Number(fd.get("id"));
  await db.delete(K).where(and(eq(K.id, id), eq(K.status, "draft")));
  redirect("/admin/newsletter");
}

export async function uploadNewsletterImageAction(fd: FormData): Promise<Result> {
  await requireAdmin({ role: "admin" });
  if (!bucketConfigured()) return { error: "The storage bucket is not configured." };
  const f = fd.get("image");
  if (!(f instanceof File) || !f.size) return { error: "Choose an image." };
  if (!/^image\/(jpeg|png|gif)$/.test(f.type)) return { error: "Use JPG, PNG or GIF (e-mail apps do not show WebP everywhere)." };
  if (f.size > 3 * 1024 * 1024) return { error: "Keep e-mail images under 3 MB (ideally under 300 KB)." };
  const ext = f.type.split("/")[1].replace("jpeg", "jpg");
  const key = `public/newsletter/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await putObject(key, Buffer.from(await f.arrayBuffer()), f.type);
  return { ok: "Uploaded.", url: `${SITE.url}${publicUrl(key)}` };
}

export async function importContactsAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return { error: "Choose a CSV or Excel (.xlsx) file." };
  if (!/\.(csv|xlsx|txt)$/i.test(f.name)) return { error: "Use a .csv or .xlsx file." };
  if (f.size > 10 * 1024 * 1024) return { error: "The file is larger than 10 MB." };
  const tag = cleanTag(String(fd.get("tag") ?? "")) || "importado";
  if (fd.get("confirm") !== "on") return { error: "Confirm that these people are your customers or agreed to receive e-mails." };
  let parsed;
  try {
    parsed = parseContactsFile(f.name, new Uint8Array(await f.arrayBuffer()));
  } catch {
    return { error: "Could not read the file. Save it as .xlsx or .csv and try again." };
  }
  if (!parsed.contacts.length) return { error: "No e-mail addresses found. The file needs a column called Email (or E-mail)." };
  const r = await upsertContacts(parsed.contacts, tag, "import");
  revalidatePath("/admin/newsletter");
  return { ok: `Imported with the tag "${tag}": ${r.added} new, ${r.updated} already on the list. Skipped: ${parsed.duplicates} duplicates in the file, ${parsed.invalid} invalid addresses. People who unsubscribed stay unsubscribed.` };
}

export async function syncShopAction(_: FormState): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const r = await syncFromShop();
  revalidatePath("/admin/newsletter");
  return { ok: `Site customers: ${r.buyers}, leads with marketing consent: ${r.leads}. New on the list: ${r.added}.` };
}
