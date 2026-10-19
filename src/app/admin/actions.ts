"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/db/schema";
import { hashPassword, login, logout, requireAdmin, setSessionCookie } from "@/lib/auth";
import { clientIp } from "@/lib/request";
import { getOrder, logOrderEvent, setStatus } from "@/lib/orders";
import { ebookLink, sendConfirmation, sendShipped, sendTeamInvite, sendTestEmail } from "@/lib/email";
import { orderAddons, refundOrder } from "@/lib/payments";
import { parseEuroToCents } from "@/lib/money";
import { PER_BOX_FLOOR_CENTS, type PostCutoffMode, type Settings } from "@/lib/settings-defaults";
import { resnapshotAll } from "@/lib/profit";
import { getSettings, setSetting } from "@/lib/settings";
import { bucketConfigured, putObject } from "@/lib/bucket";
import { lisbonToUtc } from "@/lib/time";
import { COUNTRIES, isLocale } from "@/lib/markets";
import { ebookKey } from "@/lib/ebook";

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
  if (admin.role !== "admin" && ["cancelled", "refund_api", "refund_manual"].includes(action)) return { error: "Only admins can cancel or refund orders." };
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
      case "ctt_label": {
        const { createCttLabel } = await import("@/lib/fulfilment");
        const r = await createCttLabel(o, admin);
        if ("error" in r) return { error: r.error };
        revalidatePath(`/admin/orders/${id}`);
        if (r.reused) return { ok: `Label already created · tracking ${r.trackingId} (stored copy, CTT not called again).` };
        return { ok: r.trackingId ? `Label ready · tracking ${r.trackingId}` : "Label ready." };
      }
      case "note": {
        const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
        if (!note) return { error: "Note is empty." };
        const notes = [o.notes, `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${admin.email}] ${note}`].filter(Boolean).join("\n");
        await db.update(schema.orders).set({ notes }).where(eq(schema.orders.id, id));
        await logOrderEvent(id, "note", { ...by, note });
        break;
      }
      case "refund_api":
      case "refund_manual": {
        const r = await refundOrder(o, action === "refund_api" ? "api" : "manual");
        if (!r.ok) return { error: r.error };
        await logOrderEvent(id, "refunded", { ...by, mode: action });
        break;
      }
      case "resend_confirmation":
      case "regenerate_ebook": {
        if (!["paid", "preparing", "shipped", "delivered"].includes(o.status)) return { error: "Only for paid orders." };
        // Each send generates a fresh 7-day e-book link.
        await sendConfirmation(o, await orderAddons(o.id, ["paid"]));
        await db.update(schema.orders).set({ ebookKeyIssuedAt: new Date() }).where(eq(schema.orders.id, id));
        await logOrderEvent(id, action, by);
        if (action === "regenerate_ebook") {
          const link = await ebookLink(isLocale(o.locale) ? o.locale : "pt");
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
  await requireAdmin({ role: "admin" });
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
  await requireAdmin({ role: "admin" });
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
  await requireAdmin({ role: "admin" });
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
  await setSetting("upsell_enabled", fd.get("upsell_enabled") === "on");
  const prev = (await getSettings()).upsell_products;
  const products = [];
  for (let i = 0; fd.get(`up_key_${i}`) !== null; i++) {
    const price = parseEuroToCents(String(fd.get(`up_price_${i}`) ?? ""));
    const compare = parseEuroToCents(String(fd.get(`up_compare_${i}`) ?? ""));
    if (price == null || compare == null) return { error: "Invalid upsell price." };
    const key = String(fd.get(`up_key_${i}`));
    const old = prev.find((p) => p.key === key);
    products.push({
      key,
      name: String(fd.get(`up_name_${i}`) ?? old?.name ?? "").trim(),
      description: String(fd.get(`up_desc_${i}`) ?? old?.description ?? "").trim(),
      price_cents: price,
      compare_cents: compare,
      active: fd.get(`up_active_${i}`) === "on",
      image: (() => {
        const img = String(fd.get(`up_image_${i}`) ?? old?.image ?? "").trim();
        return /^(https:\/\/|\/)[^\s"'<>]{1,400}$/.test(img) ? img : undefined;
      })(),
    });
  }
  if (products.length) await setSetting("upsell_products", products);
  if (fd.get("gc_price") !== null) {
    const gcPrice = parseEuroToCents(String(fd.get("gc_price") ?? ""));
    const gcCost = parseEuroToCents(String(fd.get("gc_cost") ?? "0") || "0");
    const gcVat = Number(String(fd.get("gc_vat") ?? "23").replace(",", "."));
    if (gcPrice == null || gcPrice <= 0 || gcCost == null || !Number.isFinite(gcVat) || gcVat < 0 || gcVat > 30) return { error: "Invalid gift card price, cost or VAT." };
    await setSetting("gift_card", { enabled: fd.get("gc_enabled") === "on", price_cents: gcPrice, cost_cents: gcCost, vat_percent: gcVat });
  }
  const reviews = String(fd.get("reviews") ?? "")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p.length >= 3 && p[0] && p[2])
    .slice(0, 12)
    .map(([name, city, text, source]) => ({ name, city: city || undefined, text, source: source || undefined }));
  await setSetting("reviews", reviews);
  await setSetting("delivery_text", String(fd.get("delivery_text") ?? "").trim().slice(0, 120));
  if (fd.get("mk_PT_days") !== null) {
    const markets = Object.fromEntries(
      COUNTRIES.map((c) => {
        const day = String(fd.get(`mk_${c}_cutoff`) ?? "").trim();
        const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(day) ? lisbonToUtc(day, "23:59") : null;
        return [c, { enabled: fd.get(`mk_${c}_enabled`) === "on", delivery_days: String(fd.get(`mk_${c}_days`) ?? "").trim().slice(0, 20), cutoff_at: cutoff && !Number.isNaN(cutoff.getTime()) ? cutoff.toISOString() : null }];
      }),
    ) as Settings["markets"];
    if (!Object.values(markets).some((m) => m.enabled)) return { error: "At least one country must stay open." };
    await setSetting("markets", markets);
  }
  revalidatePath("/admin/settings");
  return { ok: "Settings saved." };
}

const CONTACT_STATUSES = ["new", "contacted", "no_answer", "not_interested", "converted"];

export async function leadAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const id = Number(fd.get("id"));
  const status = String(fd.get("contact_status") ?? "new");
  if (!CONTACT_STATUSES.includes(status)) return { error: "Invalid status." };
  const notes = String(fd.get("contact_notes") ?? "").trim().slice(0, 1000) || null;
  await db.update(schema.leads).set({ contactStatus: status, contactNotes: notes }).where(eq(schema.leads.id, id));
  revalidatePath("/admin/leads");
  return { ok: "Saved." };
}

export async function creativeAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
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

// ---- Finance -------------------------------------------------------------------------------------

const euro = (fd: FormData, name: string) => parseEuroToCents(String(fd.get(name) ?? "0") || "0");
const pct = (fd: FormData, name: string) => {
  const n = Number(String(fd.get(name) ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export async function costModelAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const settings = await getSettings();
  const vat = pct(fd, "vat_percent");
  const fields = ["wine_per_box", "gift_box", "shipping_box", "other_per_order"].map((k) => euro(fd, k));
  if (vat == null || fields.some((v) => v == null)) return { error: "Invalid amount (use 12,50) or percentage." };
  const tiers: { max_boxes: number; cents: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const max = Number(fd.get(`tier_max_${i}`) ?? "");
    const raw = String(fd.get(`tier_cost_${i}`) ?? "").trim();
    if (!raw && !max) continue;
    const c = parseEuroToCents(raw);
    if (!Number.isInteger(max) || max < 1 || c == null) return { error: `Delivery row ${i + 1}: boxes must be a whole number and cost an amount.` };
    tiers.push({ max_boxes: max, cents: c });
  }
  if (!tiers.length) return { error: "Add at least one delivery row." };
  const fees = {} as Settings["cost_model"]["payment_fees"];
  for (const k of ["card", "mb_way", "multibanco", "other"] as const) {
    const p = pct(fd, `fee_pct_${k}`);
    const f = euro(fd, `fee_fixed_${k}`);
    if (p == null || f == null) return { error: `Invalid payment fee for ${k}.` };
    fees[k] = { percent: p, fixed_cents: f };
  }
  const [wine, gift, ship, other] = fields as number[];
  const model = { vat_percent: vat, wine_per_box_cents: wine, gift_box_cents: gift, shipping_box_cents: ship, delivery_tiers: tiers.sort((a, b) => a.max_boxes - b.max_boxes), payment_fees: fees, other_per_order_cents: other };
  await setSetting("cost_model", model);
  // Cost of the extra products offered in the upsell.
  const products = settings.upsell_products.map((p) => {
    const c = parseEuroToCents(String(fd.get(`product_cost_${p.key}`) ?? "") || "0");
    return { ...p, cost_cents: c ?? p.cost_cents ?? 0 };
  });
  await setSetting("upsell_products", products);
  let msg = "Costs saved. New orders use them.";
  if (fd.get("apply_past") === "on") {
    const n = await resnapshotAll({ cost_model: model, upsell_products: products, gift_card: settings.gift_card });
    msg = `Costs saved and applied to ${n} past paid orders.`;
  }
  revalidatePath("/admin/finance");
  return { ok: msg };
}

export async function profitSplitAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const name = (k: string, d: string) => String(fd.get(k) ?? "").trim().slice(0, 40) || d;
  const rawPct = String(fd.get("my_percent") ?? "").trim();
  const rawMin = String(fd.get("min_per_box") ?? "").trim();
  const p = rawPct ? pct(fd, "my_percent") : null;
  if (rawPct && (p == null || p > 100)) return { error: "Your share must be a percentage between 0 and 100 (or empty)." };
  const min = rawMin ? parseEuroToCents(rawMin) : null;
  if (rawMin && min == null) return { error: "Invalid minimum per box (use 2,00 or leave empty)." };
  await setSetting("profit_split", { my_name: name("my_name", "David"), partner_name: name("partner_name", "Partner"), my_percent: p, min_per_box_cents: min });
  revalidatePath("/admin/finance");
  return { ok: p == null ? "Saved. The split stays open until you enter your share." : "Profit split saved." };
}

export async function expenseAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  if (fd.get("action") === "delete") {
    await db.delete(schema.expenses).where(eq(schema.expenses.id, Number(fd.get("id"))));
    revalidatePath("/admin/finance");
    return { ok: "Deleted." };
  }
  const date = String(fd.get("date") ?? "");
  const endDate = String(fd.get("end_date") ?? "") || null;
  const amount = parseEuroToCents(String(fd.get("amount") ?? ""));
  const category = String(fd.get("category") ?? "other").slice(0, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date))) return { error: "Invalid date range." };
  if (amount == null || amount <= 0) return { error: "Invalid amount (use 120,00)." };
  await db.insert(schema.expenses).values({ date, endDate, category, description: String(fd.get("description") ?? "").trim().slice(0, 200), amountCents: amount });
  revalidatePath("/admin/finance");
  return { ok: "Expense added." };
}

export async function giftCardAction(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const ids = String(fd.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 300);
  for (const id of ids) await logOrderEvent(id, "gift_card_printed", { by: admin.email });
  revalidatePath("/admin/gift-cards");
  return { ok: `${ids.length} card${ids.length === 1 ? "" : "s"} marked as printed.` };
}

// ---- Team (admins only) ---------------------------------------------------------------------------

function tempPassword() {
  // 14 chars, no look-alike characters; shown once to the admin who creates or resets the account.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
}

async function adminCount() {
  const rows = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(and(eq(schema.adminUsers.role, "admin"), isNull(schema.adminUsers.disabledAt)));
  return rows.length;
}

export async function teamAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ role: "admin" });
  const action = String(fd.get("action") ?? "");
  if (action === "add") {
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const role = fd.get("role") === "admin" ? "admin" : "fulfilment";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
    const [exists] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email)).limit(1);
    if (exists) return { error: "This email already has an account." };
    const pw = tempPassword();
    await db.insert(schema.adminUsers).values({ email, role, passwordHash: await hashPassword(pw), mustChangePassword: true, createdBy: me.email });
    revalidatePath("/admin/team");
    let mailed = "";
    if (fd.get("send_email") === "on") {
      const r = (await sendTeamInvite(email, role, pw, me.email)) as { skipped?: boolean; error?: { message?: string } | string | null } | undefined;
      const err = r && "error" in r && r.error ? (typeof r.error === "string" ? r.error : r.error.message) : null;
      mailed = r?.skipped ? " Email NOT sent: email is not configured (RESEND_API_KEY / EMAIL_FROM)." : err ? ` Email NOT sent: ${err}.` : " Login details emailed.";
    }
    return { ok: `Account created for ${email} (${role}). Temporary password: ${pw} (shown once; they choose their own at first login).${mailed}` };
  }
  const id = Number(fd.get("id"));
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, id)).limit(1);
  if (!u) return { error: "User not found." };
  const isLastAdmin = u.role === "admin" && !u.disabledAt && (await adminCount()) <= 1;
  if (u.id === me.id && ["disable", "delete", "role"].includes(action)) return { error: "You cannot change your own access. Ask another admin." };
  switch (action) {
    case "role": {
      const role = fd.get("role") === "admin" ? "admin" : "fulfilment";
      if (role !== "admin" && isLastAdmin) return { error: "Keep at least one active admin." };
      await db.update(schema.adminUsers).set({ role }).where(eq(schema.adminUsers.id, id));
      break;
    }
    case "disable":
      if (isLastAdmin) return { error: "Keep at least one active admin." };
      // Bumping the session version logs them out everywhere immediately.
      await db.update(schema.adminUsers).set({ disabledAt: new Date(), sessionVersion: sql`${schema.adminUsers.sessionVersion} + 1` }).where(eq(schema.adminUsers.id, id));
      break;
    case "enable":
      await db.update(schema.adminUsers).set({ disabledAt: null }).where(eq(schema.adminUsers.id, id));
      break;
    case "reset": {
      const pw = tempPassword();
      await db.update(schema.adminUsers).set({ passwordHash: await hashPassword(pw), mustChangePassword: true, sessionVersion: sql`${schema.adminUsers.sessionVersion} + 1` }).where(eq(schema.adminUsers.id, id));
      revalidatePath("/admin/team");
      return { ok: `New temporary password for ${u.email}: ${pw} (shown once).` };
    }
    case "delete":
      if (isLastAdmin) return { error: "Keep at least one active admin." };
      await db.delete(schema.adminUsers).where(eq(schema.adminUsers.id, id));
      break;
    default:
      return { error: "Unknown action." };
  }
  revalidatePath("/admin/team");
  return { ok: "Saved." };
}

export async function passwordAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ allowPasswordChange: true });
  const pw = String(fd.get("password") ?? "");
  const pw2 = String(fd.get("password2") ?? "");
  if (pw.length < 12) return { error: "Use at least 12 characters." };
  if (pw !== pw2) return { error: "The two passwords do not match." };
  const [u] = await db
    .update(schema.adminUsers)
    .set({ passwordHash: await hashPassword(pw), mustChangePassword: false, sessionVersion: sql`${schema.adminUsers.sessionVersion} + 1` })
    .where(eq(schema.adminUsers.id, me.id))
    .returning();
  await setSessionCookie(u.id, u.sessionVersion); // other devices are logged out, this one stays in
  redirect(u.role === "admin" ? "/admin" : "/admin/orders");
}

/** Sends one test event to GA4 through the Measurement Protocol (the same path as the server-side purchase). */
export async function ga4TestAction(_: FormState, _fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const mid = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  if (!mid) return { error: "GA4_MEASUREMENT_ID is not set in Railway." };
  if (!secret) return { error: "GA4_API_SECRET is not set in Railway (or the service has not redeployed since)." };
  const body = JSON.stringify({
    client_id: `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`,
    events: [{ name: "server_check", params: { debug_mode: 1, engagement_time_msec: 1, source: "admin_settings" } }],
  });
  const q = `measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`;
  try {
    const check = await fetch(`https://www.google-analytics.com/debug/mp/collect?${q}`, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const v = (await check.json().catch(() => ({}))) as { validationMessages?: { description?: string }[] };
    if (v.validationMessages?.length) return { error: `GA4 rejected the event: ${v.validationMessages.map((m) => m.description).join("; ")}` };
    const r = await fetch(`https://www.google-analytics.com/mp/collect?${q}`, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: `GA4 answered ${r.status}.` };
  } catch (e) {
    return { error: `Could not reach GA4: ${String(e)}` };
  }
  return { ok: `Sent "server_check" to ${mid}. It should appear within a minute in GA4 → Admin → DebugView (and Reports → Realtime). If it does not, the API secret does not belong to this data stream.` };
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Admin → Inbox: answer a conversation (threaded under the customer's last message) or write a new email. */
export async function inboxSendAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const { sendManual } = await import("@/lib/inbox");
  const to = String(fd.get("to") ?? "").trim().toLowerCase();
  const subject = String(fd.get("subject") ?? "").trim();
  const text = String(fd.get("text") ?? "").trim();
  const replyMessageId = String(fd.get("reply_message_id") ?? "").trim() || null;
  if (!EMAIL_RE.test(to)) return { error: "Invalid recipient email." };
  if (!subject) return { error: "Subject is required." };
  if (!text) return { error: "Write a message first." };
  if (text.length > 20000) return { error: "Message too long." };
  const r = await sendManual({ to, subject, text, sentBy: me.email, replyTo: replyMessageId ? { messageId: replyMessageId, subject } : null });
  if ("error" in r && r.error) return { error: `Not sent: ${r.error}` };
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${encodeURIComponent(to)}`);
  if (fd.get("new") === "1") redirect(`/admin/inbox/${encodeURIComponent(to)}`);
  return { ok: "Sent." };
}

/** Admin → Reviews: approve, reject (abusive content or personal data only), reply publicly, delete. */
export async function reviewAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ role: "admin" });
  const id = Number(fd.get("id"));
  const op = String(fd.get("op") ?? "");
  if (!Number.isInteger(id)) return { error: "Unknown review." };
  if (op === "delete") {
    await db.delete(schema.reviews).where(eq(schema.reviews.id, id));
  } else if (op === "approve" || op === "reject" || op === "pending") {
    const status = op === "approve" ? "approved" : op === "reject" ? "rejected" : "pending";
    await db.update(schema.reviews).set({ status, moderatedBy: me.email, moderatedAt: new Date() }).where(eq(schema.reviews.id, id));
  } else if (op === "reply") {
    const reply = String(fd.get("reply") ?? "").trim().slice(0, 2000) || null;
    await db.update(schema.reviews).set({ reply }).where(eq(schema.reviews.id, id));
  } else return { error: "Unknown action." };
  revalidatePath("/admin/reviews");
  revalidatePath("/");
  return { ok: "Saved." };
}

export async function reviewsSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  await setSetting("reviews_enabled", fd.get("reviews_enabled") === "on");
  revalidatePath("/admin/reviews");
  return { ok: "Saved." };
}

/** Admin → Settings: checks the CTT API keys without creating anything. */
export async function cttTestAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin({ role: "admin" });
  const { cttTestConnection } = await import("@/lib/ctt");
  const appId = String(fd.get("app_id") ?? "").trim().slice(0, 100) || undefined;
  const r = await cttTestConnection(appId);
  const text = `${r.ok ? "Connected." : "Not connected."}\n${r.steps.join("\n")}`;
  return r.ok ? { ok: text } : { error: text };
}

/** Admin → Email & messages: sends a test email and reports the provider's answer. */
export async function testEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ role: "admin" });
  const to = String(fd.get("to") ?? "").trim() || me.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "Enter a valid email." };
  const r = (await sendTestEmail(to)) as { skipped?: boolean; data?: { id?: string } | null; error?: { message?: string; name?: string } | string | null; id?: string } | undefined;
  if (r?.skipped) return { error: "Not sent: email is not configured. Set RESEND_API_KEY and EMAIL_FROM in Railway." };
  const err = r?.error ? (typeof r.error === "string" ? r.error : `${r.error.name ?? ""} ${r.error.message ?? ""}`.trim()) : null;
  if (err) return { error: `Not sent. The provider answered: ${err}` };
  return { ok: `Sent to ${to} (id ${r?.data?.id ?? r?.id ?? "?"}). Check the inbox and the spam folder.` };
}

/** Admin → Settings → Gift e-book: upload a language edition (PDF) to the private bucket, or switch editions on and off. */
export async function ebookAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin({ role: "admin" });
  const settings = await getSettings();
  if (fd.get("action") === "upload") {
    const locale = String(fd.get("locale") ?? "");
    if (!isLocale(locale)) return { error: "Choose a language." };
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Choose the PDF file." };
    if (file.size > 24 * 1024 * 1024) return { error: "The PDF is larger than 24 MB." };
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "That file is not a PDF." };
    if (!bucketConfigured()) return { error: "The storage bucket is not configured." };
    await putObject(ebookKey(locale), buf, "application/pdf");
    await setSetting("ebook_files", { ...(settings.ebook_files ?? {}), [locale]: { uploaded_at: new Date().toISOString(), bytes: buf.length, by: me.email } });
    if (locale !== "pt" && !(settings.ebook_locales ?? []).includes(locale)) await setSetting("ebook_locales", [...(settings.ebook_locales ?? []), locale]);
    revalidatePath("/admin/settings");
    return { ok: `Uploaded the ${locale.toUpperCase()} edition (${(buf.length / 1048576).toFixed(1)} MB). ${locale === "pt" ? "" : "Customers in this language now get it."}` };
  }
  const locale = String(fd.get("locale") ?? "");
  const action = fd.get("action");
  if (!isLocale(locale) || (action !== "on" && action !== "off")) return { error: "Choose a language." };
  if (locale === "pt") return { error: "Portuguese is always offered." };
  if (action === "on" && !settings.ebook_files?.[locale]) return { error: `Upload the ${locale.toUpperCase()} PDF first.` };
  const rest = (settings.ebook_locales ?? []).filter((l) => l !== locale);
  await setSetting("ebook_locales", action === "on" ? [...rest, locale] : rest);
  revalidatePath("/admin/settings");
  return { ok: `${locale.toUpperCase()}: ${action === "on" ? "customers in this language get the e-book." : "turned off."}` };
}
