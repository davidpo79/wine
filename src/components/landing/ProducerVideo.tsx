"use client";

import type { Locale } from "@/lib/markets";

/**
 * Pedro (Martin Boutique Wines) on camera, about the 2160 wines. No text is burned into the picture: the subtitles are
 * WebVTT tracks in every site language, the visitor's on by default. 16:9 on wide screens, 9:16 on phones; nothing
 * downloads until play (preload="none", poster only).
 */
// wideOnly: the 16:9 cut on phones too (the Black Friday page: in the 9:16 crop the 2160 label in Pedro's hand is legible).
export function ProducerVideo({
  locale,
  label,
  base = "/video/producer/pedro",
  wideOnly = false,
}: {
  locale: Locale;
  label: string;
  base?: string;
  wideOnly?: boolean;
}) {
  const BASE = base;
  const tracks = (
    <track
      kind="subtitles"
      srcLang={locale}
      src={`${BASE}.${locale}.vtt`}
      label={locale.toUpperCase()}
      default
    />
  );
  return (
    <div className={`producervideo${wideOnly ? " pv-wideonly" : ""}`}>
      <video
        className="pv-wide"
        controls
        playsInline
        preload="none"
        poster={`${BASE}-16x9.webp`}
        aria-label={label}
        crossOrigin="anonymous"
      >
        <source src={`${BASE}-16x9.mp4`} type="video/mp4" />
        {tracks}
      </video>
      {!wideOnly && (
        <video
          className="pv-tall"
          controls
          playsInline
          preload="none"
          poster={`${BASE}-9x16.webp`}
          aria-label={label}
          crossOrigin="anonymous"
        >
          <source src={`${BASE}-9x16.mp4`} type="video/mp4" />
          {tracks}
        </video>
      )}
    </div>
  );
}
