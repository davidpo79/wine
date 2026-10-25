import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ebookStatuses, type EbookStatus } from "@/lib/ebook-check";
import { LOCALE_INFO } from "@/lib/markets";
import { lisbonDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const VERDICT: Record<EbookStatus["verdict"], { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-green-100 text-green-800" },
  broken: { label: "Broken", cls: "bg-red-100 text-red-800" },
  off: { label: "Not offered", cls: "bg-gray-100 text-gray-700" },
  unchecked: { label: "Not checked", cls: "bg-amber-100 text-amber-800" },
};

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Admin → E-book check: which PDF each language's customers get, read live from the bucket. */
export default async function EbookCheck() {
  await requireAdmin({ role: "admin" });
  const rows = await ebookStatuses(await getSettings());
  const broken = rows.filter((r) => r.verdict === "broken").length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-semibold">E-book check</h1>
        <p className="text-sm text-muted">
          For each language: whether customers get the recipe guide, and whether its PDF is really in the storage bucket (checked now). Open the test download to see
          exactly the file a customer gets; the link works for 15 minutes. Upload or turn editions on and off in <Link href="/admin/settings" className="underline">Settings → Gift e-book</Link>.
        </p>
      </div>
      {broken > 0 && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">{broken} language{broken === 1 ? "" : "s"} offered with a PDF that does not work. Customers in that language get a broken link.</p>}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">Language</th>
              <th className="p-3">Status</th>
              <th className="p-3">Offered to customers</th>
              <th className="p-3">File in the bucket</th>
              <th className="p-3">Customer gets</th>
              <th className="p-3">Test</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.locale} className="border-t align-top">
                <td className="p-3">
                  <p className="font-semibold">{LOCALE_INFO[r.locale].name} ({r.locale.toUpperCase()})</p>
                  <p className="text-xs text-muted">{r.title}</p>
                </td>
                <td className="p-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].label}</span>
                  <p className="mt-1 max-w-xs text-xs text-muted">{r.note}</p>
                  {r.error && <p className="mt-1 max-w-xs break-words font-mono text-[11px] text-red-700">{r.error}</p>}
                </td>
                <td className="p-3">
                  {r.offered ? "Yes" : "No"}
                  {r.locale === "pt" && <span className="block text-xs text-muted">always</span>}
                </td>
                <td className="p-3">
                  {r.file ? (
                    <>
                      <p>
                        {mb(r.file.bytes)}
                        {r.file.isPdf ? "" : " · not a PDF"}
                      </p>
                      {r.file.lastModified && <p className="text-xs text-muted">{lisbonDateTime(r.file.lastModified)}</p>}
                    </>
                  ) : (
                    <p className="text-muted">{r.verdict === "unchecked" ? "?" : "None"}</p>
                  )}
                  {r.upload && <p className="text-xs text-muted">Uploaded by {r.upload.by}</p>}
                  <p className="mt-1 font-mono text-[11px] text-muted">{r.key}</p>
                </td>
                <td className="p-3 font-mono text-xs">{r.offered ? r.fileName : "no guide"}</td>
                <td className="p-3">
                  {r.testLink ? (
                    <a href={r.testLink} className="whitespace-nowrap rounded border bg-white px-3 py-1.5 font-medium hover:bg-paper">
                      Download
                    </a>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
