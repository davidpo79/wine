import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PtCallersScreen } from "./PtCallersScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portugal HR callers · Admin" };

// One screen, two roles (spec section 5). Outside the shop admin's layout on
// purpose: a Portugal caller never loads the shop's sidebar, counts or pages.
// Admins reach it from the sidebar; Fulfilment has no business here.
export default async function PtCallersPage() {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role === "fulfilment") redirect("/admin/orders");
  return <PtCallersScreen viewer={me.role === "admin" ? "admin" : "rep"} email={me.email} />;
}
