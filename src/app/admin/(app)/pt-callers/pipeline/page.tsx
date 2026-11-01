import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { logAccess } from "@/lib/pt-callers/rules";
import { Board, type Card } from "./Board";

export const dynamic = "force-dynamic";

// The sales pipeline: every lead as a card in five columns. A sales rep sees only her own leads (and only her own
// notes); the admin sees every rep's leads and can filter by rep.
export default async function Pipeline() {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role !== "admin" && me.role !== "pt_caller") redirect("/admin/orders");
  const L = schema.ptLeads;
  const rep = me.role === "pt_caller";
  const [rows, reps] = await Promise.all([
    db
      .select()
      .from(L)
      .where(rep ? eq(L.assignedTo, me.id) : sql`true`)
      .orderBy(desc(L.updatedAt), desc(L.id))
      .limit(rep ? 1000 : 2000),
    rep ? Promise.resolve([{ id: me.id, email: me.email }]) : db.select({ id: schema.adminUsers.id, email: schema.adminUsers.email }).from(schema.adminUsers).where(eq(schema.adminUsers.role, "pt_caller")),
  ]);
  await logAccess(me.id, null, "pipeline_view", { leads: rows.length });
  const cards: Card[] = rows.map((l) => ({
    id: l.id,
    name: [l.firstName, l.lastName ?? l.lastNameMasked].filter(Boolean).join(" ") || "—",
    title: l.title,
    company: l.company,
    status: l.status,
    repId: l.assignedTo,
    note: rep && l.noteBy !== me.id ? null : l.note, // a rep sees only her own notes
    callbackAt: l.callbackAt?.toISOString() ?? null,
    attempts: l.attempts,
    lastAt: (l.lastAttemptAt ?? l.updatedAt).toISOString(),
    hasPhone: !!l.phone,
    demo: l.demo,
  }));
  return <Board cards={cards} reps={reps} isRep={rep} />;
}
