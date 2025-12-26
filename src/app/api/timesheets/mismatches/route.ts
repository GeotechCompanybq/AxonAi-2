import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminAuth } from "@/lib/firebase-admin";
import {
  detectBillableMismatches,
  type HarvestEntry,
  type MatchSettings,
} from "@/lib/timesheet-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUid(req: NextRequest): Promise<string | null> {
  const qp = req.nextUrl.searchParams.get("uid");
  if (qp) return qp;
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  try {
    const adminAuth = getAdminAuth();
    if (!adminAuth) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { from: isoDay(start), to: isoDay(end) };
}

async function getTimesheetSettings({
  uid,
}: {
  uid: string;
}): Promise<MatchSettings & { notificationEmail?: string }> {
  const db = await getDb();
  const { timesheetSettings } = getCollectionNames();
  const doc = await db.collection(timesheetSettings).findOne({ uid });
  return {
    billableClientNames: Array.isArray((doc as any)?.billableClientNames)
      ? (doc as any).billableClientNames.map((x: any) => String(x))
      : ["TruePoint Solutions"],
    matchToleranceMinutes: Number((doc as any)?.matchToleranceMinutes ?? 5) || 5,
    sourceOfTruth: "primary",
    notificationEmail: String((doc as any)?.notificationEmail || "").trim() || undefined,
  };
}

async function fetchHarvestEntries({
  req,
  conn,
  from,
  to,
  uid,
}: {
  req: NextRequest;
  conn: "primary" | "alt";
  from: string;
  to: string;
  uid: string;
}): Promise<HarvestEntry[]> {
  const url = new URL("/api/harvest/timesheets", req.nextUrl.origin);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sync", "0");
  url.searchParams.set("uid", uid);
  if (conn === "alt") url.searchParams.set("conn", "alt");
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `Failed to fetch ${conn} time entries`);
  }
  return Array.isArray(json?.timeEntries) ? (json.timeEntries as any[]) : [];
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const from = req.nextUrl.searchParams.get("from") || undefined;
    const to = req.nextUrl.searchParams.get("to") || undefined;
    const range = from && to ? { from, to } : defaultRange();

    const db = await getDb();
    const { timesheetMismatches } = getCollectionNames();
    const doc = await db.collection(timesheetMismatches).findOne({
      uid,
      from: range.from,
      to: range.to,
      status: "pending",
    });
    return NextResponse.json({ uid, ...range, doc: doc || null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load mismatches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({} as any));
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const dryRun = Boolean(body?.dryRun);
    const range = from && to ? { from, to } : defaultRange();

    const settings = await getTimesheetSettings({ uid });
    const [primaryEntries, altEntries] = await Promise.all([
      fetchHarvestEntries({ req, conn: "primary", from: range.from, to: range.to, uid }),
      fetchHarvestEntries({ req, conn: "alt", from: range.from, to: range.to, uid }),
    ]);

    const mismatches = detectBillableMismatches({
      primaryEntries,
      altEntries,
      from: range.from,
      to: range.to,
      settings,
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        uid,
        ...range,
        mismatchCount: mismatches.length,
        mismatches,
      });
    }

    const db = await getDb();
    const { timesheetMismatches } = getCollectionNames();
    const now = new Date().toISOString();
    const doc = {
      uid,
      from: range.from,
      to: range.to,
      status: "pending",
      mismatchCount: mismatches.length,
      mismatches,
      updatedAt: now,
      createdAt: now,
    };

    await db.collection(timesheetMismatches).updateOne(
      { uid, from: range.from, to: range.to, status: "pending" },
      { $set: doc },
      { upsert: true }
    );

    return NextResponse.json({
      ok: true,
      uid,
      ...range,
      mismatchCount: mismatches.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to compute mismatches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


