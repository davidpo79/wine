import type { OrderStatus } from "@/db/schema";
import { STATUS_LABEL } from "@/lib/orders";

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-900",
  paid: "bg-green-100 text-green-900",
  preparing: "bg-blue-100 text-blue-900",
  shipped: "bg-indigo-100 text-indigo-900",
  delivered: "bg-gray-200 text-gray-800",
  payment_failed: "bg-red-100 text-red-900",
  cancelled: "bg-gray-100 text-gray-500",
  refunded: "bg-purple-100 text-purple-900",
};

export function StatusPill({ s }: { s: OrderStatus }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>;
}

