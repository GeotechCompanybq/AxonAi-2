import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runSyncAll } from "@/jobs/sync-all";

// Ensure long-running cron can complete
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes (platform max on Vercel)

export async function POST(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Scheduler probe / quick test
    const dry = req.nextUrl.searchParams.get("dry") === "1";
    const days = Number(req.nextUrl.searchParams.get("days") || "");
    const includeMismatch = req.nextUrl.searchParams.get("mismatch") !== "0";

    const body = await req.json().catch(() => ({} as any));
    const targetUid =
      (body?.uid as string | undefined) ||
      req.nextUrl.searchParams.get("uid") ||
      undefined;

    const result = await runSyncAll({
      uid: targetUid,
      days: Number.isFinite(days) && days > 0 ? days : undefined,
      includeMismatch,
      dry,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run sync-all";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow GET for cron services (e.g. UptimeRobot) that only support GET
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function HEAD(_req: NextRequest) {
  return new NextResponse(null, { status: 200 });
}




