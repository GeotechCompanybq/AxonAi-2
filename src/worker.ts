import dotenv from "dotenv";
// Load default .env, then .env.local (override) for local runs
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
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

  let schedule = process.env.WORKER_CRON || "*/15 * * * *"; // every 15 minutes
  if (!(cron as any).validate?.(schedule)) {
    // Common mistake: "/15 * * * *" missing the leading '*'
    if (schedule.startsWith("/")) schedule = `*${schedule}`;
    if (!(cron as any).validate?.(schedule)) {
      console.warn(
        `[worker] invalid WORKER_CRON="${process.env.WORKER_CRON}"; falling back to */15 * * * *`
      );
      schedule = "*/15 * * * *";
    }
  }
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
