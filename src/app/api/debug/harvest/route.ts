import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }
    const db = await getDb();
    const { users } = getCollectionNames();
    const mongo = await db.collection(users).findOne({ uid });

    let firestore: any = null;
    try {
      const { adminDb } = await import("@/lib/firebase-admin");
      const snap = await adminDb.collection("users").doc(uid).get();
      firestore = snap.exists ? snap.data() : null;
    } catch {}

    const redact = (v: any) => {
      if (!v) return v;
      const copy: any = JSON.parse(JSON.stringify(v));
      const hide = (s?: string) =>
        typeof s === "string" && s.length > 8
          ? `${s.slice(0, 4)}…${s.slice(-4)}`
          : s;
      if (copy.harvest?.accessToken) copy.harvest.accessToken = hide(copy.harvest.accessToken);
      if (copy.harvest?.refreshToken) copy.harvest.refreshToken = hide(copy.harvest.refreshToken);
      if (copy.harvestAlt?.accessToken) copy.harvestAlt.accessToken = hide(copy.harvestAlt.accessToken);
      if (copy.harvestAlt?.refreshToken) copy.harvestAlt.refreshToken = hide(copy.harvestAlt.refreshToken);
      return copy;
    };

    return NextResponse.json({
      mongo: redact(mongo),
      firestore: redact(firestore),
      present: {
        mongoHarvest: Boolean((mongo as any)?.harvest?.accessToken),
        mongoHarvestAlt: Boolean((mongo as any)?.harvestAlt?.accessToken),
        fsHarvest: Boolean((firestore as any)?.harvest?.accessToken),
        fsHarvestAlt: Boolean((firestore as any)?.harvestAlt?.accessToken),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "debug_failed" }, { status: 500 });
  }
}

