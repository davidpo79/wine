// National do-not-call check (Portugal: the DGC opposition list). No source is wired yet, so the adapter answers
// "unavailable" and every dial is refused until one is. Wire a real source with setDncAdapter at startup.

export type DncResult = { status: "clear" | "listed" | "unavailable" };
type Adapter = (e164: string) => Promise<DncResult>;

let adapter: Adapter | null = null;

export function setDncAdapter(a: Adapter | null) {
  adapter = a;
}

export async function checkDnc(e164: string): Promise<DncResult> {
  if (!adapter) return { status: "unavailable" };
  try {
    const r = await adapter(e164);
    return r?.status === "clear" || r?.status === "listed" ? r : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
