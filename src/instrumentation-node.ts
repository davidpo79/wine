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
  // Review invitations, a few days after delivery (once per order).
  const reviews = async () => {
    const [{ processReviewRequests }, { sendReviewRequest }] = await Promise.all([import("./lib/reviews"), import("./lib/email")]);
    await processReviewRequests(sendReviewRequest);
  };
  const rev = () => reviews().catch((e) => console.error("[reviews] worker", e));
  setTimeout(rev, 60_000);
  setInterval(rev, 15 * 60_000);
  // CTT tracking safety net (pushes are the main path): shipped / delivered for open shipments.
  const ctt = () => import("./lib/shipping").then((m) => m.syncCttTracking()).catch((e) => console.error("[ctt] tracking", e));
  setTimeout(ctt, 90_000);
  setInterval(ctt, 2 * 3600_000);
}
