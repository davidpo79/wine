"use client";

import { useActionState, useState } from "react";
import { submitReview } from "./actions";

type Copy = { ratingLabel: string; stars: string[]; titleLabel: string; textLabel: string; textPlaceholder: string; nameLabel: string; publishConsent: string; submit: string; sending: string; thanksTitle: string; thanksText: string };

export function ReviewForm({ o, t, initial, copy }: { o: string; t: string; initial: { rating: number; title: string; text: string; name: string }; copy: Copy }) {
  const [state, action, pending] = useActionState(submitReview, undefined);
  const [rating, setRating] = useState(initial.rating);
  const [hover, setHover] = useState(0);
  if (state?.done)
    return (
      <div className="mt-8 rounded-lg border border-gold/50 bg-white p-6 text-center">
        <p className="text-4xl text-gold">{"★".repeat(rating)}</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-night">{copy.thanksTitle}</h2>
        <p className="mt-2 text-ink">{copy.thanksText}</p>
      </div>
    );
  const shown = hover || rating;
  return (
    <form action={action} className="mt-8 space-y-5 rounded-lg border bg-white p-5">
      <input type="hidden" name="o" value={o} />
      <input type="hidden" name="t" value={t} />
      <input type="hidden" name="rating" value={rating || ""} />
      <fieldset>
        <legend className="text-sm font-semibold text-ink">{copy.ratingLabel}</legend>
        <div className="mt-1 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} · ${copy.stars[n - 1]}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className={`text-4xl leading-none transition-colors ${n <= shown ? "text-gold" : "text-paper-2"}`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm text-muted">{shown ? copy.stars[shown - 1] : ""}</span>
        </div>
      </fieldset>
      <label className="block text-sm">
        <span className="font-semibold text-ink">{copy.titleLabel}</span>
        <input name="title" maxLength={120} defaultValue={initial.title} className="mt-1 w-full rounded-md border border-paper-2 px-3 py-2.5" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold text-ink">{copy.textLabel}</span>
        <textarea name="text" rows={5} maxLength={3000} defaultValue={initial.text} placeholder={copy.textPlaceholder} className="mt-1 w-full rounded-md border border-paper-2 px-3 py-2.5" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold text-ink">{copy.nameLabel}</span>
        <input name="name" maxLength={40} required defaultValue={initial.name} className="mt-1 w-full rounded-md border border-paper-2 px-3 py-2.5" />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="consent" required className="mt-1 accent-xmas" />
        <span>{copy.publishConsent}</span>
      </label>
      {state?.error && <p className="text-sm font-semibold text-xmas">{state.error}</p>}
      <button type="submit" disabled={pending || !rating} className="min-h-12 w-full rounded-md bg-xmas px-4 font-bold text-white disabled:opacity-50">
        {pending ? copy.sending : copy.submit}
      </button>
    </form>
  );
}
