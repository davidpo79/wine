// One worker per server process (single replica). Disable with RECOVERY_WORKER=0.
import { processDueRecovery } from "./lib/recovery";
import { paymentHousekeeping } from "./lib/payments";

if (process.env.RECOVERY_WORKER !== "0" && process.env.DATABASE_URL) {
  const tick = () => processDueRecovery().catch((e) => console.error("[recovery] worker", e));
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
  // Payments: expire stale attempts and reconcile lost callbacks (ifthenpay list of payments).
  const pay = () => paymentHousekeeping().catch((e) => console.error("[payments] housekeeping", e));
  setTimeout(pay, 30_000);
  setInterval(pay, 5 * 60_000);
}
