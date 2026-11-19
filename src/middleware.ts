import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { UTM_COOKIE, utmFromSearch } from "@/lib/utm";
import { COOKIE, readSession } from "@/lib/session-token";
import { gated, ptCallerAllowed } from "@/lib/pt-callers/access";
import { db, schema } from "@/db";

/** The signed-in team member's role, or null (not signed in / invalid / disabled). */
async function roleOf(req: NextRequest) {
  const s = readSession(req.cookies.get(COOKIE)?.value);
  if (!s) return null;
  const [u] = await db.select({ role: schema.adminUsers.role, disabledAt: schema.adminUsers.disabledAt, v: schema.adminUsers.sessionVersion }).from(schema.adminUsers).where(eq(schema.adminUsers.id, s.a)).limit(1);
  return u && !u.disabledAt && u.v === s.v ? u.role : null;
}

/** Short link -> landing page with its UTM, so every visit and order from it is attributed. */
const SHORT_LINKS: Record<string, string> = {
  "/rus": "/ru/black-friday/cheda?utm_source=ru_de_group&utm_medium=community&utm_campaign=bf_cheda_ru",
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Sales reps (Portugal callers): 403 on every admin page and API outside their allow-list. Pages, actions and
  // routes also refuse them on their own (getAdmin / requireAdmin), this is the outer wall.
  if (gated(path) && req.cookies.get(COOKIE)) {
    let role: string | null;
    try {
      role = await roleOf(req);
    } catch {
      return new NextResponse("Service unavailable", { status: 503 }); // fail closed: never guess a role
    }
    if (role === "pt_caller" && !ptCallerAllowed(req.method, path)) return new NextResponse("Forbidden", { status: 403 });
    return NextResponse.next();
  }

  // Short links for groups and partners: one word, redirected to the page with its tracking parameters.
  const short = SHORT_LINKS[path];
  if (short) return NextResponse.redirect(new URL(short, req.nextUrl.origin), 302);

  // First-touch UTM attribution: stored for 30 days, never overwritten by later visits.
  const res = NextResponse.next();
  if ((path === "/" || /\/black-friday(\/[^/]+)?$/.test(path)) && !req.cookies.get(UTM_COOKIE)) {
    const utm = utmFromSearch(req.nextUrl.searchParams);
    if (utm) {
      res.cookies.set(UTM_COOKIE, encodeURIComponent(JSON.stringify(utm)), {
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
      });
    }
  }
  return res;
}

// Node runtime: the role is read from the database. Only the home and Black Friday pages (UTM) and admin / API paths run it.
export const config = { matcher: ["/", "/black-friday", "/:locale/black-friday", "/:locale/black-friday/:offer", "/rus", "/admin/:path*", "/api/:path*"], runtime: "nodejs" };
