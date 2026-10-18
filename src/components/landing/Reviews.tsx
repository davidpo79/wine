"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/rich";
import { LOCALE_INFO } from "@/lib/markets";

export type ReviewsData = {
  count: number;
  average: number;
  list: { id: number; rating: number; title: string | null; text: string | null; name: string; country: string; date: string; reply: string | null }[];
};

const Stars = ({ n, className = "" }: { n: number; className?: string }) => (
  <span className={`reviewstars ${className}`} aria-hidden>
    {"★".repeat(Math.round(n))}
    <span className="off">{"★".repeat(5 - Math.round(n))}</span>
  </span>
);

/** Verified customer reviews (approved in Admin → Reviews). Hidden until there is at least one. */
export function Reviews({ data }: { data: ReviewsData }) {
  const { d, locale } = useI18n();
  const t = d.review;
  const [all, setAll] = useState(false);
  if (!data.count) return null;
  const intl = LOCALE_INFO[locale].intl;
  const region = (() => {
    try {
      return new Intl.DisplayNames([intl], { type: "region" });
    } catch {
      return null;
    }
  })();
  const avg = data.average.toLocaleString(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const shown = all ? data.list : data.list.slice(0, 6);
  return (
    <section className="section wrap reviews" id="avaliacoes">
      <div className="sectionhead">
        <div className="eyebrow">{t.sectionEyebrow}</div>
        <h2>{t.sectionTitle}</h2>
        <p className="reviewsavg">
          <Stars n={data.average} /> <strong>{fmt(data.count === 1 ? t.averageOne : t.average, { avg, n: data.count })}</strong>
        </p>
      </div>
      <ul className="reviewlist">
        {shown.map((r) => (
          <li key={r.id} className="reviewcard">
            <div className="reviewtop">
              <Stars n={r.rating} />
              <span className="reviewverified">✓ {t.verified}</span>
            </div>
            {r.title && <p className="reviewtitle">{r.title}</p>}
            {r.text && <p className="reviewtext">{r.text}</p>}
            <p className="reviewmeta">
              {r.name} · {region?.of(r.country) ?? r.country} · {new Date(r.date).toLocaleDateString(intl, { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {r.reply && (
              <p className="reviewreply">
                <strong>{t.reply}:</strong> {r.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
      {!all && data.list.length > 6 && (
        <p className="reviewsmore">
          <button type="button" onClick={() => setAll(true)}>{t.more}</button>
        </p>
      )}
      <p className="reviewshow">{t.howVerified}</p>
    </section>
  );
}
