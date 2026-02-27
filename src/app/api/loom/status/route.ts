import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const uid = String(req.nextUrl.searchParams.get("uid") || "").trim();
    if (!uid) {
      return NextResponse.json({ connected: false, message: null });
    }

    const db = await getDb();
    const { users } = getCollectionNames();
    const doc = await db.collection(users).findOne({ uid });
    const loom = (doc as any)?.loom || {};

    const connected = Boolean(loom.connected);
    const lastSyncedAt = loom.lastSyncedAt
      ? String(loom.lastSyncedAt)
      : null;

    return NextResponse.json({
      connected,
      lastSyncedAt,
      message: lastSyncedAt
        ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}`
        : null,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load Loom status";
    return NextResponse.json(
      { connected: false, message },
      { status: 500 }
    );
  }
}

