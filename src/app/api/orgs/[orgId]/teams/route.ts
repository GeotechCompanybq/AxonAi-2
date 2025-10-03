import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const snap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("teams")
      .get();
    const teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ teams });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
