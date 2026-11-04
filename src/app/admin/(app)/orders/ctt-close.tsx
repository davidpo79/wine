import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cttxConfigured, cttxSandbox } from "@/lib/cttx";
import { openCttxShipments } from "@/lib/fulfilment";
import { cttCloseAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

/** CTT Expresso daily close: hands the day's parcels over to CTT and keeps the acceptance certificate to print. */
export async function CttCloseBox() {
  if (!cttxConfigured()) return null;
  const sandbox = cttxSandbox();
  const [open, closes] = await Promise.all([
    openCttxShipments(),
    db.select({ id: schema.cttCloses.id, createdAt: schema.cttCloses.createdAt, orders: schema.cttCloses.orders }).from(schema.cttCloses).where(eq(schema.cttCloses.sandbox, sandbox)).orderBy(desc(schema.cttCloses.id)).limit(5),
  ]);
  const when = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>CTT daily close</strong>
          {sandbox && <span className="ml-1 rounded bg-gold/30 px-1 text-xs">sandbox</span>} · {open.length ? `${open.length} shipment${open.length > 1 ? "s" : ""} waiting (${open.map((s) => s.orderId).join(", ")})` : "nothing waiting"}
        </p>
        {open.length > 0 && (
          <ActionForm action={cttCloseAction} confirm={`Close ${open.length} CTT shipment${open.length > 1 ? "s" : ""} for today? Do it once the parcels are packed for the CTT pickup.`}>
            <Submit>Close today&apos;s CTT shipments</Submit>
          </ActionForm>
        )}
      </div>
      {closes.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Last closes:{" "}
          {closes.map((c, i) => (
            <span key={c.id}>
              {i > 0 && " · "}
              <a className="underline" href={`/admin/ctt-close?id=${c.id}`} target="_blank" rel="noreferrer">
                {when(c.createdAt)} ({c.orders.length})
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
