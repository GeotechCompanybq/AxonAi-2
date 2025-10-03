import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Ensure this route runs on the Node.js runtime (Admin SDK is not Edge-compatible)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgName, ownerUid } = body || {};
    if (!orgName || !ownerUid) {
      return NextResponse.json(
        { error: "Missing orgName or ownerUid" },
        { status: 400 }
      );
    }

    const orgRef = adminDb.collection("orgs").doc();
    const orgId = orgRef.id;
    const now = Date.now();
    await orgRef.set({ id: orgId, name: orgName, ownerUid, createdAt: now });
    await orgRef
      .collection("members")
      .doc(ownerUid)
      .set({ role: "admin", joinedAt: now });

    // Also mark user role/admin and orgId in users collection for client gating
    await adminDb
      .collection("users")
      .doc(ownerUid)
      .set({ role: "admin", orgId }, { merge: true });

    return NextResponse.json({ orgId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create org";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
