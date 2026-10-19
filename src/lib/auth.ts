import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";

import { COOKIE, MAX_AGE, makeToken, readSession } from "./session-token";

export { makeToken };

export function readToken(token: string | undefined, now = Date.now()): number | null {
  return readSession(token, now)?.a ?? null;
}

export type Role = "admin" | "fulfilment" | "pt_caller";
export type AdminSession = { id: number; email: string; role: Role; mustChangePassword: boolean };

/** Explicit role mapping: an unknown role gets no access at all (it used to fall back to admin). */
export function roleOf(dbRole: string | null | undefined): Role | null {
  return dbRole === "admin" || dbRole === "fulfilment" || dbRole === "pt_caller" ? dbRole : null;
}

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

/**
 * The signed-in team member, checked against the database on every request (disabled = logged out at once).
 * A Portugal-callers sales rep (pt_caller) is NOT a session here unless the caller opts in with allowPtCaller:
 * every existing page, action and route treats a rep as logged out, so new code is closed to reps by default.
 */
export async function getAdmin(opts: { allowPtCaller?: boolean } = {}): Promise<AdminSession | null> {
  const jar = await cookies();
  const s = readSession(jar.get(COOKIE)?.value);
  if (!s) return null;
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, s.a)).limit(1);
  return sessionFor(u, s.v, opts);
}

/** The decision behind getAdmin, separate so it is testable without a request. */
export function sessionFor(
  u: { id: number; email: string; role: string; mustChangePassword: boolean; disabledAt: Date | null; sessionVersion: number } | undefined,
  version: number,
  opts: { allowPtCaller?: boolean } = {},
): AdminSession | null {
  if (!u || u.disabledAt || u.sessionVersion !== version) return null;
  const role = roleOf(u.role);
  if (!role || (role === "pt_caller" && !opts.allowPtCaller)) return null;
  return { id: u.id, email: u.email, role, mustChangePassword: u.mustChangePassword };
}

/** Where a role lands after login or a password change. */
export const homeOf = (role: Role) => (role === "admin" ? "/admin" : role === "pt_caller" ? "/admin/pt-callers" : "/admin/orders");

/**
 * Pages and actions call this. `role: "admin"` keeps Fulfilment users out (they land on Orders).
 * A sales rep (pt_caller) is sent to their own screen unless the page opts in with allowPtCaller.
 * A user with a temporary password is sent to /admin/password first.
 */
export async function requireAdmin(opts: { role?: Role; allowPasswordChange?: boolean; allowPtCaller?: boolean } = {}): Promise<AdminSession> {
  const a = await getAdmin({ allowPtCaller: true });
  if (!a) redirect("/admin/login");
  if (a.mustChangePassword && !opts.allowPasswordChange) redirect("/admin/password");
  if (a.role === "pt_caller" && !opts.allowPtCaller && !opts.allowPasswordChange) redirect("/admin/pt-callers");
  if (opts.role === "admin" && a.role !== "admin") redirect(homeOf(a.role));
  return a;
}

export async function setSessionCookie(id: number, version: number) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(id, Date.now(), version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

const WINDOW_MIN = 15;
const MAX_FAILS = 5;

async function recentFailures(key: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.key, key), eq(schema.loginAttempts.success, false), gte(schema.loginAttempts.createdAt, since)));
  return r?.n ?? 0;
}

export async function login(email: string, password: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${e}`];
  for (const k of keys) {
    if ((await recentFailures(k)) >= MAX_FAILS) return { ok: false, error: `Too many attempts. Try again in ${WINDOW_MIN} minutes.` };
  }
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, e)).limit(1);
  const ok = u && !u.disabledAt ? await verify(u.passwordHash, password).catch(() => false) : false;
  await db.insert(schema.loginAttempts).values(keys.map((key) => ({ key, success: ok })));
  if (!ok || !u) return { ok: false, error: "Wrong email or password." };
  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, u.id));
  await setSessionCookie(u.id, u.sessionVersion);
  return { ok: true };
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}
