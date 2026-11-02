"use client";

import type { Locale } from "@/lib/markets";

/**
 * Pedro (Martin Boutique Wines) on camera, about the 2160 wines. No text is burned into the picture: the subtitles are
 * WebVTT tracks in every site language, the visitor's on by default. 16:9 on wide screens, 9:16 on phones; nothing
 * downloads until play (preload="none", poster only).
 */
const BASE = "/video/producer/pedro";
export function ProducerVideo({ locale, label }: { locale: Locale; label: string }) {
  const tracks = <track kind="subtitles" srcLang={locale} src={`${BASE}.${locale}.vtt`} label={locale.toUpperCase()} default />;
  return (
    <div className="producervideo">
      <video className="pv-wide" controls playsInline preload="none" poster={`${BASE}-16x9.webp`} aria-label={label} crossOrigin="anonymous">
        <source src={`${BASE}-16x9.mp4`} type="video/mp4" />
        {tracks}
      </video>
      <video className="pv-tall" controls playsInline preload="none" poster={`${BASE}-9x16.webp`} aria-label={label} crossOrigin="anonymous">
        <source src={`${BASE}-9x16.mp4`} type="video/mp4" />
        {tracks}
      </video>
    </div>
  );
}
