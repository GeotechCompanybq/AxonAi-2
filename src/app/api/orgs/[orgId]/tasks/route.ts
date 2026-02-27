import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";

// Aggregates tasks for all members of an org from Mongo `user_tasks`.
// This aligns org tasks with the same data used for org analytics.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    // Collect all member uids for this org
    const membersSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .get();
    const memberUids = membersSnap.docs.map((d) => d.id).filter(Boolean);

    if (memberUids.length === 0) {
      return NextResponse.json({ tasks: [] });
    }

    const db = await getDb();
    const { userTasks } = getCollectionNames();

    const cursor = db
      .collection(userTasks)
      .find({ uid: { $in: memberUids } }, { projection: { _id: 0 } });

    const tasks = await cursor.toArray();
    return NextResponse.json({ tasks });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to aggregate org tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
