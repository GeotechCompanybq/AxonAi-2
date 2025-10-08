import "dotenv/config";
import cron from "node-cron";
import { runMondaySync } from "@/jobs/monday-sync";

async function main() {
  // Immediate run on start (optional)
  if (process.env.WORKER_RUN_ON_START !== "0") {
    try {
      const res = await runMondaySync();
      console.log("[worker] initial monday sync:", res);
    } catch (e) {
      console.error("[worker] initial run failed", e);
    }
  }

  const schedule = process.env.WORKER_CRON || "*/15 * * * *"; // every 15 minutes
  console.log(`[worker] scheduling monday sync: ${schedule}`);

  cron.schedule(schedule, async () => {
    console.log("[worker] running monday sync");
    try {
      const res = await runMondaySync();
      console.log("[worker] monday sync result:", res);
    } catch (e) {
      console.error("[worker] monday sync failed:", e);
    }
  });
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
