// Printed Christmas card (A6 portrait, 105 × 148 mm). Fixed design; only the customer's message changes, set in a
// handwriting face. Used for the live preview in the checkout and for printing in Admin → Gift cards.
// Sizes are in container units, so the same markup works as a small preview and as a full-size print.

const FONTS = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Cormorant+Garamond:ital,wght@1,600&display=swap";

export function GiftCard({ message, orderId, className = "" }: { message: string; orderId?: string; className?: string }) {
  const text = message.trim();
  const size = text.length <= 60 ? "gc-lg" : text.length <= 120 ? "gc-md" : "gc-sm";
  return (
    <div className={`giftcard ${className}`}>
      {/* React hoists and de-duplicates this stylesheet. */}
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <div className="gc-band" aria-hidden="true" />
      <div className="gc-body">
        <p className="gc-eyebrow">Wine Portugal</p>
        <p className="gc-title">Feliz Natal</p>
        <span className="gc-star" aria-hidden="true">✦</span>
        <p className={`gc-msg ${size}`}>{text || "A sua mensagem aparece aqui."}</p>
        <p className="gc-foot">Trilogia 2160 · Vinhos do Douro</p>
      </div>
      {orderId && <span className="gc-ref">{orderId}</span>}
    </div>
  );
}
