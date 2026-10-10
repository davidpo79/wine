// One worker per server process (single replica). Disable with RECOVERY_WORKER=0.
import { processDueRecovery } from "./lib/recovery";

if (process.env.RECOVERY_WORKER !== "0" && process.env.DATABASE_URL) {
  const tick = () => processDueRecovery().catch((e) => console.error("[recovery] worker", e));
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}
