// Illustrated placeholders shown until David delivers real product photos.
// Bottles are deliberately abstract (blank labels): real labels must come from real photos only.

export type ArtKind = "box-closed" | "box-open" | "terrace" | "ebook" | "bacalhau" | "table";

const W = 1000;

function Bottle({ x, y, color, glass = color, scale = 1 }: { x: number; y: number; color: string; glass?: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-22 -330h44v70c0 26 46 52 46 110v330a24 24 0 0 1-24 24h-88a24 24 0 0 1-24-24v-330c0-58 46-84 46-110z" fill={glass} />
      <path d="M-22 -330h44v70c0 26 46 52 46 110v330a24 24 0 0 1-24 24h-88a24 24 0 0 1-24-24v-330c0-58 46-84 46-110z" fill="url(#shine)" />
      <rect x="-24" y="-352" width="48" height="40" rx="5" fill="#0f2340" opacity=".85" />
      <rect x="-60" y="20" width="120" height="120" rx="3" fill="#f6efe2" opacity=".95" />
      <rect x="-44" y="46" width="88" height="2" fill="#c8a253" />
      <rect x="-30" y="110" width="60" height="2" fill="#0f2340" opacity=".35" />
      <path d="M0 58l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#9e1b22" opacity=".8" />
    </g>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="shine" x1="0" x2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".0" />
        <stop offset=".22" stopColor="#fff" stopOpacity=".28" />
        <stop offset=".32" stopColor="#fff" stopOpacity=".0" />
        <stop offset="1" stopColor="#000" stopOpacity=".18" />
      </linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0b1a31" />
        <stop offset=".6" stopColor="#1f3a66" />
        <stop offset="1" stopColor="#c2643a" />
      </linearGradient>
      <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6b3b22" />
        <stop offset="1" stopColor="#3f2214" />
      </linearGradient>
      <linearGradient id="box" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#13294b" />
        <stop offset="1" stopColor="#0a1830" />
      </linearGradient>
      <pattern id="tile" width="70" height="70" patternUnits="userSpaceOnUse">
        <image href="/img/azulejo-tile.svg" width="70" height="70" />
      </pattern>
    </defs>
  );
}

function Ribbon() {
  return (
    <g>
      <rect x="485" y="260" width="30" height="520" fill="#9e1b22" />
      <rect x="200" y="505" width="600" height="30" fill="#9e1b22" />
      <path d="M500 262c-60-70-150-60-140-10 10 40 90 30 140 10zM500 262c60-70 150-60 140-10-10 40-90 30-140 10z" fill="#9e1b22" />
      <circle cx="500" cy="262" r="16" fill="#7f141a" />
    </g>
  );
}

function Sparkles({ n = 18, seed = 3 }: { n?: number; seed?: number }) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i * 137.5 + seed * 31) % 360;
    const x = (Math.sin(a) * 0.5 + 0.5) * W;
    const y = ((i * 53 + seed * 17) % 380) + 20;
    return { x: Math.round(x), y, r: 1.5 + ((i * 7) % 3) };
  });
  return (
    <g fill="#f6efe2">
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} opacity={0.35 + ((i * 13) % 50) / 100} />
      ))}
    </g>
  );
}

export function ProductArt({ kind, className }: { kind: ArtKind; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={className} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <Defs />
      {kind === "box-closed" && (
        <>
          <rect width={W} height={W} fill="#f6efe2" />
          <rect width={W} height="160" y="840" fill="url(#tile)" opacity=".55" />
          <ellipse cx="500" cy="800" rx="360" ry="40" fill="#0f2340" opacity=".18" />
          <rect x="200" y="260" width="600" height="520" rx="10" fill="url(#box)" />
          <rect x="230" y="290" width="540" height="460" fill="none" stroke="#c8a253" strokeWidth="2" opacity=".7" />
          <Ribbon />
          <text x="500" y="690" textAnchor="middle" fontFamily="Georgia, serif" fontSize="64" fill="#c8a253" letterSpacing="8">2160</text>
          <text x="500" y="725" textAnchor="middle" fontFamily="Georgia, serif" fontSize="20" fill="#f6efe2" letterSpacing="5" opacity=".8">DOURO DOC</text>
        </>
      )}
      {kind === "box-open" && (
        <>
          <rect width={W} height={W} fill="#efe5d2" />
          <rect x="140" y="170" width="720" height="680" rx="12" fill="url(#box)" />
          <rect x="175" y="205" width="650" height="610" rx="6" fill="#0a1830" />
          {[330, 500, 670].map((x, i) => (
            <g key={x}>
              <ellipse cx={x} cy="510" rx="78" ry="300" fill="#060f1e" />
              <Bottle x={x} y={560} color={["#e7a98c", "#e9e4d2", "#2b2b2b"][i]} glass={["#e7a98c", "#d9d3b8", "#2b2b2b"][i]} scale={0.78} />
            </g>
          ))}
          <path d="M140 170l-60-90h840l-60 90z" fill="#13294b" />
        </>
      )}
      {kind === "terrace" && (
        <>
          <rect width={W} height={W} fill="url(#sky)" />
          <Sparkles n={26} seed={5} />
          <circle cx="760" cy="520" r="70" fill="#e9d9b0" opacity=".55" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M0 ${560 + i * 70} Q 250 ${500 + i * 70} 500 ${560 + i * 70} T 1000 ${540 + i * 70} V1000 H0z`} fill={["#2a3f2a", "#324a2f", "#3c5734", "#466239", "#4f6c3e"][i]} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <path key={`v${i}`} d={`M0 ${610 + i * 70} Q 250 ${550 + i * 70} 500 ${610 + i * 70} T 1000 ${590 + i * 70}`} stroke="#6f8f4f" strokeWidth="3" strokeDasharray="2 14" fill="none" />
          ))}
          <rect x="0" y="880" width={W} height="120" fill="url(#wood)" />
          <Bottle x={380} y={680} color="#e7a98c" scale={0.62} />
          <Bottle x={500} y={670} color="#d9d3b8" scale={0.66} />
          <Bottle x={620} y={680} color="#2b2b2b" scale={0.62} />
        </>
      )}
      {kind === "ebook" && (
        <>
          <rect width={W} height={W} fill="#0f2340" />
          <Sparkles n={30} seed={9} />
          <g transform="rotate(-6 500 520)">
            <rect x="270" y="190" width="460" height="640" rx="6" fill="#f6efe2" />
            <rect x="270" y="190" width="460" height="120" fill="url(#tile)" />
            <rect x="300" y="350" width="400" height="2" fill="#c8a253" />
            <text x="500" y="420" textAnchor="middle" fontFamily="Georgia, serif" fontSize="50" fill="#0f2340">Sabores</text>
            <text x="500" y="474" textAnchor="middle" fontFamily="Georgia, serif" fontSize="50" fill="#0f2340">de Portugal</text>
            <text x="500" y="530" textAnchor="middle" fontFamily="Georgia, serif" fontSize="22" fill="#5a6474" fontStyle="italic">Receitas Tradicionais para Partilhar</text>
            <circle cx="500" cy="660" r="80" fill="#c2643a" opacity=".2" />
            <path d="M440 680q60-80 120 0" stroke="#c2643a" strokeWidth="6" fill="none" />
            <rect x="300" y="780" width="400" height="2" fill="#c8a253" />
          </g>
        </>
      )}
      {kind === "bacalhau" && (
        <>
          <rect width={W} height={W} fill="#f6efe2" />
          <rect width={W} height={W} fill="url(#tile)" opacity=".12" />
          <ellipse cx="440" cy="620" rx="330" ry="210" fill="#fff" />
          <ellipse cx="440" cy="620" rx="290" ry="178" fill="#f2ead8" stroke="#1f4e9c" strokeWidth="6" />
          <path d="M290 600c60-70 240-80 300-10-30 70-250 80-300 10z" fill="#f4e6c6" stroke="#d9c79a" strokeWidth="4" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={260 + i * 70} cy={700 - (i % 2) * 24} r="34" fill="#d8a85a" />
          ))}
          <path d="M300 560q140-40 280 0" stroke="#3d6b2f" strokeWidth="5" fill="none" strokeDasharray="4 10" />
          <Bottle x={810} y={560} color="#d9d3b8" scale={0.7} />
          <path d="M700 820h80v-120q-40-30-80 0z" fill="#e9e4d2" opacity=".7" stroke="#c8a253" strokeWidth="2" />
        </>
      )}
      {kind === "table" && (
        <>
          <rect width={W} height={W} fill="#0f2340" />
          <Sparkles n={24} seed={2} />
          <rect x="0" y="600" width={W} height="400" fill="#9e1b22" />
          <rect x="0" y="600" width={W} height="14" fill="#7f141a" />
          {[180, 820].map((x) => (
            <g key={x}>
              <rect x={x - 10} y="420" width="20" height="180" fill="#f6efe2" />
              <ellipse cx={x} cy="400" rx="12" ry="28" fill="#e9d9b0" className="animate-twinkle" />
            </g>
          ))}
          <ellipse cx="500" cy="780" rx="260" ry="80" fill="#f6efe2" />
          <ellipse cx="500" cy="780" rx="200" ry="56" fill="#efe5d2" stroke="#1f4e9c" strokeWidth="5" />
          <Bottle x={350} y={560} color="#e7a98c" scale={0.6} />
          <Bottle x={500} y={545} color="#d9d3b8" scale={0.64} />
          <Bottle x={650} y={560} color="#2b2b2b" scale={0.6} />
          <path d="M60 640c40-30 80-30 120 0M820 640c40-30 80-30 120 0" stroke="#3d6b2f" strokeWidth="8" fill="none" />
        </>
      )}
    </svg>
  );
}

export const GALLERY: { kind: ArtKind; alt: string; note: string }[] = [
  { kind: "box-closed", alt: "Caixa de oferta Trilogia 2160 fechada, com laço", note: "caixa fechada" },
  { kind: "box-open", alt: "Caixa aberta com as três garrafas: rosé, branco e tinto", note: "caixa aberta" },
  { kind: "terrace", alt: "As três garrafas num socalco do Douro ao fim do dia", note: "3 garrafas no Douro" },
  { kind: "ebook", alt: "Livro de receitas Sabores de Portugal, oferecido com a encomenda", note: "livro de receitas" },
  { kind: "bacalhau", alt: "Bacalhau à Lagareiro servido com 2160 Branco", note: "bacalhau com Branco" },
  { kind: "table", alt: "Mesa de Natal com as três garrafas 2160", note: "mesa de Natal" },
];
