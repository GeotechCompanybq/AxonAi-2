import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    const snap = await adminDb.collection("orgs").doc(orgId).get();
    const data = snap.data() || {};
    return NextResponse.json({ integrations: data.integrations || {} });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load integrations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  try {
    // Verify Firebase ID token and require admin role within this org
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(match[1]);
    const uid = decoded.uid;
    const memberSnap = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(uid)
      .get();
    if (!memberSnap.exists || memberSnap.get("role") !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { jira, monday, harvest } = body || {};
    await adminDb
      .collection("orgs")
      .doc(orgId)
      .set({ integrations: { jira, monday, harvest } }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to save integrations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
