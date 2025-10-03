import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

async function requireUser(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer (.+)$/i);
  if (!match) return undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid as string;
  } catch {
    return undefined;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; inviteId: string }> }
) {
  const { orgId, inviteId } = await params;
  try {
    const uid = await requireUser(req);
    if (!uid)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const inviteRef = adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("invites")
      .doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists)
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    const invite = inviteSnap.data() || {};

    // Mark as accepted and add member
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(uid)
      .set(
        {
          role: invite.role || "member",
          joinedAt: Date.now(),
          email: invite.email,
        },
        { merge: true }
      );

    await inviteRef.set(
      { status: "accepted", acceptedBy: uid, acceptedAt: Date.now() },
      { merge: true }
    );

    // Also mark user doc with orgId
    await adminDb.collection("users").doc(uid).set({ orgId }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to accept invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
