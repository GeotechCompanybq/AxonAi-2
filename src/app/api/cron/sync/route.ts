import { NextRequest, NextResponse } from "next/server";
import { runMondaySync } from "@/jobs/monday-sync";
import { runTimesheetMismatchSync } from "@/jobs/timesheet-mismatch-sync";

// Ensure long-running cron can complete
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes (platform max)

/**
 * Unified PUBLIC cron endpoint that runs both Monday sync and timesheet mismatch sync
 * 
 * Usage with cron-job.org:
 * - URL: https://axonai.onrender.com/api/cron/sync
 * - Method: GET or POST
 * - Schedule: */15 * * * * (every 15 minutes)
 * 
 * Query parameters:
 * - dry: Set to "1" for health check without running syncs
 * - uid: Optional, target specific user
 * - days: Number of days to look back for mismatch sync (default: 7)
 */
export async function POST(req: NextRequest) {
  try {
    // Public endpoint - no authentication required

    // Fast health-check mode for schedulers that probe with short timeouts
    const dry = req.nextUrl.searchParams.get("dry") === "1";
    if (dry) {
      return NextResponse.json({ 
        ok: true, 
        message: "Health check passed",
        timestamp: new Date().toISOString()
      });
    }

    // Parse parameters
    const body = await req.json().catch(() => ({} as any));
    const targetUid =
      (body?.uid as string | undefined) ||
      req.nextUrl.searchParams.get("uid") ||
      undefined;
    const days = Number(req.nextUrl.searchParams.get("days") || "7");

    const results: any = {
      timestamp: new Date().toISOString(),
    };

    // Run Monday sync
    try {
      console.log("[cron/sync] Running Monday sync...");
      const mondayResult = await runMondaySync({ uid: targetUid });
      results.monday = mondayResult;
    } catch (e) {
      console.error("[cron/sync] Monday sync failed:", e);
      results.monday = {
        ok: false,
        error: e instanceof Error ? e.message : "Monday sync failed",
      };
    }

    // Run timesheet mismatch sync
    try {
      console.log("[cron/sync] Running timesheet mismatch sync...");
      const mismatchResult = await runTimesheetMismatchSync({
        uid: targetUid,
        days: Number.isFinite(days) && days > 0 ? days : 7,
      });
      results.mismatch = mismatchResult;
    } catch (e) {
      console.error("[cron/sync] Timesheet mismatch sync failed:", e);
      results.mismatch = {
        ok: false,
        error: e instanceof Error ? e.message : "Mismatch sync failed",
      };
    }

    // Overall success if at least one succeeded
    results.ok = results.monday?.ok || results.mismatch?.ok;

    return NextResponse.json(results);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run cron sync";
    console.error("[cron/sync] Fatal error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow GET for cron services (e.g. cron-job.org) that may use GET
export async function GET(req: NextRequest) {
  return POST(req);
}

// Some schedulers perform a HEAD probe; return quick success
export async function HEAD(_req: NextRequest) {
  return new NextResponse(null, { status: 200 });
}

