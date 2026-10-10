import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin · Wine Portugal", robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div lang="en" className="min-h-screen bg-[#f4f1ea] font-sans text-[#1b2636]">{children}</div>;
}
