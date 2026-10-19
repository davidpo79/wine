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
  bigint,
  bigserial,
  numeric,
  primaryKey,
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
    country: text("country").notNull().default("PT"), // delivery country (lib/markets.ts)
    locale: text("locale").notNull().default("pt"), // language the customer bought in (emails, pages)
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"), // saved (card/wallet) for the one-click upsell
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }), // checkout autosave
    recoveryScheduledAt: timestamp("recovery_scheduled_at", { withTimezone: true }),
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
    consentMessages: boolean("consent_messages").notNull().default(false), // email/SMS/WhatsApp reminders (pre-checkout)
    consentCalls: boolean("consent_calls").notNull().default(false), // phone calls incl. AI assistant (pre-checkout)
    source: text("source").notNull().default("site"), // site | recovery
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
    costs: jsonb("costs").$type<Record<string, number>>(), // cost/profit snapshot (cents) taken when paid; see lib/profit.ts
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }), // review invitation email sent (once)
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
    sessionId: text("session_id"), // anonymous per-tab visit id (sessionStorage), for the funnel
    source: text("source"), // traffic source of that visit: Meta ads, Google ads, Direct...
    sentTo: text("sent_to").notNull(), // pixel | capi | ga4
    status: text("status").notNull(), // ok | error | skipped
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tracking_events_name_idx").on(t.eventName, t.createdAt), index("tracking_events_order_idx").on(t.orderId)],
);

/** Anonymous visit journey: every step, click, scroll milestone and form interaction of a browser tab (Admin → Funnel). */
export const journeyEvents = pgTable(
  "journey_events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(), // per-tab visit id (sessionStorage), same as tracking_events.session_id
    pageId: text("page_id"), // one page load
    name: text("name").notNull(), // page_view, page_leave, scroll, section, click, field_focus, field_done, field_error, pay_click...
    path: text("path"),
    props: jsonb("props").$type<Record<string, unknown>>(), // never personal data: field names, not values
    ms: integer("ms"), // milliseconds since the page loaded
    source: text("source"), // traffic source of the visit: Meta ads, Direct...
    device: text("device"), // mobile | tablet | desktop
    browser: text("browser"),
    country: text("country"), // from the IP, the IP itself is not stored
    locale: text("locale"),
    orderId: text("order_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journey_session_idx").on(t.sessionId, t.createdAt),
    index("journey_name_idx").on(t.name, t.createdAt),
    index("journey_created_idx").on(t.createdAt),
  ],
);

/** Admin → Inbox: emails received on the shop address (Resend Receiving) and emails sent from the shop, by customer. */
export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: serial("id").primaryKey(),
    direction: text("direction").notNull(), // in | out
    kind: text("kind").notNull().default("manual"), // in: received · out: manual (written in the admin) or the automatic email kind (confirmation, shipped...)
    resendId: text("resend_id").unique(),
    messageId: text("message_id"), // RFC 5322 Message-ID, for replies in the same thread
    inReplyTo: text("in_reply_to"),
    contact: text("contact").notNull(), // the customer's address (lowercase): the conversation key
    fromAddr: text("from_addr").notNull(),
    toAddrs: jsonb("to_addrs").$type<string[]>().notNull(),
    cc: jsonb("cc").$type<string[]>(),
    subject: text("subject").notNull().default(""),
    text: text("text"),
    html: text("html"),
    attachments: jsonb("attachments").$type<{ id: string; filename: string | null; size: number; contentType: string }[]>(),
    orderId: text("order_id"),
    sentBy: text("sent_by"), // admin email for manual messages
    status: text("status").notNull().default("ok"), // ok | error
    error: text("error"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbox_contact_idx").on(t.contact, t.createdAt), index("inbox_created_idx").on(t.createdAt)],
);

/** Verified reviews: only customers of a delivered order can write one (invitation email with a signed link). */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    text: text("text"),
    displayName: text("display_name").notNull(), // first name + initial, chosen by the customer
    country: text("country").notNull(),
    locale: text("locale").notNull(),
    consentPublish: boolean("consent_publish").notNull().default(false),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    reply: text("reply"), // public answer from the shop
    moderatedBy: text("moderated_by"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_status_idx").on(t.status, t.createdAt)],
);

/** Carrier shipment of an order (CTT e-commerce API): tracking, label and the carrier's status history. */
export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    provider: text("provider").notNull().default("ctt"),
    carrierName: text("carrier_name"),
    trackingId: text("tracking_id"),
    trackingUrl: text("tracking_url"),
    labelPdf: text("label_pdf"), // base64 PDF from the carrier
    lastCode: integer("last_code"), // universal status code (99 / 94 = delivered)
    lastText: text("last_text"),
    events: jsonb("events").$type<{ code: number; at: string; text: string }[]>().notNull().default([]),
    simulated: boolean("simulated").notNull().default(false), // created with X_SIMULATE (nothing stored at CTT)
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shipments_tracking_idx").on(t.trackingId)],
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
    locale: text("locale").notNull().default("pt"),
    promoCode: text("promo_code"),
    utm: jsonb("utm").$type<Utm>(),
    ipHash: text("ip_hash"),
    phone: text("phone"),
    consentPhone: boolean("consent_phone").notNull().default(false),
    phoneConsentText: text("phone_consent_text"),
    phoneAddedAt: timestamp("phone_added_at", { withTimezone: true }),
    contactStatus: text("contact_status").notNull().default("new"), // new | contacted | no_answer | not_interested | converted
    contactNotes: text("contact_notes"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_created_idx").on(t.createdAt)],
);

export const orderAddons = pgTable(
  "order_addons",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    kind: text("kind").notNull(), // boxes | product
    sku: text("sku").notNull(), // e.g. trilogia-2160 | espumante-dgraca-bruto
    label: text("label").notNull(),
    qty: integer("qty").notNull(),
    boxes: integer("boxes").notNull().default(0), // Trilogia boxes added (counts for stock and shipping)
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | failed
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("order_addons_order_idx").on(t.orderId)],
);

// One row per payment attempt at ifthenpay (MB WAY push, Multibanco reference, card/wallet page).
// `ref` is the orderId sent to ifthenpay (max 15 chars) and comes back in every callback.
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull().default("ifthenpay"),
    method: text("method").notNull(), // mbway | multibanco | card | wallet
    ref: text("ref").notNull().unique(),
    requestId: text("request_id"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | expired | failed | refunded
    phone: text("phone"),
    entity: text("entity"),
    reference: text("reference"),
    redirectUrl: text("redirect_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    paidMethod: text("paid_method"), // from the callback: MB | MBWAY | CCARD | APPLE | GOOGLE
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedCents: integer("refunded_cents").notNull().default(0),
    addonId: integer("addon_id"), // set when this payment is for a post-purchase add-on
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_order_idx").on(t.orderId), index("payments_status_idx").on(t.status, t.createdAt), index("payments_request_idx").on(t.requestId)],
);

export const recoverySteps = pgTable(
  "recovery_steps",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    step: text("step").notNull(), // reminder_20m | ai_call | final_email
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // pending | running | done | skipped | failed
    channels: jsonb("channels").$type<string[]>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recovery_due_idx").on(t.status, t.scheduledAt), index("recovery_order_idx").on(t.orderId)],
);

// Business expenses outside the per-order costs (ads, agency, tools, overheads). Amounts exclude recoverable VAT.
// A range (date..endDate) is spread evenly per day, e.g. a monthly tool or a campaign budget.
export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(), // YYYY-MM-DD (Lisbon)
    endDate: text("end_date"), // YYYY-MM-DD inclusive, optional
    category: text("category").notNull(), // ads_meta | agency | packaging | tools | other ...
    description: text("description").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"), // admin | fulfilment
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(1), // bumped to log the user out everywhere
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdBy: text("created_by"),
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
export type OrderAddon = typeof orderAddons.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;

// ---------------------------------------------------------------------------
// Portugal HR callers (src/lib/pt-callers). SEPARATE tables: nothing here
// references orders, leads or any customer table, and nothing else reads them.
// Times are epoch milliseconds. Personal data is minimal business-contact data
// with source, fetch date and a retention horizon (90 days after last
// activity; no deletion job is enabled). Apollo's request_id is TEXT (it is a
// signed 64-bit integer). The block list stores only keyed hashes.
// ---------------------------------------------------------------------------
const ms = (name: string) => bigint(name, { mode: "number" });

export const ptLeads = pgTable(
  "pt_leads",
  {
    id: text("id").primaryKey(),
    apolloId: text("apollo_id").notNull().unique(),
    demo: boolean("demo").notNull().default(false),
    source: text("source").notNull(),
    fetchedAt: ms("fetched_at").notNull(),
    batchId: text("batch_id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    lastNameObfuscated: text("last_name_obfuscated"),
    title: text("title"),
    companyName: text("company_name"),
    employeeRange: text("employee_range"),
    employeeCount: integer("employee_count"),
    city: text("city"),
    phoneE164: text("phone_e164"),
    emailBusiness: text("email_business"),
    status: text("status").notNull(),
    statusBeforeCall: text("status_before_call"),
    assignedUid: text("assigned_uid"),
    approvedAt: ms("approved_at"),
    approvedBy: text("approved_by"),
    enrichState: text("enrich_state").notNull().default("none"),
    enrichId: text("enrich_id"),
    failReason: text("fail_reason"),
    numberClass: text("number_class").notNull().default("unknown"),
    legalBasis: text("legal_basis"),
    eligibilityNote: text("eligibility_note"),
    attempts: integer("attempts").notNull().default(0),
    followUpAt: ms("follow_up_at"),
    lockUid: text("lock_uid"),
    lockExpiresAt: ms("lock_expires_at"),
    lastCallAt: ms("last_call_at"),
    notes: text("notes"),
    lastActivityAt: ms("last_activity_at").notNull(),
    retentionDays: integer("retention_days").notNull().default(90),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [index("pt_leads_assigned_idx").on(t.assignedUid, t.demo)],
);

export const ptBlocks = pgTable(
  "pt_blocks",
  {
    keyHash: text("key_hash").notNull(),
    kind: text("kind").notNull(),
    scope: text("scope").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.keyHash] })],
);

export const ptCreditLedger = pgTable(
  "pt_credit_ledger",
  {
    id: text("id").primaryKey(),
    demo: boolean("demo").notNull().default(false),
    kind: text("kind").notNull(),
    day: text("day").notNull(),
    month: text("month").notNull(),
    creditsReserved: numeric("credits_reserved").notNull(),
    creditsSync: numeric("credits_sync"),
    creditsAsync: numeric("credits_async"),
    creditsActual: numeric("credits_actual"),
    status: text("status").notNull(),
    enrichId: text("enrich_id"),
    uid: text("uid"),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [index("pt_credit_ledger_month_idx").on(t.month, t.day)],
);

export const ptEnrichRequests = pgTable("pt_enrich_requests", {
  id: text("id").primaryKey(),
  demo: boolean("demo").notNull().default(false),
  apolloRequestId: text("apollo_request_id"),
  mode: text("mode").notNull(),
  secretHash: text("secret_hash"),
  leadIds: jsonb("lead_ids").$type<string[]>().notNull(),
  apolloIds: jsonb("apollo_ids").$type<string[]>().notNull(),
  ledgerId: text("ledger_id"),
  status: text("status").notNull(),
  creditsSettled: boolean("credits_settled").notNull().default(false),
  deliveries: integer("deliveries").notNull().default(0),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
  lastDeliveryAt: ms("last_delivery_at"),
});

export const ptCalls = pgTable(
  "pt_calls",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    uid: text("uid").notNull(),
    status: text("status").notNull(),
    repCallControlId: text("rep_call_control_id"),
    customerCallControlId: text("customer_call_control_id"),
    refusedReason: text("refused_reason"),
    day: text("day").notNull(),
    startedAt: ms("started_at").notNull(),
    answeredAt: ms("answered_at"),
    endedAt: ms("ended_at"),
  },
  (t) => [index("pt_calls_day_idx").on(t.day, t.uid), index("pt_calls_lead_idx").on(t.leadId)],
);

export const ptAccessLog = pgTable(
  "pt_access_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    uid: text("uid").notNull(),
    action: text("action").notNull(),
    leadIds: jsonb("lead_ids").$type<string[]>().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    at: ms("at").notNull(),
  },
  (t) => [index("pt_access_log_at_idx").on(t.at)],
);

export const ptSettings = pgTable("pt_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ms("updated_at").notNull(),
});

// Phone devices (Telnyx WebRTC credentials) of the Portugal callers, on the
// project's own Telnyx account. One per team member; a revoked row is never
// reactivated by a page load.
export const ptPhoneEndpoints = pgTable("pt_phone_endpoints", {
  uid: text("uid").primaryKey(),
  sipUsername: text("sip_username").notNull(),
  credentialId: text("credential_id").notNull(),
  connectionId: text("connection_id").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});
