import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const uid = String(req.nextUrl.searchParams.get("uid") || "").trim();
    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    const db = await getDb();
    const { users } = getCollectionNames();
    const now = new Date().toISOString();

    // Mark last sync attempt for observability. Actual transcript import
    // should be implemented by a backend job that talks to Loom's API.
    await db.collection(users).updateOne(
      { uid },
      {
        $set: {
          uid,
          "loom.lastSyncedAt": now,
          "loom.updatedAt": now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      transcripts: [],
      message:
        "Loom transcripts integration is scaffolded but not yet connected to Loom's API. Once a backend job writes transcripts into your datastore, they will appear here.",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to fetch Loom transcripts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

