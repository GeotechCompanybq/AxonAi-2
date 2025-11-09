import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { adminAuth } from "@/lib/firebase-admin";

type TimesheetSettings = {
  uid: string;
  // Matching
  requireMatchProjectNames?: string[];
  excludedAltProjectNames?: string[]; // Non-billable to ignore on Grayquarter
  billableClientNames?: string[]; // Clients considered billable (e.g., "TruePoint Solutions")
  matchToleranceMinutes?: number; // allowed delta between primary and alt
  dailyTargetHours?: number;
  // Auto-fix
  autoFixEnabled?: boolean;
  autoFixIncrementMinutes?: number; // e.g., 15
  autoFixOnFetch?: boolean; // run automatically on fetch
  // Future expansion
  updatedAt?: string;
};

const DEFAULTS: Omit<TimesheetSettings, "uid"> = {
  requireMatchProjectNames: [],
  excludedAltProjectNames: [],
  billableClientNames: ["TruePoint Solutions"],
  matchToleranceMinutes: 5,
  dailyTargetHours: 8,
  autoFixEnabled: true,
  autoFixIncrementMinutes: 15,
  autoFixOnFetch: true,
  updatedAt: "",
};

async function getUid(req: NextRequest): Promise<string | null> {
  const qp = req.nextUrl.searchParams.get("uid");
  if (qp) return qp;
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (match) {
    try {
      const decoded = await adminAuth.verifyIdToken(match[1]);
      return decoded.uid;
    } catch {}
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid) return NextResponse.json(DEFAULTS);
    const db = await getDb();
    const { timesheetSettings } = getCollectionNames();
    const doc = await db.collection(timesheetSettings).findOne({ uid });
    const merged = { ...DEFAULTS, ...(doc || {}) };
    return NextResponse.json(merged);
  } catch (e) {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<TimesheetSettings>;
    const now = new Date().toISOString();
    const settings: TimesheetSettings = {
      uid,
      requireMatchProjectNames: Array.isArray(body.requireMatchProjectNames)
        ? body.requireMatchProjectNames.map((s) => String(s)).slice(0, 200)
        : DEFAULTS.requireMatchProjectNames,
      excludedAltProjectNames: Array.isArray(body.excludedAltProjectNames)
        ? body.excludedAltProjectNames.map((s) => String(s)).slice(0, 200)
        : DEFAULTS.excludedAltProjectNames,
      billableClientNames: Array.isArray(body.billableClientNames)
        ? body.billableClientNames.map((s) => String(s)).slice(0, 200)
        : DEFAULTS.billableClientNames,
      matchToleranceMinutes:
        Number(body.matchToleranceMinutes ?? DEFAULTS.matchToleranceMinutes) || 0,
      dailyTargetHours:
        Number(body.dailyTargetHours ?? DEFAULTS.dailyTargetHours) || 8,
      autoFixEnabled: Boolean(
        body.autoFixEnabled ?? DEFAULTS.autoFixEnabled
      ),
      autoFixIncrementMinutes:
        Number(
          body.autoFixIncrementMinutes ?? DEFAULTS.autoFixIncrementMinutes
        ) || 15,
      autoFixOnFetch: Boolean(body.autoFixOnFetch ?? DEFAULTS.autoFixOnFetch),
      updatedAt: now,
    };
    // Boundaries
    if (
      ![5, 6, 10, 12, 15, 20, 30, 60].includes(
        settings.autoFixIncrementMinutes as number
      )
    ) {
      settings.autoFixIncrementMinutes = 15;
    }
    const db = await getDb();
    const { timesheetSettings } = getCollectionNames();
    await db
      .collection(timesheetSettings)
      .updateOne({ uid }, { $set: settings }, { upsert: true });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

