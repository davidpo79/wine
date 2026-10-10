import { Footer, Header } from "@/components/landing/Chrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="paper-grain">
        <article className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-ink [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-night [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-1">
          <p className="rounded border border-xmas/30 bg-xmas/5 p-3 text-sm text-xmas">
            Minuta para revisão jurídica. Os campos [[TODO]] têm de ser preenchidos antes da publicação.
          </p>
          <h1 className="mt-6 font-serif text-4xl font-semibold text-night">{title}</h1>
          <p className="text-sm text-muted">Última atualização: {updated}</p>
          {children}
        </article>
      </main>
      <Footer />
    </>
  );
}
