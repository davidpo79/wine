"use client";

import { useState } from "react";

// Video upload for UGC creators, any size: each file is cut into parts and sent part by part (retrying a failed part),
// so a long 4K video goes through on a phone connection. Up to 3 parts in flight at once.

type Done = { id: number; name: string; size: number; status: string; note: string | null };
type Job = { key: string; name: string; size: number; sent: number; state: "uploading" | "done" | "error"; error?: string };

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const STATUS: Record<string, [string, string]> = {
  new: ["Recibido · en revisión", "bg-amber-100 text-amber-800"],
  approved: ["Aprobado ✓", "bg-green-100 text-green-800"],
  rejected: ["Necesita cambios", "bg-red-100 text-red-800"],
};

export function CreatorUpload(p: { token: string; name: string; signed: boolean; videos: number; files: Done[] }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const api = (a: string, q = "") => `/api/creadores/subir/${p.token}?a=${a}${q}`;
  const patch = (key: string, v: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...v } : j)));

  async function upload(file: File) {
    const key = `${file.name}-${file.size}-${Date.now()}`;
    setJobs((js) => [...js, { key, name: file.name, size: file.size, sent: 0, state: "uploading" }]);
    try {
      const s = await fetch(api("start"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, type: file.type }) });
      const sj = await s.json();
      if (!s.ok) throw new Error(sj.error ?? "Error");
      const { u, partSize } = sj as { u: number; partSize: number };
      const total = Math.ceil(file.size / partSize);
      const parts: { PartNumber: number; ETag: string }[] = [];
      let next = 1;
      let sent = 0;
      const worker = async () => {
        while (next <= total) {
          const n = next++;
          const chunk = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
          for (let attempt = 1; ; attempt++) {
            try {
              const r = await fetch(api("part", `&u=${u}&n=${n}`), { method: "POST", body: chunk });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error ?? "Error");
              parts.push({ PartNumber: n, ETag: j.ETag });
              break;
            } catch (e) {
              if (attempt >= 5) throw e;
              await new Promise((ok) => setTimeout(ok, attempt * 2000));
            }
          }
          sent += chunk.size;
          patch(key, { sent });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const c = await fetch(api("complete"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ u, parts }) });
      if (!c.ok) throw new Error((await c.json().catch(() => ({}))).error ?? "Error");
      patch(key, { state: "done", sent: file.size });
    } catch (e) {
      patch(key, { state: "error", error: e instanceof Error ? e.message : "Error" });
    }
  }

  return (
    <main className="min-h-screen bg-paper pb-16 text-night">
      <header className="border-b border-paper-2 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <img src="/brand/logo.svg" alt="Wine Portugal" className="h-10" />
          <span className="text-xs text-muted">Creadores UGC</span>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5">
        <h1 className="mt-8 font-serif text-3xl font-semibold">Hola {p.name.split(" ")[0]}, sube tus vídeos</h1>
        {!p.signed ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">Primero tienes que firmar tu contrato de colaboración. Abre el enlace que te enviamos por email o SMS.</p>
        ) : (
          <>
            <p className="mt-2 text-muted">
              Acordamos {p.videos} {p.videos === 1 ? "vídeo" : "vídeos"}. Súbelos en la máxima calidad, sin marcas de agua. No hay límite de tamaño: puedes subir los archivos originales del móvil.
            </p>
            <label data-testid="upload-drop" className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-azulejo/40 bg-white px-6 py-12 text-center hover:border-azulejo">
              <span className="text-4xl">🎬</span>
              <span className="mt-2 text-lg font-semibold">Elegir vídeos</span>
              <span className="text-sm text-muted">Puedes elegir varios a la vez</span>
              <input
                type="file"
                multiple
                accept="video/*,image/*"
                className="hidden"
                onChange={(e) => {
                  for (const f of Array.from(e.target.files ?? [])) void upload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {jobs.length > 0 && (
              <ul className="mt-6 space-y-3" data-testid="upload-jobs">
                {jobs.map((j) => (
                  <li key={j.key} className="rounded-xl border border-paper-2 bg-white p-4">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{j.name}</span>
                      <span className="shrink-0 text-muted">
                        {j.state === "done" ? "✓ Subido" : j.state === "error" ? "Error" : `${Math.floor((j.sent / j.size) * 100)}%`} · {mb(j.size)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
                      <div className={`h-full ${j.state === "error" ? "bg-red-600" : j.state === "done" ? "bg-green-600" : "bg-azulejo"}`} style={{ width: `${Math.max(3, (j.sent / j.size) * 100)}%` }} />
                    </div>
                    {j.error && <p className="mt-1 text-sm text-red-700">{j.error} · vuelve a elegir el archivo para reintentarlo.</p>}
                  </li>
                ))}
              </ul>
            )}
            {jobs.some((j) => j.state === "uploading") && <p className="mt-3 text-sm text-muted">No cierres esta página hasta que termine la subida.</p>}
            {p.files.length > 0 && (
              <>
                <h2 className="mt-10 font-serif text-xl font-semibold">Tus vídeos enviados</h2>
                <ul className="mt-3 space-y-2">
                  {p.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-paper-2 bg-white p-3 text-sm">
                      <span className="truncate">{f.name} <span className="text-muted">· {mb(f.size)}</span>{f.note && <span className="block text-muted">{f.note}</span>}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[f.status]?.[1] ?? ""}`}>{STATUS[f.status]?.[0] ?? f.status}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
