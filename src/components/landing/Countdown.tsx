"use client";

import { useEffect, useState } from "react";

/** Real countdown to the Christmas cutoff from settings. Renders nothing before mount (no hydration mismatch) or after the cutoff. */
export function DeadlineCountdown({ cutoffIso, className, short = false }: { cutoffIso: string; className?: string; short?: boolean }) {
  const cutoff = new Date(cutoffIso).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null || now >= cutoff) return null;
  const ms = cutoff - now;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const left = d > 7 ? `${d} dias` : d >= 1 ? `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m` : `${h}h ${String(m).padStart(2, "0")}m`;
  return (
    <span className={className} role="timer" aria-live="off">
      {short ? `Faltam ${left} para o Natal` : `Faltam ${left} para encomendar a tempo do Natal`}
    </span>
  );
}
