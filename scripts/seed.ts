// Idempotent seed: inserts the product, bundles and default settings only if missing.
// Never overwrites values edited in the admin.
import "./load-env";
import { sql as pg, db, schema } from "../src/db";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defaults";

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

const bundles = [
  { key: "x1", label: "1 caixa · 3 garrafas", qty: 1, priceCents: 4590, compareAtCents: null, shippingCents: 490, badge: null, sort: 1 },
  { key: "x2", label: "2 caixas · 6 garrafas · 1 para si, 1 para oferecer", qty: 2, priceCents: 8490, compareAtCents: 9180, shippingCents: 0, badge: "Mais escolhido", sort: 2 },
  { key: "x3", label: "3 caixas · 9 garrafas · a melhor escolha", qty: 3, priceCents: 11990, compareAtCents: 13770, shippingCents: 0, badge: "Melhor valor", sort: 3 },
];
await db
  .insert(schema.bundles)
  .values(bundles.map((b) => ({ ...b, productId: productId! })))
  .onConflictDoNothing();

await db
  .insert(schema.settings)
  .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
  .onConflictDoNothing();

console.log("seed done");
await pg.end();
