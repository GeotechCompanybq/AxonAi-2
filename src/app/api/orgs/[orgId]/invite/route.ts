import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const body = await req.json();
    const { email, role = "member" } = body || {};
    if (!email)
      return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const inviteRef = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("invites")
      .add({
        email,
        role,
        createdAt: Date.now(),
        status: "pending",
      });
    return NextResponse.json({ inviteId: inviteRef.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
