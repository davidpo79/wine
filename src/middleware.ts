import { NextResponse, type NextRequest } from "next/server";
import { UTM_COOKIE, utmFromSearch } from "@/lib/utm";

// First-touch UTM attribution: stored for 30 days, never overwritten by later visits.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(UTM_COOKIE)) {
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

export const config = { matcher: ["/"] };
