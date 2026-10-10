import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

// postgres() connects lazily on first query, so importing this during `next build` is safe.
const sql = globalThis.__pg ?? postgres(process.env.DATABASE_URL ?? "postgres://localhost/unset", { max: 10, idle_timeout: 30 });
if (process.env.NODE_ENV !== "production") globalThis.__pg = sql;

export const db = drizzle({ client: sql, schema });
export { sql, schema };
