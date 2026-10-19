// Portugal HR callers: wiring for the app. One service per process, built
// from process.env and the app's Postgres client. With both flags off (the
// default) it is demo mode: demo rows, the mock Apollo client, no dial.
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema, sql } from "@/db";
import { readFlags } from "./flags";
import { createApolloClient, createMockApolloClient } from "./apollo";
import { createService, type PtService } from "./service";
import { createDbStore, createDbEndpointStore } from "./store-db";
import { createPtDialer } from "./telnyx";
import { createDncAdapter } from "./dnc";

declare global {
  // eslint-disable-next-line no-var
  var __ptCallers: PtService | undefined;
}

const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url").replace(/-/g, "_")}`;

export function ptService(): PtService {
  if (globalThis.__ptCallers) return globalThis.__ptCallers;
  const env = process.env;
  const key = (env.APOLLO_API_KEY ?? "").trim();
  const svc = createService({
    store: createDbStore(sql),
    liveApollo: key ? createApolloClient({ apiKey: key }) : null,
    mockApollo: createMockApolloClient(),
    dialer: createPtDialer({ env: () => process.env, endpoints: createDbEndpointStore(sql) }),
    dnc: createDncAdapter(),
    readFlags: () => readFlags(process.env),
    now: () => Date.now(),
    newId,
    newSecret: () => randomBytes(32).toString("base64url"),
    isAdmin: (role) => role === "admin",
    repDirectory: async () => {
      const rows = await db
        .select({ id: schema.adminUsers.id, email: schema.adminUsers.email })
        .from(schema.adminUsers)
        .where(and(eq(schema.adminUsers.role, "pt_caller"), isNull(schema.adminUsers.disabledAt)));
      return rows.map((r) => ({ uid: String(r.id), name: r.email, role: "pt_caller", active: true }));
    },
    blockPepper: (env.PT_CALLERS_BLOCK_PEPPER ?? "").trim() || undefined,
    log: (m) => console.warn(`[pt-callers] ${m}`),
  });
  globalThis.__ptCallers = svc;
  return svc;
}
