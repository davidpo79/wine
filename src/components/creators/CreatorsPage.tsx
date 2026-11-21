"use client";

import { useState } from "react";

// What a creator gets for one video. Change here (and in the ads) if the offer changes.
export const FEE = "60 €";

const STEPS = [
  ["Te apuntas", "Rellena el formulario con tu perfil y, si tienes, ejemplos de vídeos."],
  ["Te enviamos el vino", "Si encajas, te escribimos y te mandamos gratis una caja de 6 botellas del Douro a casa."],
  ["Grabas y cobras", `Grabas un vídeo vertical de 20 a 40 s con tu móvil, nos lo mandas y te pagamos ${FEE}.`],
];

const WANT = [
  "Vídeos naturales, como si se lo contaras a un amigo: abrir la caja, servir una copa, una cena en casa.",
  "Mayor de 18 años y residente en España.",
  "No hace falta tener muchos seguidores: nos importa que el vídeo transmita.",
  "El vídeo lo usamos como anuncio en Instagram y Facebook (con tu permiso, claro).",
];

export function CreatorsPage() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    setState("sending");
    setError("");
    const r = await fetch("/api/creadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: v("name"),
        email: v("email"),
        phone: v("phone"),
        city: v("city"),
        handle: v("handle"),
        followers: v("followers"),
        portfolio: v("portfolio"),
        message: v("message"),
        consent: f.get("consent") === "on",
        website: v("website") ?? "",
      }),
    }).catch(() => null);
    if (r?.ok) return setState("done");
    const j = await r?.json().catch(() => null);
    setError(j?.error ?? "No se ha podido enviar. Inténtalo de nuevo.");
    setState("idle");
  }

  const input = "mt-1 w-full rounded-lg border border-paper-2 bg-white px-3 py-2.5 text-base outline-none focus:border-azulejo";
  return (
    <main className="min-h-screen bg-paper text-night">
      <section className="relative overflow-hidden bg-night text-white">
        <img src="/lp/bf/poco-life-pour.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="relative mx-auto max-w-3xl px-5 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-soft">Wine Portugal · Creadores UGC</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">¿Grabas vídeos? Buscamos creadores de contenido en España</h1>
          <p className="mt-4 max-w-xl text-lg text-white/90">
            Te enviamos una caja de 6 vinos del Douro y te pagamos <strong>{FEE} por vídeo</strong>. Un vídeo corto y natural, grabado con tu móvil.
          </p>
          <a href="#form" className="mt-7 inline-block rounded-full bg-gold px-7 py-3 font-semibold text-night">Quiero participar</a>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="font-serif text-2xl font-semibold">Cómo funciona</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-paper-2 bg-white p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-azulejo text-sm font-semibold text-white">{i + 1}</span>
              <p className="mt-3 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <h2 className="mt-10 font-serif text-2xl font-semibold">Qué buscamos</h2>
        <ul className="mt-4 space-y-2">
          {WANT.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="text-azulejo">✓</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="form" className="mx-auto max-w-xl px-5 pb-20">
        <div className="rounded-2xl border border-paper-2 bg-white p-6 shadow-sm sm:p-8">
          {state === "done" ? (
            <div className="py-6 text-center" data-testid="creator-done">
              <p className="text-4xl">🍷</p>
              <h2 className="mt-3 font-serif text-2xl font-semibold">¡Gracias! Hemos recibido tu solicitud</h2>
              <p className="mt-2 text-muted">Revisamos los perfiles en pocos días y te escribimos por email o WhatsApp si encajas.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" data-testid="creator-form">
              <h2 className="font-serif text-2xl font-semibold">Apúntate</h2>
              <label className="block text-sm font-medium">
                Nombre *
                <input name="name" required minLength={2} maxLength={80} className={input} autoComplete="name" />
              </label>
              <label className="block text-sm font-medium">
                Email *
                <input name="email" type="email" required maxLength={160} className={input} autoComplete="email" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Móvil / WhatsApp
                  <input name="phone" type="tel" maxLength={30} className={input} autoComplete="tel" />
                </label>
                <label className="block text-sm font-medium">
                  Ciudad
                  <input name="city" maxLength={60} className={input} autoComplete="address-level2" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Tu Instagram o TikTok *
                  <input name="handle" required minLength={2} maxLength={120} placeholder="@tuusuario" className={input} />
                </label>
                <label className="block text-sm font-medium">
                  Seguidores (aprox.)
                  <input name="followers" maxLength={30} className={input} />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Enlace a ejemplos de tus vídeos
                <input name="portfolio" type="url" maxLength={300} placeholder="https://" className={input} />
              </label>
              <label className="block text-sm font-medium">
                ¿Algo más que quieras contarnos?
                <textarea name="message" rows={3} maxLength={1000} className={input} />
              </label>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              <label className="flex items-start gap-2 text-sm text-muted">
                <input name="consent" type="checkbox" required className="mt-1" />
                <span>
                  Acepto que Wine Portugal use estos datos para valorar mi candidatura y contactarme sobre esta colaboración (<a href="/es/privacidad" className="underline">privacidad</a>).
                </span>
              </label>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={state === "sending"} className="w-full rounded-full bg-azulejo py-3 font-semibold text-white disabled:opacity-60">
                {state === "sending" ? "Enviando…" : "Enviar solicitud"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
