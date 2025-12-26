import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export const runtime = "nodejs";

function cleanIsoDate(value: string | null): string | undefined {
  const v = (value || "").trim();
  if (!v) return undefined;
  // Expect YYYY-MM-DD; allow lexicographic comparisons in Mongo.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
    if (!uid)
      return NextResponse.json({ error: "uid is required" }, { status: 400 });

    const from = cleanIsoDate(req.nextUrl.searchParams.get("from"));
    const to = cleanIsoDate(req.nextUrl.searchParams.get("to"));

    const filter: any = { uid };
    if (from || to) {
      filter.spent_date = {
        ...(from ? { $gte: from } : null),
        ...(to ? { $lte: to } : null),
      };
    }

    const db = await getDb();
    const { timesheetDrafts } = getCollectionNames();
    const docs = await db
      .collection(timesheetDrafts)
      .find(filter)
      .sort({ spent_date: 1, createdAt: 1 })
      .limit(2000)
      .toArray();

    const drafts = docs.map((d: any) => {
      const { _id, ...rest } = d || {};
      return rest;
    });

    return NextResponse.json({ drafts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


