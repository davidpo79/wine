import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";

const COOKIE = "wp_admin";
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(adminId: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ a: adminId, e: now + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof a !== "number" || typeof e !== "number" || e < now) return null;
    return a;
  } catch {
    return null;
  }
}

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function getAdmin() {
  const jar = await cookies();
  const id = readToken(jar.get(COOKIE)?.value);
  if (!id) return null;
  const [u] = await db.select({ id: schema.adminUsers.id, email: schema.adminUsers.email }).from(schema.adminUsers).where(eq(schema.adminUsers.id, id)).limit(1);
  return u ?? null;
}

export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
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
    if ((await recentFailures(k)) >= MAX_FAILS) return { ok: false, error: `Demasiadas tentativas. Tente novamente dentro de ${WINDOW_MIN} minutos.` };
  }
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, e)).limit(1);
  const ok = u ? await verify(u.passwordHash, password).catch(() => false) : false;
  await db.insert(schema.loginAttempts).values(keys.map((key) => ({ key, success: ok })));
  if (!ok || !u) return { ok: false, error: "Email ou palavra-passe incorretos." };
  const jar = await cookies();
  jar.set(COOKIE, makeToken(u.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return { ok: true };
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}
