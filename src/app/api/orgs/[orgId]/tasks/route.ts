import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Aggregates tasks for all teams under an org: /orgs/{orgId}/teams/*/tasks
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
    const tasks: any[] = [];
    for (const teamDoc of teamsSnap.docs) {
      const tSnap = await adminDb
        .collection("orgs")
        .doc(orgId)
        .collection("teams")
        .doc(teamDoc.id)
        .collection("tasks")
        .get();
      tasks.push(
        ...tSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          teamId: teamDoc.id,
        }))
      );
    }
    return NextResponse.json({ tasks });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to aggregate org tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
