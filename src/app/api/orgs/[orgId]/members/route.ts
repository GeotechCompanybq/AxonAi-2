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
      .collection("members")
      .get();
    const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ members });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list members";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const body = await req.json();
    const { uid, role = "member" } = body || {};
    if (!uid)
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(uid)
      .set({ role, joinedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add member";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
