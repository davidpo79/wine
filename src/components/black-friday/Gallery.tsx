"use client";

import { useRef, useState, type ReactNode } from "react";
import { jlog } from "@/lib/journey-client";

/**
 * Photo gallery at the top of the Black Friday pages (David, 21/11/2026, like the reference shop): swipe on phones,
 * arrows on desktop, thumbnails below. The first photo is the page's hero; `children` sits on top (free-shipping stamp).
 */
export function Gallery({ images, alt, ratio, children }: { images: string[]; alt: string; ratio: number; children?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const seen = useRef(false);
  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const k = (n + images.length) % images.length;
    el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const k = Math.round(el.scrollLeft / el.clientWidth);
    if (k !== i) {
      setI(k);
      if (!seen.current) {
        seen.current = true;
        jlog("click", { label: "gallery_swipe" });
      }
    }
  };
  return (
    <div className="bf-gal">
      <div className="bf-gal-main">
        <div className="bf-gal-track" ref={track} onScroll={onScroll} style={{ aspectRatio: String(ratio) }} aria-roledescription="carousel">
          {images.map((src, k) => (
            <div key={src} className="bf-gal-slide" aria-label={`${k + 1} / ${images.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={k === 0 ? alt : ""} loading={k === 0 ? "eager" : "lazy"} fetchPriority={k === 0 ? "high" : undefined} draggable={false} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="bf-gal-arrow bf-gal-prev" onClick={() => go(i - 1)} aria-label="‹">
              ‹
            </button>
            <button type="button" className="bf-gal-arrow bf-gal-next" onClick={() => go(i + 1)} aria-label="›">
              ›
            </button>
            <span className="bf-gal-count">
              {i + 1} / {images.length}
            </span>
          </>
        )}
        {children}
      </div>
      {images.length > 1 && (
        <div className="bf-gal-thumbs">
          {images.map((src, k) => (
            <button key={src} type="button" className={k === i ? "on" : ""} onClick={() => go(k)} aria-label={`${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
