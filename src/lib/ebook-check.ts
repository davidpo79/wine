// Admin → E-book check: for each language, whether customers are offered the recipe guide and whether the PDF they
// would get is really in the bucket (a link to a missing file would reach the customer as a broken download).
import { bucketConfigured, headObject, presignedGet, readHead } from "./bucket";
import { EBOOK_LOCALES, ebookFileName, ebookKey, ebookTitle, guideFor } from "./ebook";
import type { Locale } from "./markets";
import type { Settings } from "./settings-defaults";

export type EbookStatus = {
  locale: Locale;
  title: string;
  fileName: string;
  key: string;
  offered: boolean;
  upload: Settings["ebook_files"][string] | null;
  file: { bytes: number; lastModified: Date | null; isPdf: boolean } | null;
  error: string | null;
  testLink: string | null;
  verdict: "ok" | "broken" | "off" | "unchecked";
  note: string;
};

const TEST_LINK_SECONDS = 15 * 60;

export async function ebookStatuses(settings: Settings): Promise<EbookStatus[]> {
  const canCheck = bucketConfigured();
  return Promise.all(
    EBOOK_LOCALES.map(async (locale): Promise<EbookStatus> => {
      const key = ebookKey(locale);
      const offered = guideFor(settings, locale);
      const base = { locale, title: ebookTitle(locale), fileName: ebookFileName(locale), key, offered, upload: settings.ebook_files?.[locale] ?? null };
      if (!canCheck) return { ...base, file: null, error: null, testLink: null, verdict: "unchecked", note: "The storage bucket is not configured: nothing can be checked." };
      let file: EbookStatus["file"] = null;
      let error: string | null = null;
      try {
        const h = await headObject(key);
        if (h) file = { bytes: h.bytes, lastModified: h.lastModified, isPdf: (await readHead(key, 5)).toString("latin1") === "%PDF-" };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const testLink = file ? await presignedGet(key, TEST_LINK_SECONDS, ebookFileName(locale)) : null;
      if (error) return { ...base, file, error, testLink, verdict: "unchecked", note: "The bucket did not answer; try again." };
      if (offered && !file) return { ...base, file, error, testLink, verdict: "broken", note: "Offered, but the PDF is missing: customers get a download link that does not work. Upload the PDF." };
      if (offered && file && !file.isPdf) return { ...base, file, error, testLink, verdict: "broken", note: "Offered, but the file in the bucket is not a PDF. Upload the PDF again." };
      if (offered) return { ...base, file, error, testLink, verdict: "ok", note: "Customers in this language get this PDF (confirmation email and thank-you page)." };
      if (file) return { ...base, file, error, testLink, verdict: "off", note: "The PDF is uploaded but turned off: customers in this language get no guide. Turn it on in Settings." };
      return { ...base, file, error, testLink, verdict: "off", note: "No PDF: customers in this language get no guide, and the landing page does not mention it." };
    }),
  );
}
