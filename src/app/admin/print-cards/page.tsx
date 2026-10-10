import { requireAdmin } from "@/lib/auth";
import { giftCardOrders } from "@/lib/gift-cards";
import { GiftCard } from "@/components/GiftCard";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print gift cards", robots: { index: false } };

// One A6 card per printed page. Opened from Admin → Gift cards (or an order page).
export default async function PrintCards({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireAdmin();
  const ids = ((await searchParams).ids ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Z0-9-]{4,30}$/.test(s)).slice(0, 300);
  const rows = ids.length ? await giftCardOrders(ids) : [];
  return (
    <>
      <style>{`
        @page { size: 105mm 148mm; margin: 0; }
        body { background: #e9e5dc; }
        .sheet { width: 105mm; margin: 10mm auto; }
        @media print { body { background: #fff; } .noprint { display: none !important; } .sheet { margin: 0; } .sheet:not(:last-of-type) { break-after: page; } .sheet .giftcard { box-shadow: none; } }
      `}</style>
      <div className="noprint mx-auto flex max-w-xl items-center justify-between gap-3 p-4 text-sm">
        <span>{rows.length} card{rows.length === 1 ? "" : "s"} · A6 105 × 148 mm · print at 100%, no margins</span>
        <PrintButton />
      </div>
      {rows.map((r) => (
        <div key={r.orderId} className="sheet">
          <GiftCard message={r.message} orderId={r.orderId} />
        </div>
      ))}
      {rows.length === 0 && <p className="p-8 text-center">No paid gift cards for these orders.</p>}
    </>
  );
}
