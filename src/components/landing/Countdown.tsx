"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Real countdown to the Christmas cutoff from settings (dias : horas : min : seg), ticking every second.
 * Renders nothing before mount (no hydration mismatch) or after the cutoff.
 */
export function DeadlineCountdown({ cutoffIso, className, short = false }: { cutoffIso: string; className?: string; short?: boolean }) {
  const cutoff = new Date(cutoffIso).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null || now >= cutoff) return null;
  const s = Math.floor((cutoff - now) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = `Faltam ${d} dias, ${h} horas e ${m} minutos para encomendar a tempo do Natal`;
  if (short) {
    return (
      <span className={className} role="timer" aria-label={label}>
        Natal: {d}d {pad(h)}:{pad(m)}:{pad(sec)}
      </span>
    );
  }
  return (
    <span className={`${className ?? ""} countdownbox`} role="timer" aria-label={label}>
      <span className="cdtitle">Encomendas a tempo do Natal fecham em</span>
      <span className="cdunits" aria-hidden="true">
        {([[d, "dias"], [h, "horas"], [m, "min"], [sec, "seg"]] as const).map(([v, u]) => (
          <span key={u} className="cdunit">
            <b>{u === "dias" ? v : pad(v)}</b>
            <small>{u}</small>
          </span>
        ))}
      </span>
    </span>
  );
}
