"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, ContractTerms, SignerFields } from "@/lib/creator-contract";

// Client side of the contract signature: details → code by email → draw the signature → signed PDF.
// The text preview updates live with the details typed; the server rebuilds it from the same template when signing.

const LABELS: Record<keyof SignerFields, [string, string]> = {
  name: ["Nombre y apellidos", "name"],
  idNumber: ["DNI / NIE", "off"],
  address: ["Domicilio completo", "street-address"],
  city: ["Ciudad", "address-level2"],
  phone: ["Teléfono", "tel"],
  iban: ["IBAN (para el pago)", "off"],
};

function Rich({ s }: { s: string }) {
  return (
    <>
      {s.split(/(\*\*[^*]+\*\*)/).map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : <span key={i}>{t}</span>))}
    </>
  );
}

function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#102d21";
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    strokes.current++;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0;
    onChange(null);
  };
  return (
    <div>
      <canvas
        ref={ref}
        data-testid="signature-pad"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-paper-2 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <button type="button" onClick={clear} className="mt-1 text-sm text-muted underline">
        Borrar firma
      </button>
    </div>
  );
}

export function ContractSign(p: { token: string; id: number; email: string; signed: boolean; terms: ContractTerms; initial: Partial<SignerFields>; blocks: Block[] }) {
  const [f, setF] = useState<SignerFields>({ name: p.initial.name ?? "", idNumber: p.initial.idNumber ?? "", address: p.initial.address ?? "", city: p.initial.city ?? "", phone: p.initial.phone ?? "", iban: p.initial.iban ?? "" });
  const [step, setStep] = useState<"details" | "code" | "done">(p.signed ? "done" : "details");
  const [code, setCode] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Live preview: fill the blanks of the server text with what is typed (the server rebuilds it when signing).
  const blocks = useMemo(() => {
    if (p.signed) return p.blocks;
    const blank = "________________";
    const order: (keyof SignerFields)[] = ["name", "idNumber", "address", "phone"];
    return p.blocks.map((b, i) => {
      if (!b.p) return b;
      let s = b.p;
      if (i === 1) for (const k of order) s = s.replace(p.initial[k]?.trim() ? p.initial[k]!.trim() : blank, f[k].trim() || blank);
      if (s.includes("cuenta IBAN")) s = s.replace(/IBAN \S+\./, `IBAN ${f.iban.trim() || blank}.`);
      if (s.includes("firman electrónicamente")) s = s.replace(/ en .*?, a /, ` en ${f.city.trim() || blank}, a `);
      return { p: s };
    });
  }, [p.blocks, p.initial, p.signed, f]);

  const post = async (body: object) => {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/creadores/contrato/${p.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) return true;
    setError(j?.error ?? "No se ha podido completar. Inténtalo de nuevo.");
    return false;
  };

  const input = "mt-1 w-full rounded-lg border border-paper-2 bg-white px-3 py-2.5 text-base outline-none focus:border-azulejo";
  return (
    <main className="min-h-screen bg-paper pb-16 text-night">
      <header className="border-b border-paper-2 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <img src="/brand/logo.svg" alt="Wine Portugal" className="h-10" />
          <span className="text-xs text-muted">Contrato n.º {p.id}</span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5">
        <h1 className="mt-8 font-serif text-3xl font-semibold">Contrato de colaboración para la creación de contenido (UGC)</h1>
        <p className="mt-1 text-muted">Producción de vídeos y cesión de derechos de propiedad intelectual e imagen</p>

        <article data-testid="contract-text" className="mt-6 max-h-[60vh] overflow-y-auto rounded-xl border border-paper-2 bg-white p-5 text-[15px] leading-relaxed sm:p-7">
          {blocks.map((b, i) =>
            b.h ? (
              <h2 key={i} className="mb-1 mt-5 text-sm font-bold uppercase tracking-wide text-[#5e2234]">{b.h}</h2>
            ) : b.li ? (
              <p key={i} className="ml-3 mt-1"><Rich s={b.li} /></p>
            ) : (
              <p key={i} className="mt-2"><Rich s={b.p!} /></p>
            ),
          )}
        </article>

        {step === "done" ? (
          <div data-testid="contract-signed" className="mt-6 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
            <p className="text-3xl">✅</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold">Contrato firmado</h2>
            <p className="mt-1 text-muted">Te hemos enviado una copia en PDF a {p.email}.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <a href={`/es/creadores/subir/${p.token}`} className="inline-block rounded-full bg-azulejo px-6 py-3 font-semibold text-white">Subir mis vídeos</a>
              <a href={`/api/creadores/contrato/${p.token}/pdf`} className="inline-block rounded-full border border-azulejo px-6 py-3 font-semibold text-azulejo">Descargar el PDF</a>
            </div>
          </div>
        ) : (
          <section className="mt-6 rounded-xl border border-paper-2 bg-white p-5 sm:p-7">
            <h2 className="font-serif text-xl font-semibold">{step === "details" ? "1. Tus datos" : "2. Firma"}</h2>
            {step === "details" && (
              <form
                className="mt-3 grid gap-4 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await post({ action: "code", fields: f })) setStep("code");
                }}
              >
                {(Object.keys(LABELS) as (keyof SignerFields)[]).map((k) => (
                  <label key={k} className={`block text-sm font-medium ${k === "address" ? "sm:col-span-2" : ""}`}>
                    {LABELS[k][0]}
                    <input name={k} required value={f[k]} autoComplete={LABELS[k][1]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} />
                  </label>
                ))}
                <p className="text-sm text-muted sm:col-span-2">Te enviaremos un código de 6 cifras a <b>{p.email}</b> para confirmar tu identidad.</p>
                {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
                <button disabled={busy} className="rounded-full bg-azulejo py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2">
                  {busy ? "Enviando…" : "Continuar y recibir el código"}
                </button>
              </form>
            )}
            {step === "code" && (
              <div className="mt-3 space-y-4">
                <label className="block text-sm font-medium">
                  Código recibido en {p.email}
                  <input name="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} tracking-[0.4em]`} />
                </label>
                <div>
                  <p className="text-sm font-medium">Dibuja tu firma</p>
                  <SignaturePad onChange={setSig} />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input name="accept" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
                  <span>He leído el contrato completo y acepto todas sus cláusulas, incluida la cesión de derechos de propiedad intelectual y de imagen.</span>
                </label>
                {error && <p className="text-sm text-red-700">{error}</p>}
                <button
                  disabled={busy || code.length !== 6 || !sig || !accept}
                  onClick={async () => {
                    if (await post({ action: "sign", fields: f, code, accept: true, signature: sig })) setStep("done");
                  }}
                  className="w-full rounded-full bg-azulejo py-3 font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Firmando…" : "Firmar el contrato"}
                </button>
                <button type="button" onClick={() => setStep("details")} className="w-full text-sm text-muted underline">
                  Corregir mis datos o pedir otro código
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
