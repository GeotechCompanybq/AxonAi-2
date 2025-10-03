import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { computeMetrics, computeBalanceScore } from "@/lib/analytics/workload";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const teamsSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("teams")
      .get();
    const allTasks: any[] = [];
    for (const teamDoc of teamsSnap.docs) {
      const tSnap = await adminDb
        .collection("orgs")
        .doc(orgId)
        .collection("teams")
        .doc(teamDoc.id)
        .collection("tasks")
        .get();
      allTasks.push(...tSnap.docs.map((d) => d.data()));
    }
    const metrics = computeMetrics(allTasks as any);
    const balance = computeBalanceScore(metrics);
    return NextResponse.json({ metrics, balance });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to compute org analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
