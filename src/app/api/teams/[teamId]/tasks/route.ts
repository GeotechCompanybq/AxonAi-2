import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Returns all normalized tasks for a team from Firestore
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
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ tasks });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load team tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
