"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { login, logout, requireAdmin } from "@/lib/auth";
import { clientIp } from "@/lib/request";
import { getOrder, logOrderEvent, setStatus } from "@/lib/orders";
import { ebookLink, sendConfirmation, sendShipped } from "@/lib/email";
import { parseEuroToCents } from "@/lib/money";
import { PER_BOX_FLOOR_CENTS, type PostCutoffMode } from "@/lib/settings-defaults";
import { setSetting } from "@/lib/settings";
import { bucketConfigured, putObject } from "@/lib/bucket";
import { lisbonToUtc } from "@/lib/time";

export type FormState = { error?: string; ok?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const ip = clientIp(await headers()) ?? "unknown";
  const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), ip);
  if (!r.ok) return { error: r.error };
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

async function orderOr404(id: string) {
  const o = await getOrder(id);
  if (!o) throw new Error("Order not found");
  return o;
}

export async function orderAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id"));
  const action = String(fd.get("action"));
  const o = await orderOr404(id);
  const by = { by: admin.email };
  try {
    switch (action) {
      case "preparing":
      case "delivered":
      case "cancelled": {
        const r = await setStatus(o, action as OrderStatus, {}, by);
        if (!r) return { error: `Cannot change status from "${o.status}" to "${action}".` };
        break;
      }
      case "shipped": {
        const tracking = String(fd.get("tracking") ?? "").trim().toUpperCase();
        if (!/^[A-Z0-9]{8,30}$/.test(tracking)) return { error: "Invalid CTT tracking number." };
        const r = await setStatus(o, "shipped", { trackingNumber: tracking }, { ...by, tracking });
        if (!r) return { error: `Cannot mark as shipped from "${o.status}".` };
        await sendShipped(r);
        break;
      }
      case "note": {
        const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
        if (!note) return { error: "Note is empty." };
        const notes = [o.notes, `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${admin.email}] ${note}`].filter(Boolean).join("\n");
        await db.update(schema.orders).set({ notes }).where(eq(schema.orders.id, id));
        await logOrderEvent(id, "note", { ...by, note });
        break;
      }
      case "resend_confirmation":
      case "regenerate_ebook": {
        if (!["paid", "preparing", "shipped", "delivered"].includes(o.status)) return { error: "Only for paid orders." };
        // Each send generates a fresh 7-day e-book link.
        await sendConfirmation(o);
        await db.update(schema.orders).set({ ebookKeyIssuedAt: new Date() }).where(eq(schema.orders.id, id));
        await logOrderEvent(id, action, by);
        if (action === "regenerate_ebook") {
          const link = await ebookLink();
          revalidatePath(`/admin/orders/${id}`);
          return { ok: link ? `Email resent. New link (valid 7 days): ${link}` : "Email resent (no e-book in the bucket yet)." };
        }
        break;
      }
      case "invoice": {
        const inv = String(fd.get("invoice") ?? "").trim().slice(0, 60);
        if (!inv) return { error: "Invoice number is empty." };
        await db.update(schema.orders).set({ invoiceNumber: inv }).where(eq(schema.orders.id, id));
        await logOrderEvent(id, "invoice_recorded", { ...by, invoice: inv });
        break;
      }
      default:
        return { error: "Unknown action." };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/admin/orders/${id}`);
  return { ok: "Done." };
}

export async function bundleAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const qty = Number(fd.get("qty"));
  const price = parseEuroToCents(String(fd.get("price") ?? ""));
  const compareRaw = String(fd.get("compare_at") ?? "").trim();
  const compare = compareRaw ? parseEuroToCents(compareRaw) : null;
  const shipping = parseEuroToCents(String(fd.get("shipping") ?? "0"));
  const label = String(fd.get("label") ?? "").trim();
  const badge = String(fd.get("badge") ?? "").trim() || null;
  const sort = Number(fd.get("sort") ?? 0);
  const active = fd.get("active") === "on";
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { error: "Invalid quantity." };
  if (price == null || shipping == null || (compareRaw && compare == null)) return { error: "Invalid euro amounts (e.g. 84,90)." };
  if (!label) return { error: "Label is required." };
  // Floor rule: never below €39,00 per box, to protect the B2B channel.
  if (price / qty < PER_BOX_FLOOR_CENTS) {
    return { error: `Price per box (€${(price / qty / 100).toFixed(2)}) is below the €${(PER_BOX_FLOOR_CENTS / 100).toFixed(2)} floor.` };
  }
  if (compare != null && compare <= price) return { error: "Compare-at price must be higher than the price." };
  await db
    .update(schema.bundles)
    .set({ qty, priceCents: price, compareAtCents: compare, shippingCents: shipping, label, badge, sort, active })
    .where(eq(schema.bundles.id, id));
  revalidatePath("/admin/products");
  return { ok: "Saved." };
}

export async function productAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
  if (!p) return { error: "Product not found." };
  const intent = String(fd.get("intent"));
  let images = [...p.images];
  if (intent === "upload") {
    if (!bucketConfigured()) return { error: "Bucket is not configured." };
    const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp|avif)$/.test(f.type)) return { error: `Unsupported format: ${f.name}` };
      if (f.size > 8 * 1024 * 1024) return { error: `File too large: ${f.name}` };
      const ext = f.type.split("/")[1].replace("jpeg", "jpg");
      const key = `public/products/${p.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await putObject(key, Buffer.from(await f.arrayBuffer()), f.type);
      images.push(key);
    }
  } else if (intent === "remove") {
    const key = String(fd.get("key"));
    images = images.filter((k) => k !== key);
  } else if (intent === "up" || intent === "down") {
    const key = String(fd.get("key"));
    const i = images.indexOf(key);
    const j = intent === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < images.length) [images[i], images[j]] = [images[j], images[i]];
  } else if (intent === "details") {
    const shortDescription = String(fd.get("short_description") ?? "").trim();
    await db.update(schema.products).set({ shortDescription }).where(eq(schema.products.id, id));
    revalidatePath("/admin/products");
    return { ok: "Saved." };
  }
  await db.update(schema.products).set({ images }).where(eq(schema.products.id, id));
  revalidatePath("/admin/products");
  return { ok: "Images updated." };
}

export async function settingsAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const date = String(fd.get("cutoff_date") ?? "");
  const time = String(fd.get("cutoff_time") ?? "23:59");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Invalid date/time." };
  const cutoff = lisbonToUtc(date, time);
  const stockRaw = String(fd.get("stock_cap") ?? "").trim();
  const stock = stockRaw === "" ? null : Number(stockRaw);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return { error: "Invalid stock value." };
  const mode = String(fd.get("post_cutoff_mode")) as PostCutoffMode;
  if (mode !== "closed" && mode !== "after_christmas") return { error: "Invalid mode." };
  const announcement = String(fd.get("announcement") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  await setSetting("cutoff_at", cutoff.toISOString());
  await setSetting("sales_open", fd.get("sales_open") === "on");
  await setSetting("post_cutoff_mode", mode);
  await setSetting("announcement", announcement);
  await setSetting("stock_cap_boxes", stock);
  const previews = String(fd.get("ebook_previews") ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^public\/[\w./-]+$/.test(x))
    .slice(0, 6);
  await setSetting("ebook_previews", previews);
  const code = String(fd.get("lead_code") ?? "").trim().toUpperCase();
  const pct = Number(fd.get("lead_discount_percent"));
  const maxQty = Number(fd.get("lead_code_max_qty"));
  if (code && !/^[A-Z0-9]{3,20}$/.test(code)) return { error: "Code must be 3-20 letters/digits." };
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) return { error: "Discount must be between 0 and 30%." };
  if (!Number.isInteger(maxQty) || maxQty < 1) return { error: "Invalid max boxes for the code." };
  await setSetting("exit_popup_enabled", fd.get("exit_popup_enabled") === "on");
  await setSetting("lead_code", code);
  await setSetting("lead_discount_percent", pct);
  await setSetting("lead_code_max_qty", maxQty);
  const plus = String(fd.get("lead_plus_code") ?? "").trim().toUpperCase();
  if (plus && (!/^[A-Z0-9]{3,20}$/.test(plus) || plus === code)) return { error: "Step-2 code must be 3-20 letters/digits and different from the main code." };
  await setSetting("lead_plus_code", plus);
  await setSetting("recovery_enabled", fd.get("recovery_enabled") === "on");
  await setSetting("delivery_text", String(fd.get("delivery_text") ?? "").trim().slice(0, 120));
  revalidatePath("/admin/settings");
  return { ok: "Settings saved." };
}

const CONTACT_STATUSES = ["new", "contacted", "no_answer", "not_interested", "converted"];

export async function leadAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const status = String(fd.get("contact_status") ?? "new");
  if (!CONTACT_STATUSES.includes(status)) return { error: "Invalid status." };
  const notes = String(fd.get("contact_notes") ?? "").trim().slice(0, 1000) || null;
  await db.update(schema.leads).set({ contactStatus: status, contactNotes: notes }).where(eq(schema.leads.id, id));
  revalidatePath("/admin/leads");
  return { ok: "Saved." };
}

export async function creativeAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  // One decision applies to all formats (1x1, 4x5, 9x16) of the same ad.
  const ids = fd.getAll("ids").map(Number).filter(Number.isInteger);
  if (ids.length === 0) ids.push(Number(fd.get("id")));
  const decision = String(fd.get("decision"));
  const feedback = String(fd.get("feedback") ?? "").trim().slice(0, 2000) || null;
  if (decision !== "approved" && decision !== "rejected" && decision !== "draft") return { error: "Invalid decision." };
  if (decision === "rejected" && !feedback) return { error: "Please add the reason for rejecting so it can be fixed." };
  await db.update(schema.creatives).set({ status: decision, feedback }).where(inArray(schema.creatives.id, ids));
  revalidatePath("/admin/creatives");
  return { ok: decision === "approved" ? "Approved." : decision === "rejected" ? "Rejected." : "Reset." };
}
