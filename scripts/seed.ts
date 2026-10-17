// Idempotent seed: inserts the product, bundles and default settings only if missing.
// Never overwrites values edited in the admin.
import "./load-env";
import { sql as pg, db, schema } from "../src/db";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defaults";
import { hash } from "@node-rs/argon2";

const [existing] = await db.select().from(schema.products).limit(1);
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

await db
  .insert(schema.settings)
  .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
  .onConflictDoNothing();

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

console.log("seed done");
await pg.end();
