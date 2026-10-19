// Apollo credit ledger. Before every credit-consuming Apollo call a row is reserved (worst case: 9 credits a person),
// inside one transaction holding an advisory lock, after checking the optional caps. When Apollo's answer is known the
// row is settled exactly once (a conditional update). A request key can only ever be reserved once, so a retry of the
// same request can never charge twice. If the ledger cannot be read, nothing is spent.
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { creditCaps } from "./flags";

const L = schema.ptCreditLedger;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Totals = { today: number; month: number; open: number };

export class CreditRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditRefused";
  }
}

/** Used = Apollo's settled figure when known, else the reservation (an unknown outcome counts as spent). */
async function readTotals(tx: Tx | typeof db, demo: boolean): Promise<Totals> {
  const used = sql`coalesce(${L.settled}::numeric, ${L.reserved})`;
  const [r] = await tx
    .select({
      today: sql<string>`coalesce(sum(${used}) filter (where ${L.createdAt} >= (date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon')), 0)`,
      month: sql<string>`coalesce(sum(${used}) filter (where ${L.createdAt} >= (date_trunc('month', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon')), 0)`,
      open: sql<string>`coalesce(sum(${L.reserved}) filter (where ${L.status} = 'reserved'), 0)`,
    })
    .from(L)
    .where(eq(L.demo, demo));
  const n = (v: unknown) => {
    const x = Number(v);
    if (!Number.isFinite(x)) throw new Error("ledger total is not a number");
    return x;
  };
  return { today: n(r?.today), month: n(r?.month), open: n(r?.open) };
}

export async function reserve(
  p: { key: string; credits: number; demo: boolean; by: number | null; note?: string },
  deps: { readTotals?: (tx: Tx, demo: boolean) => Promise<Totals> } = {},
) {
  if (!Number.isInteger(p.credits) || p.credits <= 0) throw new CreditRefused("invalid reservation");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('pt_credit_ledger'))`);
    let t: Totals;
    try {
      t = await (deps.readTotals ?? readTotals)(tx, p.demo);
    } catch {
      throw new CreditRefused("The credit ledger could not be read, so no credits are spent.");
    }
    const caps = creditCaps();
    if (caps.daily !== null && t.today + p.credits > caps.daily) throw new CreditRefused(`Daily credit cap reached (${t.today} of ${caps.daily} used).`);
    if (caps.monthly !== null && t.month + p.credits > caps.monthly) throw new CreditRefused(`Monthly credit cap reached (${t.month} of ${caps.monthly} used).`);
    await tx.insert(L).values({ requestKey: p.key, reserved: p.credits, demo: p.demo, createdBy: p.by, note: p.note ?? null });
  });
}

/** Records Apollo's figure once. Returns false if the row was already settled (or never reserved). */
export async function settleOnce(key: string, credits: string, note?: string) {
  const r = await db
    .update(L)
    .set({ settled: credits, status: "settled", settledAt: new Date(), ...(note ? { note } : {}) })
    .where(and(eq(L.requestKey, key), eq(L.status, "reserved")))
    .returning({ id: L.id });
  return r.length === 1;
}

export async function summary(demo: boolean) {
  const t = await readTotals(db, demo);
  const caps = creditCaps();
  return {
    today: t.today,
    month: t.month,
    open: t.open,
    caps,
    remaining: { daily: caps.daily === null ? null : Math.max(0, caps.daily - t.today), monthly: caps.monthly === null ? null : Math.max(0, caps.monthly - t.month) },
  };
}
