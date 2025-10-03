import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { computeMetrics, computeBalanceScore } from "@/lib/analytics/workload";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  try {
    const snap = await adminDb
      .collection("teams")
      .doc(teamId)
      .collection("tasks")
      .get();
    const tasks = snap.docs.map((d) => d.data());
    const metrics = computeMetrics(tasks as any);
    const balance = computeBalanceScore(metrics);
    return NextResponse.json({ metrics, balance });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to compute analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
