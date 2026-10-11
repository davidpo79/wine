import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ifthenpayMode } from "@/lib/ifthenpay";
import { stripeConfigured } from "@/lib/stripe";
import { logoutAction } from "../actions";
import { Icon, Sidebar, type NavGroup } from "./_nav/Sidebar";

export const dynamic = "force-dynamic";

// Shopify-style left sidebar. Fulfilment users only see what they need to ship orders.
const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { href: "/admin", label: "Home", icon: "home" },
      { href: "/admin/orders", label: "Orders", icon: "orders" },
      { href: "/admin/gift-cards", label: "Gift cards", icon: "card" },
      { href: "/admin/finance", label: "Finance", icon: "finance" },
    ],
  },
  {
    title: "Store",
    items: [
      { href: "/admin/products", label: "Products & pricing", icon: "product" },
      { href: "/admin/leads", label: "Leads", icon: "leads" },
      { href: "/admin/creatives", label: "Ads", icon: "ads" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/admin/settings", label: "Settings", icon: "settings" },
      { href: "/admin/team", label: "Team", icon: "team" },
    ],
  },
];

const FULFILMENT_NAV: NavGroup[] = [
  {
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders" },
      { href: "/admin/gift-cards", label: "Gift cards", icon: "card" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const mode = ifthenpayMode();
  const stripe = stripeConfigured() ? ((process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live") ? "live" : "test") : null;
  const footer = (
    <div className="space-y-2 px-2 text-sm">
      <p className="truncate text-xs text-muted" title={admin.email}>{admin.email}</p>
      <p className="text-xs text-muted">Role: {admin.role === "admin" ? "Admin" : "Fulfilment"}</p>
      <Link href="/admin/password" className="flex items-center gap-2 text-ink/80 hover:text-ink"><Icon name="key" /> Change password</Link>
      <form action={logoutAction}>
        <button className="text-left text-ink/80 underline hover:text-ink">Log out</button>
      </form>
    </div>
  );
  return (
    <div className="min-h-screen bg-paper">
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 bg-night px-3 text-paper">
        <Sidebar groups={admin.role === "admin" ? ADMIN_NAV : FULFILMENT_NAV} footer={footer} />
        <Link href={admin.role === "admin" ? "/admin" : "/admin/orders"} aria-label="Wine Portugal"><img src="/brand/logo-light.svg" alt="Wine Portugal" width={961} height={390} className="h-7 w-auto" /></Link>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <span className={`rounded px-2 py-0.5 font-semibold ${mode === "live" ? "bg-green-600" : "bg-amber-500 text-night"}`}>ifthenpay {mode === "live" ? "LIVE" : mode === "sandbox" ? "SANDBOX" : "off"}</span>
          <span className={`hidden rounded px-2 py-0.5 font-semibold sm:inline ${stripe === "live" ? "bg-green-600" : "bg-amber-500 text-night"}`}>Stripe {stripe === "live" ? "LIVE" : stripe === "test" ? "TEST" : "off"}</span>
          <span className="hidden max-w-[14rem] truncate text-paper/80 lg:inline">{admin.email}</span>
        </div>
      </header>
      <main className="px-4 pb-10 pt-16 md:ml-60 md:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
