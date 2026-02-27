import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { runSyncAll } from "@/jobs/sync-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(match[1]);
    const uid = decoded.uid;

    const memberSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(uid)
      .get();

    if (!memberSnap.exists || memberSnap.get("role") !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const daysRaw = body?.days as number | undefined;
    const includeMismatch =
      typeof body?.includeMismatch === "boolean"
        ? body.includeMismatch
        : true;

    const result = await runSyncAll({
      days: Number.isFinite(daysRaw || NaN) && (daysRaw as number) > 0 ? daysRaw : undefined,
      includeMismatch,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to run org-wide sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

