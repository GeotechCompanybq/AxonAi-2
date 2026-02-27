import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const uid = String(body?.uid || "").trim();
    if (!uid) {
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    }

    const db = await getDb();
    const { users } = getCollectionNames();
    const now = new Date().toISOString();

    await db.collection(users).updateOne(
      { uid },
      {
        $set: {
          uid,
          "loom.connected": false,
          "loom.updatedAt": now,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      message: "Loom integration disconnected for this user.",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to disconnect Loom integration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

