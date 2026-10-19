// Portugal HR callers: approved calling hours, read in Lisbon time.
//
// Spec section 6: before every dial the server checks the APPROVED hours. The
// hours (and attempts) are one of the items the lawyer approves (section 8),
// so there is no default: unset or malformed means no calling at all.
//
// Format: "<days> HH:MM-HH:MM", days as a range ("mon-fri") or a list
// ("mon,wed,fri"). Example: PT_CALLERS_CALLING_HOURS="mon-fri 09:30-18:00".
// Public holidays are NOT known to this parser; see docs/PT-CALLERS.md.

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type CallingHours = { days: number[]; startMin: number; endMin: number };

function minutes(hhmm: string): number | null {
  const m = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function parseCallingHours(raw: string | undefined): CallingHours | null {
  const m = (raw ?? "").trim().toLowerCase().match(/^([a-z,-]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!m) return null;
  const days = new Set<number>();
  for (const part of m[1].split(",")) {
    const [a, b] = part.split("-");
    const i = DAYS.indexOf(a);
    const j = b === undefined ? i : DAYS.indexOf(b);
    if (i < 0 || j < 0 || j < i) return null;
    for (let d = i; d <= j; d++) days.add(d);
  }
  const startMin = minutes(m[2]);
  const endMin = minutes(m[3]);
  if (startMin === null || endMin === null || endMin <= startMin || days.size === 0) return null;
  return { days: [...days].sort(), startMin, endMin };
}

const FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function withinCallingHours(h: CallingHours, nowMs: number): boolean {
  const parts = Object.fromEntries(FMT.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  const day = DAYS.indexOf(String(parts.weekday).slice(0, 3).toLowerCase());
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  return h.days.includes(day) && min >= h.startMin && min < h.endMin;
}
