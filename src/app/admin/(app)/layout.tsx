import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { stripeMode } from "@/lib/stripe";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Dashboard"],
  ["/admin/orders", "Orders"],
  ["/admin/products", "Product & pricing"],
  ["/admin/leads", "Leads"],
  ["/admin/settings", "Settings"],
  ["/admin/creatives", "Ads"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const mode = stripeMode();
  return (
    <>
      <header className="bg-night text-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-serif text-xl">Wine Portugal · Admin</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-gold">{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className={`rounded px-2 py-0.5 font-semibold ${mode === "live" ? "bg-green-600" : "bg-amber-500 text-night"}`}>Stripe {mode === "live" ? "LIVE" : mode === "test" ? "TEST" : "not configured"}</span>
            <span className="hidden sm:inline">{admin.email}</span>
            <form action={logoutAction}>
              <button className="underline">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
