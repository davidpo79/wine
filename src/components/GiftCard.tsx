// Printed Christmas card (A6 portrait, 105 × 148 mm). Fixed design; only the customer's message changes, set in a
// handwriting face. Used for the live preview in the checkout and for printing in Admin → Gift cards.
// Sizes are in container units, so the same markup works as a small preview and as a full-size print.

const FONTS = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Cormorant+Garamond:ital,wght@1,600;1,700&display=swap";

/** Holly sprig: two spiky leaves and three berries. */
function Holly({ className }: { className: string }) {
  const leaf = "M0 0 C6 -3 9 -10 16 -9 C15 -5 20 -3 24 -6 C25 -1 30 1 34 -1 C32 4 35 8 40 9 C33 13 26 12 20 9 C14 12 8 10 4 6 C2 4 1 2 0 0 Z";
  return (
    <svg className={className} viewBox="-4 -26 70 52" aria-hidden="true">
      <g fill="#1f5a3a" stroke="#123d27" strokeWidth="0.8">
        <path d={leaf} transform="translate(30 0) rotate(-28) translate(0 0)" />
        <path d={leaf} transform="translate(30 0) rotate(152) scale(1 -1)" />
        <path d={leaf} transform="translate(30 2) rotate(80) scale(0.85)" />
      </g>
      <g fill="#b3202b" stroke="#7d121b" strokeWidth="0.6">
        <circle cx="28" cy="-2" r="4.2" />
        <circle cx="34.5" cy="1.5" r="4" />
        <circle cx="27.5" cy="5.5" r="3.8" />
      </g>
      <g fill="#fff" opacity="0.55">
        <circle cx="26.6" cy="-3.4" r="1.1" />
        <circle cx="33.2" cy="0.2" r="1" />
        <circle cx="26.3" cy="4.3" r="0.9" />
      </g>
    </svg>
  );
}

const FLAKES: [number, number, number][] = [
  [12, 22, 3.4], [84, 18, 3], [22, 48, 2.2], [88, 44, 2.6], [10, 72, 2.4], [90, 70, 2.2], [30, 12, 2], [70, 30, 2], [16, 88, 2.6], [78, 88, 2.4],
];

/** placeholder: preview text while the message is empty, in the checkout's language (the printed design stays Portuguese). */
export function GiftCard({ message, orderId, className = "", placeholder = "A sua mensagem aparece aqui." }: { message: string; orderId?: string; className?: string; placeholder?: string }) {
  const text = message.trim();
  const size = text.length <= 60 ? "gc-lg" : text.length <= 120 ? "gc-md" : "gc-sm";
  return (
    <div className={`giftcard ${className}`}>
      {/* React hoists and de-duplicates this stylesheet. */}
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <div className="gc-inner">
        {FLAKES.map(([x, y, s], i) => (
          <span key={i} className="gc-flake" style={{ left: `${x}%`, top: `${y}%`, fontSize: `${s}cqw` }} aria-hidden="true">
            ❄
          </span>
        ))}
        <Holly className="gc-holly gc-holly-tl" />
        <Holly className="gc-holly gc-holly-br" />
        <div className="gc-body">
          <span className="gc-star" aria-hidden="true">★</span>
          <p className="gc-title">Feliz Natal</p>
          <p className="gc-sub">e um próspero Ano Novo</p>
          <span className="gc-rule" aria-hidden="true" />
          <p className={`gc-msg ${size}`}>{text || placeholder}</p>
          <p className="gc-foot">Wine Portugal · Trilogia 2160</p>
        </div>
      </div>
      {orderId && <span className="gc-ref">{orderId}</span>}
    </div>
  );
}

/** Two wine glasses clinking, line drawing in gold. */
function Toast({ className }: { className: string }) {
  const glass = "M-9 -30 C-10 -16 -7 -6 0 -4 C7 -6 10 -16 9 -30 Z M0 -4 L0 18 M-7 19 L7 19";
  return (
    <svg className={className} viewBox="-40 -44 80 66" aria-hidden="true" fill="none" stroke="#b8913c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <g transform="translate(-11 0) rotate(-14)">
        <path d={glass} />
        <path d="M-8.4 -22 C-4 -20 4 -24 8.4 -22 C8 -13 5 -7.5 0 -6.5 C-5 -7.5 -8 -13 -8.4 -22 Z" fill="#9c0d10" stroke="none" opacity="0.9" />
      </g>
      <g transform="translate(11 0) rotate(14)">
        <path d={glass} />
        <path d="M-8.4 -22 C-4 -24 4 -20 8.4 -22 C8 -13 5 -7.5 0 -6.5 C-5 -7.5 -8 -13 -8.4 -22 Z" fill="#9c0d10" stroke="none" opacity="0.9" />
      </g>
      <g strokeWidth="1.3">
        <path d="M0 -40 L0 -35" />
        <path d="M-7 -38 L-5 -34" />
        <path d="M7 -38 L5 -34" />
      </g>
    </svg>
  );
}

const DOTS: [number, number, number, string][] = [
  [9, 14, 1.6, "r"], [91, 11, 1.3, "k"], [7, 40, 1, "g"], [93, 36, 1.1, "r"], [7, 62, 1.2, "k"], [94, 60, 1.4, "r"], [8, 92, 1.3, "r"], [93, 83, 1, "g"], [24, 9, 0.9, "g"], [74, 13, 1, "r"],
];

/**
 * Printed greeting card for the Black Friday boxes (Spain, A6 portrait), in the page's black, red and gold, Spanish.
 * Same markup rules as the Christmas card: only the customer's message changes. Not offered in the checkout yet
 * (16/11/2026: waiting for the Belgian warehouse to say whether it can print and pack it).
 */
export function BfGreetingCard({ message, orderId, className = "", placeholder = "Tu mensaje aparece aquí." }: { message: string; orderId?: string; className?: string; placeholder?: string }) {
  const text = message.trim();
  const size = text.length <= 60 ? "gc-lg" : text.length <= 120 ? "gc-md" : "gc-sm";
  return (
    <div className={`giftcard gcb ${className}`}>
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <div className="gc-inner">
        {DOTS.map(([x, y, s, c], i) => (
          <span key={i} className={`gcb-dot gcb-dot-${c}`} style={{ left: `${x}%`, top: `${y}%`, width: `${s}cqw`, height: `${s}cqw` }} aria-hidden="true" />
        ))}
        <span className="gcb-corner gcb-corner-tl" aria-hidden="true" />
        <span className="gcb-corner gcb-corner-br" aria-hidden="true" />
        <div className="gc-body">
          <Toast className="gcb-toast" />
          <p className="gc-title">Un brindis por ti</p>
          <p className="gc-sub">¡Felices Fiestas!</p>
          <span className="gc-rule" aria-hidden="true" />
          <p className={`gc-msg ${size}`}>{text || placeholder}</p>
          <p className="gc-foot">Wine Portugal · Del Douro a tu mesa</p>
        </div>
      </div>
      {orderId && <span className="gc-ref">{orderId}</span>}
    </div>
  );
}
