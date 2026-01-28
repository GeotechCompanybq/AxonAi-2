import { runMondaySync } from "@/jobs/monday-sync";
import { runJiraSync } from "@/jobs/jira-sync";
import { runHarvestTimesheetSync } from "@/jobs/harvest-timesheets-sync";
import { runTimesheetMismatchSync } from "@/jobs/timesheet-mismatch-sync";

export async function runSyncAll(opts?: {
  uid?: string;
  days?: number;
  includeMismatch?: boolean;
  dry?: boolean;
}) {
  const includeMismatch = opts?.includeMismatch !== false; // default true

  const monday = await runMondaySync({ uid: opts?.uid, dry: opts?.dry });
  const jira = await runJiraSync({ uid: opts?.uid, dry: opts?.dry });
  const harvest = await runHarvestTimesheetSync({
    uid: opts?.uid,
    days: opts?.days,
    dry: opts?.dry,
  });
  const mismatch = includeMismatch
    ? await runTimesheetMismatchSync({
        uid: opts?.uid,
        days: Number(opts?.days || process.env.MISMATCH_LOOKBACK_DAYS || 7),
      })
    : null;

  return { ok: true, monday, jira, harvest, mismatch } as const;
}






