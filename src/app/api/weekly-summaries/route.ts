import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    if (!uid)
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    const db = await getDb();
    const { weeklySummaries } = getCollectionNames();
    const cursor = db
      .collection(weeklySummaries)
      .find({ uid })
      .sort({ from: -1 })
      .limit(52);
    const list = await cursor.toArray();
    return NextResponse.json({ summaries: list });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { uid, from, to, summary, hoursTotal, entriesCount } = body || {};
    if (!uid || !from || !to || !summary)
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    const db = await getDb();
    const { weeklySummaries } = getCollectionNames();
    const doc = {
      uid,
      from: String(from),
      to: String(to),
      summary: String(summary),
      hoursTotal: Number(hoursTotal || 0),
      entriesCount: Number(entriesCount || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db
      .collection(weeklySummaries)
      .updateOne(
        { uid, from: doc.from, to: doc.to },
        { $set: doc },
        { upsert: true }
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}



