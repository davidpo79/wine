import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  pgSequence,
} from "drizzle-orm/pg-core";

export type WineItem = { name: string; vintage: string; type: "rose" | "branco" | "tinto"; producer: string };
export type Address = {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};
export type Utm = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term", string>>;

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1, increment: 1 });

export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "payment_failed",
  "cancelled",
  "refunded",
]);
export type OrderStatus = (typeof orderStatus.enumValues)[number];

export const creativeStatus = pgEnum("creative_status", ["draft", "approved", "rejected"]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortDescription: text("short_description").notNull().default(""),
  wines: jsonb("wines").$type<WineItem[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bundles = pgTable(
  "bundles",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    qty: integer("qty").notNull(),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    shippingCents: integer("shipping_cents").notNull().default(0),
    badge: text("badge"),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("bundles_product_key").on(t.productId, t.key)],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // WP-2026-0001
    status: orderStatus("status").notNull().default("pending_payment"),
    bundleId: integer("bundle_id")
      .notNull()
      .references(() => bundles.id),
    bundleKey: text("bundle_key").notNull(),
    qtyBoxes: integer("qty_boxes").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("eur"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paymentMethodType: text("payment_method_type"),
    customerName: text("customer_name"),
    email: text("email"),
    phone: text("phone"),
    shippingAddress: jsonb("shipping_address").$type<Address & { name?: string | null }>(),
    billingAddress: jsonb("billing_address").$type<Address>(),
    nif: text("nif"),
    giftMessage: text("gift_message"),
    isGift: boolean("is_gift").notNull().default(false),
    consentMarketing: boolean("consent_marketing").notNull().default(false),
    consentTracking: boolean("consent_tracking").notNull().default(false),
    utm: jsonb("utm").$type<Utm>(),
    fbp: text("fbp"),
    fbc: text("fbc"),
    eventId: text("event_id"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    gaClientId: text("ga_client_id"),
    trackingNumber: text("tracking_number"),
    invoiceNumber: text("invoice_number"),
    notes: text("notes"),
    promoCode: text("promo_code"),
    discountCents: integer("discount_cents").notNull().default(0),
    ebookKeyIssuedAt: timestamp("ebook_key_issued_at", { withTimezone: true }),
    purchaseReportedAt: timestamp("purchase_reported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("orders_status_idx").on(t.status), index("orders_created_idx").on(t.createdAt)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: serial("id").primaryKey(),
    eventName: text("event_name").notNull(),
    eventId: text("event_id"),
    orderId: text("order_id"),
    sentTo: text("sent_to").notNull(), // pixel | capi | ga4
    status: text("status").notNull(), // ok | error | skipped
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tracking_events_name_idx").on(t.eventName, t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
});

export const creatives = pgTable("creatives", {
  id: serial("id").primaryKey(),
  conceptKey: text("concept_key").notNull(),
  variation: integer("variation").notNull().default(1),
  format: text("format").notNull(), // 1x1 | 4x5 | 9x16
  imageKey: text("image_key").notNull(),
  primaryText: text("primary_text").notNull(),
  headline: text("headline").notNull(),
  description: text("description").notNull(),
  cta: text("cta").notNull().default("SHOP_NOW"),
  utmContent: text("utm_content").notNull(),
  status: creativeStatus("status").notNull().default("draft"),
  feedback: text("feedback"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    consentMarketing: boolean("consent_marketing").notNull(),
    consentText: text("consent_text").notNull(),
    source: text("source").notNull().default("exit_popup"),
    promoCode: text("promo_code"),
    utm: jsonb("utm").$type<Utm>(),
    ipHash: text("ip_hash"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_created_idx").on(t.createdAt)],
);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(), // ip or email
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

export const webhookLog = pgTable("webhook_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Bundle = typeof bundles.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Creative = typeof creatives.$inferSelect;
export type Lead = typeof leads.$inferSelect;
