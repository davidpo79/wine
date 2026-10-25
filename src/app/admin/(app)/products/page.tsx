import { requireAdmin } from "@/lib/auth";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { publicUrl, bucketConfigured } from "@/lib/bucket";
import { eur, perBottleCents } from "@/lib/money";
import { PER_BOX_FLOOR_CENTS } from "@/lib/settings-defaults";
import { bundleAction, productAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

const money = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default async function Products() {
  await requireAdmin({ role: "admin" });
  const products = await db.select().from(schema.products).orderBy(asc(schema.products.id));
  const bundles = await db.select().from(schema.bundles).orderBy(asc(schema.bundles.sort));
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">Product & pricing</h1>
      {products.map((p) => (
        <div key={p.id} className="space-y-4">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-sm text-muted">{p.wines.map((w) => `${w.name} ${w.vintage}`).join(" · ")}</p>
            <ActionForm action={productAction} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="intent" value="details" />
              <label className="block text-sm font-medium">Short description (SEO)
                <textarea name="short_description" defaultValue={p.shortDescription} rows={2} className="mt-1 w-full rounded border p-2" />
              </label>
              <Submit className="mt-2">Save description</Submit>
            </ActionForm>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold">Gallery photos</h2>
            <p className="text-sm text-muted">Suggested order: box closed, box open, 3 bottles in the Douro, e-book, bacalhau with Branco, Christmas table. Until photos are uploaded the site shows illustrations.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {p.images.map((k, i) => (
                <div key={k} className="w-36 rounded border p-1 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicUrl(k)} alt="" className="aspect-square w-full object-cover" />
                  <ActionForm action={productAction} className="mt-1 flex gap-1">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="key" value={k} />
                    {i > 0 && <Submit name="intent" value="up" className="!min-h-7 !px-2">←</Submit>}
                    {i < p.images.length - 1 && <Submit name="intent" value="down" className="!min-h-7 !px-2">→</Submit>}
                    <Submit name="intent" value="remove" className="!min-h-7 !bg-red-700 !px-2">✕</Submit>
                  </ActionForm>
                </div>
              ))}
            </div>
            {bucketConfigured() ? (
              <ActionForm action={productAction} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="intent" value="upload" />
                <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border file:border-night file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-night hover:file:bg-paper-2" />
                <Submit>Upload</Submit>
              </ActionForm>
            ) : (
              <p className="mt-3 text-sm text-amber-700">Bucket not configured: image upload is unavailable in this environment.</p>
            )}
          </section>
        </div>
      ))}

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Bundles</h2>
        <p className="text-sm text-muted">Prices include VAT. Minimum {eur(PER_BOX_FLOOR_CENTS)} per box (protects the B2B channel). Compare-at is the price of the same boxes bought separately.</p>
        <div className="mt-3 space-y-3">
          {bundles.map((b) => (
            <ActionForm key={b.id} action={bundleAction} className="rounded border p-3">
              <input type="hidden" name="id" value={b.id} />
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <span className="w-10 font-mono font-semibold">{b.key}</span>
                <label className="min-w-64 flex-1">Label (pt-PT)<input name="label" defaultValue={b.label} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-16">Boxes<input name="qty" type="number" min={1} defaultValue={b.qty} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-24">Price €<input name="price" defaultValue={money(b.priceCents)} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-24">Compare-at €<input name="compare_at" defaultValue={money(b.compareAtCents)} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-20">Shipping €<input name="shipping" defaultValue={money(b.shippingCents)} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-36">Badge<input name="badge" defaultValue={b.badge ?? ""} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="w-14">Sort<input name="sort" type="number" defaultValue={b.sort} className="mt-1 w-full rounded border p-1.5" /></label>
                <label className="flex items-center gap-1 pb-2"><input type="checkbox" name="active" defaultChecked={b.active} /> Active</label>
                <Submit>Save</Submit>
              </div>
              <p className="mt-1 text-xs text-muted">
                {eur(perBottleCents(b.priceCents, b.qty * 3))}/bottle · {eur(Math.round(b.priceCents / b.qty))}/box · total incl. shipping {eur(b.priceCents + b.shippingCents)}
              </p>
            </ActionForm>
          ))}
        </div>
      </section>
    </div>
  );
}
