import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
    const draftId = String(id || "").trim();
    if (!uid)
      return NextResponse.json({ error: "uid is required" }, { status: 400 });
    if (!draftId)
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    const db = await getDb();
    const { timesheetDrafts } = getCollectionNames();
    const res = await db
      .collection(timesheetDrafts)
      .deleteOne({ uid, id: draftId });

    if (!res.deletedCount)
      return NextResponse.json({ ok: true, deleted: false }, { status: 200 });

    return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


