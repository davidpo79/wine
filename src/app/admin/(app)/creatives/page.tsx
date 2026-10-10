import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { publicUrl } from "@/lib/bucket";
import { creativeAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

type SP = { concept?: string; status?: string };

export default async function Creatives({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await db.select().from(schema.creatives).orderBy(asc(schema.creatives.conceptKey), asc(schema.creatives.variation), asc(schema.creatives.format));
  const rows = all.filter((c) => (!sp.concept || c.conceptKey === sp.concept) && (!sp.status || c.status === sp.status));
  // Group the 3 formats of one ad (concept + variation) into one card.
  const groups = new Map<string, typeof rows>();
  for (const c of rows) {
    const k = `${c.conceptKey}_v${c.variation}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const concepts = [...new Set(all.map((c) => c.conceptKey))];
  const count = (s: string) => new Set(all.filter((c) => c.status === s).map((c) => `${c.conceptKey}_v${c.variation}`)).size;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Anúncios · revisão</h1>
        <a href="/admin/export/creatives" className="rounded border bg-white px-3 py-2 text-sm font-medium hover:bg-paper">Exportar aprovados (ZIP)</a>
      </div>
      <p className="mt-1 text-sm text-muted">Aprovados {count("approved")} · Rejeitados {count("rejected")} · Por rever {count("draft")}</p>
      <form className="mt-3 flex flex-wrap gap-3 text-sm">
        <select name="concept" defaultValue={sp.concept ?? ""} className="rounded border p-1.5">
          <option value="">Todos os conceitos</option>
          {concepts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="rounded border p-1.5">
          <option value="">Todos os estados</option>
          <option value="draft">Por rever</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Rejeitados</option>
        </select>
        <button className="rounded bg-night px-3 py-1.5 font-semibold text-white">Filtrar</button>
      </form>
      {groups.size === 0 && <p className="mt-8 text-muted">Ainda não há anúncios. São gerados na fase 6, depois da aprovação da página.</p>}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[...groups.entries()].map(([k, items]) => {
          const c = items[0];
          return (
            <article key={k} className={`rounded-lg border-2 bg-white p-4 ${c.status === "approved" ? "border-green-500" : c.status === "rejected" ? "border-red-400" : "border-transparent"}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-mono font-semibold">{k}</h2>
                <span className="text-xs text-muted">versão {c.version} · {c.status}</span>
              </div>
              <div className="mt-3 flex items-start gap-2">
                {items.map((it) => (
                  <figure key={it.id} className="flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(it.imageKey)} alt={`${k} ${it.format}`} className="w-full rounded border" loading="lazy" />
                    <figcaption className="text-center text-xs text-muted">{it.format}</figcaption>
                  </figure>
                ))}
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div><dt className="text-xs uppercase text-muted">Texto principal</dt><dd className="whitespace-pre-wrap">{c.primaryText}</dd></div>
                <div><dt className="text-xs uppercase text-muted">Título</dt><dd className="font-semibold">{c.headline}</dd></div>
                <div><dt className="text-xs uppercase text-muted">Descrição</dt><dd>{c.description}</dd></div>
                <div><dt className="text-xs uppercase text-muted">CTA · utm_content</dt><dd>{c.cta} · {c.utmContent}</dd></div>
              </dl>
              {c.feedback && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">Feedback: {c.feedback}</p>}
              {items.map((it) => it.id).slice(0, 1).map((id) => (
                <ActionForm key={id} action={creativeAction} className="mt-3">
                  {items.map((it) => <input key={it.id} type="hidden" name="ids" value={it.id} />)}
                  <input type="hidden" name="id" value={id} />
                  <textarea name="feedback" rows={2} placeholder="Feedback (obrigatório para rejeitar)" defaultValue={c.feedback ?? ""} className="w-full rounded border p-2 text-sm" />
                  <div className="mt-2 flex gap-2">
                    <Submit name="decision" value="approved" className="!bg-green-700">Aprovar</Submit>
                    <Submit name="decision" value="rejected" className="!bg-red-700">Rejeitar</Submit>
                  </div>
                </ActionForm>
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}
