import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { upsertTeamsLink } from "@/lib/teams-link-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(match[1]);
    const uid = decoded.uid;

    const body = await req.json();
    const tenantId = String(body.tenantId || "").trim();
    const teamsUserId = String(body.teamsUserId || "").trim();
    const orgId = String(body.orgId || "").trim();

    if (!tenantId || !teamsUserId || !orgId) {
      return NextResponse.json(
        { error: "Missing tenantId, teamsUserId, or orgId" },
        { status: 400 }
      );
    }

    const memberDoc = await adminDb
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .doc(uid)
      .get();

    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await upsertTeamsLink({ tenantId, teamsUserId, axonUid: uid, orgId });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to link Teams user";
    console.error("Teams link error", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

