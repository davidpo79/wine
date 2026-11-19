// Idempotent seed: inserts the product, bundles and default settings only if missing.
// Never overwrites values edited in the admin.
import "./load-env";
import { sql as pg, db, schema } from "../src/db";
import type { WineItem } from "../src/db/schema";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defaults";
import { BF_BUNDLES, BF_OFFER_BUNDLES, BF_OFFERS, BF_PRODUCT_SLUG, BF_SLUGS } from "../src/lib/black-friday";
import { hash } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import { eq, notInArray, sql } from "drizzle-orm";

const [existing] = await db.select().from(schema.products).where(notInArray(schema.products.slug, BF_SLUGS)).limit(1);
let productId = existing?.id;
if (!productId) {
  const [p] = await db
    .insert(schema.products)
    .values({
      slug: "trilogia-2160",
      name: "Trilogia 2160",
      shortDescription:
        "Rosé, Branco e Tinto Douro DOC, 2160 Onde Tudo Nasce da Martin Boutique Wines, em caixa de oferta.",
      wines: [
        { name: "2160 Onde Tudo Nasce Rosé", vintage: "2024", type: "rose", producer: "Martin Boutique Wines" },
        { name: "2160 Onde Tudo Nasce Branco", vintage: "2025", type: "branco", producer: "Martin Boutique Wines" },
        { name: "2160 Onde Tudo Nasce Tinto", vintage: "2023", type: "tinto", producer: "Martin Boutique Wines" },
      ],
      images: [],
    })
    .returning();
  productId = p.id;
  console.log("product created");
}

// Buy-and-get offers with delivery included (pricing of 17/10/2026; also applied to existing DBs by drizzle/0010).
const bundles = [
  { key: "x1", label: "1 caixa · 3 garrafas", qty: 1, priceCents: 4990, compareAtCents: null, shippingCents: 0, badge: null, sort: 1 },
  { key: "x2", label: "2 caixas · 6 garrafas · a 2.ª caixa por 40 €", qty: 2, priceCents: 8990, compareAtCents: 9980, shippingCents: 0, badge: "Mais escolhido", sort: 2 },
  { key: "x4", label: "4 caixas · 12 garrafas · pague 3, leve 4", qty: 4, priceCents: 14970, compareAtCents: 19960, shippingCents: 0, badge: "Pague 3, leve 4", sort: 3 },
];
await db
  .insert(schema.bundles)
  .values(bundles.map((b) => ({ ...b, productId: productId! })))
  .onConflictDoNothing();

// Black Friday 2026 box for Germany and Spain (29/10/2026): own product and bundles, added once.
let [bf] = await db.select().from(schema.products).where(eq(schema.products.slug, BF_PRODUCT_SLUG)).limit(1);
if (!bf) {
  [bf] = await db
    .insert(schema.products)
    .values({
      slug: BF_PRODUCT_SLUG,
      name: "Black Friday · 6 vinhos do Douro",
      shortDescription: "Caixa de 6 vinhos do Douro DOC: 3 tintos, 2 brancos e 1 rosé. Alemanha e Espanha, envio do armazém na Bélgica.",
      wines: [
        { name: "Galhofa Tinto", vintage: "2024", type: "tinto", producer: "Douro" },
        { name: "Galhofa Branco", vintage: "2025", type: "branco", producer: "Douro" },
        { name: "Galhofa Rosé", vintage: "2025", type: "rose", producer: "Douro" },
      ],
      images: [],
    })
    .returning();
  console.log("black friday product created");
}
await db
  .insert(schema.bundles)
  .values(BF_BUNDLES.map((b) => ({ ...b, productId: bf.id })))
  .onConflictDoNothing();

// Black Friday in Spain (16/11/2026): 3 bottles of D. Graça sparkling and 6 bottles of Poço do Canto Palhete 2019.
const OFFER_PRODUCTS: Record<"burbujas" | "poco" | "pocoeu" | "galhofa" | "sekt", { name: string; shortDescription: string; wines: WineItem[] }> = {
  burbujas: {
    name: "Black Friday · Espumante D. Graça Bruto · 3 garrafas",
    shortDescription: "Caixa de 3 garrafas de espumante bruto D. Graça, Douro. Espanha.",
    wines: [{ name: "D. Graça Espumante Bruto", vintage: "", type: "branco", producer: "Douro" }],
  },
  poco: {
    name: "Black Friday · Poço do Canto Palhete 2019 · 6 garrafas",
    shortDescription: "Caixa de 6 garrafas de Poço do Canto Palhete 2019, tinto do Douro. Espanha.",
    wines: [{ name: "Poço do Canto Palhete", vintage: "2019", type: "tinto", producer: "Douro" }],
  },
  galhofa: {
    name: "Black Friday · Galhofa mix · 6 garrafas · NL/BE",
    shortDescription: "Caixa de 6 vinhos Galhofa, Douro DOC: 3 tintos, 2 brancos e 1 rosé. Países Baixos e Bélgica, armazém na Bélgica (UPS). 440 caixas.",
    wines: [
      { name: "Galhofa Tinto", vintage: "2024", type: "tinto", producer: "Douro" },
      { name: "Galhofa Branco", vintage: "2025", type: "branco", producer: "Douro" },
      { name: "Galhofa Rosé", vintage: "2025", type: "rose", producer: "Douro" },
    ],
  },
  sekt: {
    name: "Black Friday · Espumante D. Graça Bruto · 3 garrafas · DE",
    shortDescription: "Caixa de 3 garrafas de espumante bruto D. Graça, Douro. Alemanha, armazém na Bélgica (UPS). 336 caixas.",
    wines: [{ name: "D. Graça Espumante Bruto", vintage: "2022", type: "branco", producer: "Douro" }],
  },
  pocoeu: {
    name: "Black Friday · Poço do Canto Palhete 2019 · 6 garrafas · DE/NL/BE",
    shortDescription: "Caixa de 6 garrafas de Poço do Canto Palhete 2019, tinto do Douro. Alemanha, Países Baixos e Bélgica, armazém na Bélgica (UPS). 440 caixas.",
    wines: [{ name: "Poço do Canto Palhete", vintage: "2019", type: "tinto", producer: "Douro" }],
  },
};
for (const id of ["burbujas", "poco", "pocoeu", "galhofa", "sekt"] as const) {
  const slug = BF_OFFERS[id].slug;
  let [p] = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
  if (!p) {
    [p] = await db
      .insert(schema.products)
      .values({ slug, ...OFFER_PRODUCTS[id], images: [] })
      .returning();
    console.log(`black friday product created: ${slug}`);
  }
  await db
    .insert(schema.bundles)
    .values(BF_OFFER_BUNDLES[id].map((b) => ({ ...b, productId: p.id })))
    .onConflictDoNothing();
}

await db
  .insert(schema.settings)
  .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
  .onConflictDoNothing();

// One-time update, 18/11/2026 (David): the German Black Friday page sells the Cheda mix (Lavradores de Feitoria) from the
// Belgian warehouse at 68,50 €. Per box: wine 15 €, transport Portugal → Belgium 2,50 €, shipping box 2,50 €, handling
// 2 €, delivery to Germany 8,50 € (= 30,50 €; payment fees 3% and marketing come from Finance). Applied once, marked
// in settings, so later edits in Admin → Settings / Products are kept.
{
  const MARK = "patch_bf_cheda_de_20261118";
  const [done] = await db.select().from(schema.settings).where(eq(schema.settings.key, MARK));
  if (!done) {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "black_friday"));
    const cur = (row?.value ?? DEFAULT_SETTINGS.black_friday) as typeof DEFAULT_SETTINGS.black_friday;
    const value = { ...DEFAULT_SETTINGS.black_friday, ...cur, costs: { wine_cents: 1500, shipping_box_cents: 250, transport_cents: 250, handling_cents: 200, delivery_cents: 850 } };
    await db.insert(schema.settings).values({ key: "black_friday", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    await db
      .update(schema.products)
      .set({
        name: "Black Friday · 6 vinhos do Douro (DE Cheda · ES Galhofa)",
        shortDescription: "Caixa de 6 vinhos do Douro DOC: 3 tintos, 2 brancos e 1 rosé. Alemanha: Cheda (Lavradores de Feitoria), armazém na Bélgica. Espanha: Galhofa, enviado de Lisboa.",
        wines: [
          { name: "Cheda Tinto (DE)", vintage: "", type: "tinto", producer: "Lavradores de Feitoria" },
          { name: "Cheda Branco (DE)", vintage: "", type: "branco", producer: "Lavradores de Feitoria" },
          { name: "Cheda Rosé (DE)", vintage: "", type: "rose", producer: "Lavradores de Feitoria" },
          { name: "Galhofa Tinto (ES)", vintage: "2024", type: "tinto", producer: "Douro" },
          { name: "Galhofa Branco (ES)", vintage: "2025", type: "branco", producer: "Douro" },
          { name: "Galhofa Rosé (ES)", vintage: "2025", type: "rose", producer: "Douro" },
        ],
      })
      .where(eq(schema.products.slug, BF_PRODUCT_SLUG));
    await db.update(schema.bundles).set({ priceCents: 6850, shippingCents: 0 }).where(eq(schema.bundles.key, "bf1"));
    await db.insert(schema.settings).values({ key: MARK, value: new Date().toISOString() });
    console.log("patch applied: Black Friday Germany = Cheda, 68,50 €, costs 30,50 €/box");
  }
}

// One-time update, 18/11/2026 (David): Black Friday also in the Netherlands and Belgium (Poço do Canto, VAT 21%), and
// orders open until Black Friday itself (27/11 23:59 CET instead of 25/11). Later edits in Admin → Settings are kept.
{
  const MARK = "patch_bf_nl_be_cutoff_20261118";
  const [done] = await db.select().from(schema.settings).where(eq(schema.settings.key, MARK));
  if (!done) {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "black_friday"));
    const cur = { ...DEFAULT_SETTINGS.black_friday, ...((row?.value ?? {}) as Partial<typeof DEFAULT_SETTINGS.black_friday>) };
    const value = {
      ...cur,
      countries: [...new Set([...cur.countries, "NL", "BE"] as const)],
      vat_percent: { ...cur.vat_percent, NL: 21, BE: 21 },
      cutoff_at: "2026-11-27T22:59:00Z",
    };
    await db.insert(schema.settings).values({ key: "black_friday", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    await db.insert(schema.settings).values({ key: MARK, value: new Date().toISOString() });
    console.log("patch applied: Black Friday in NL and BE, orders until 27/11");
  }
}

// One-time update, 18/11/2026 (David): stock of the Belgian warehouse per the customs documents (e-DA PT 323854,
// invoices Vinilourenço FCT 2026/786 and Lavradores FA 2026/416 + 415): Cheda 500, Poço do Canto 360, Galhofa 360
// boxes; ShipHero SKUs D. Graça ×3 = 35600320722376, Trilogia 2160 = 55604086420020. Later admin edits are kept.
{
  const MARK = "patch_be_stock_customs_20261118";
  const [done] = await db.select().from(schema.settings).where(eq(schema.settings.key, MARK));
  if (!done) {
    const [bf] = await db.select().from(schema.settings).where(eq(schema.settings.key, "black_friday"));
    const cur = { ...DEFAULT_SETTINGS.black_friday, ...((bf?.value ?? {}) as Partial<typeof DEFAULT_SETTINGS.black_friday>) };
    const value = { ...cur, stock: { ...cur.stock, douro6: 500, pocoeu: 360, galhofa: 360, sekt: 336 } };
    await db.insert(schema.settings).values({ key: "black_friday", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    const [sh] = await db.select().from(schema.settings).where(eq(schema.settings.key, "shiphero"));
    const shCur = { ...DEFAULT_SETTINGS.shiphero, ...((sh?.value ?? {}) as Partial<typeof DEFAULT_SETTINGS.shiphero>) };
    const shValue = { ...shCur, skus: { ...shCur.skus, dgraca_3: "35600320722376", trilogia_2160: "55604086420020" } };
    await db.insert(schema.settings).values({ key: "shiphero", value: shValue }).onConflictDoUpdate({ target: schema.settings.key, set: { value: shValue } });
    await db.insert(schema.settings).values({ key: MARK, value: new Date().toISOString() });
    console.log("patch applied: Belgian warehouse stock and SKUs from the customs documents");
  }
}

// First admin bootstrap: only when no admin exists yet. Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in Railway,
// deploy once, log in, then delete ADMIN_INITIAL_PASSWORD. Later changes go through `npm run admin:create`.
const [anyAdmin] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).limit(1);
const bootEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const bootPw = process.env.ADMIN_INITIAL_PASSWORD;
if (!anyAdmin && bootEmail && bootPw) {
  if (bootPw.length < 12) {
    console.warn("ADMIN_INITIAL_PASSWORD must have at least 12 characters; admin not created");
  } else {
    await db.insert(schema.adminUsers).values({ email: bootEmail, passwordHash: await hash(bootPw, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) });
    console.log(`admin created: ${bootEmail}`);
  }
}

// One-time password reset for an existing admin: set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD in Railway, let it
// deploy, log in (the admin asks for a new password at once), then delete both variables. The same pair is applied
// only once (a fingerprint is kept in settings), so a password changed afterwards is not reset again by later deploys.
const resetEmail = process.env.ADMIN_RESET_EMAIL?.trim().toLowerCase();
const resetPw = process.env.ADMIN_RESET_PASSWORD;
if (resetEmail && resetPw) {
  const fingerprint = createHash("sha256").update(`${resetEmail}\n${resetPw}`).digest("hex");
  const [done] = await db.select().from(schema.settings).where(eq(schema.settings.key, "admin_reset_applied"));
  const [user] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, resetEmail));
  if (resetPw.length < 12) console.warn("ADMIN_RESET_PASSWORD must have at least 12 characters; password not reset");
  else if (!user) console.warn(`ADMIN_RESET_EMAIL ${resetEmail} is not an admin; password not reset`);
  else if (done?.value === fingerprint) console.log("admin password reset already applied; delete ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD in Railway");
  else {
    await db
      .update(schema.adminUsers)
      .set({ passwordHash: await hash(resetPw, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), mustChangePassword: true, disabledAt: null, sessionVersion: sql`${schema.adminUsers.sessionVersion} + 1` })
      .where(eq(schema.adminUsers.id, user.id));
    // Clears the 15-minute lockout (failed attempts are keyed by email and by IP).
    await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.success, false));
    await db.insert(schema.settings).values({ key: "admin_reset_applied", value: fingerprint }).onConflictDoUpdate({ target: schema.settings.key, set: { value: fingerprint } });
    console.log(`admin password reset: ${resetEmail} (must change it at first login)`);
  }
}

console.log("seed done");
await pg.end();
