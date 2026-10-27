"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
export type NavGroup = { title?: string; items: NavItem[] };

// Inline 20px outline icons (no icon library).
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  orders: "M6 2h9l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM14 2v6h6M8 13h8M8 17h6",
  card: "M3 5h18v14H3zM3 9h18M7 15h4",
  funnel: "M3 4h18l-7 8.5V19l-4 2v-8.5z",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z",
  finance: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  product: "M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  leads: "M16 11a4 4 0 1 0-8 0M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0",
  ads: "M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  key: "M15 7a4 4 0 1 1-3.9 5H9v2H7v2H4v-3l6.1-6.1A4 4 0 0 1 15 7z",
} as const;

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Sidebar({ groups, footer }: { groups: NavGroup[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const hrefs = groups.flatMap((g) => g.items.map((x) => x.href));
  // A link is active on its own page and below it, unless a longer link in the menu matches better.
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : (path === href || path.startsWith(`${href}/`)) && !hrefs.some((h) => h.length > href.length && (path === h || path.startsWith(`${h}/`)));

  const nav = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4">
      {groups.map((g, i) => (
        <div key={i}>
          {g.title && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${active(it.href) ? "bg-white font-semibold text-ink shadow-sm" : "text-ink/80 hover:bg-white/60"}`}
                >
                  <Icon name={it.icon} />
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto border-t pt-3">{footer}</div>
    </nav>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-paper hover:bg-white/10 md:hidden" aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <aside className="fixed bottom-0 left-0 top-12 z-30 hidden w-60 border-r bg-[#f1ece2] md:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute bottom-0 left-0 top-0 w-72 max-w-[85vw] bg-[#f1ece2] shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
