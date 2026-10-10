import { and, desc, eq, gte, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { orderStatus, type OrderStatus } from "@/db/schema";
import { lisbonToUtc } from "./time";

export type OrderFilter = { status?: string | null; from?: string | null; to?: string | null; q?: string | null };

export async function queryOrders(f: OrderFilter, defaultStatuses?: OrderStatus[], limit = 5000) {
  const conds: SQL[] = [];
  if (f.status && (orderStatus.enumValues as readonly string[]).includes(f.status)) conds.push(eq(schema.orders.status, f.status as OrderStatus));
  else if (defaultStatuses) conds.push(inArray(schema.orders.status, defaultStatuses));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(schema.orders.createdAt, lisbonToUtc(f.from)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lt(schema.orders.createdAt, new Date(lisbonToUtc(f.to).getTime() + 86400000)));
  if (f.q) {
    const q = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(schema.orders.id, q), ilike(schema.orders.email, q), ilike(schema.orders.customerName, q))!);
  }
  return db.select().from(schema.orders).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.orders.createdAt)).limit(limit);
}
