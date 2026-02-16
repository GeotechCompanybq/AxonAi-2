import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminAuth } from "@/lib/firebase-admin";

type Tone = "none" | "concise" | "technical" | "executive";

type AxonChatSettings = {
  uid: string;
  tone: Tone;
  updatedAt?: string;
};

const DEFAULTS: Omit<AxonChatSettings, "uid"> = {
  tone: "none",
  updatedAt: "",
};

async function getUid(req: NextRequest): Promise<string | null> {
  const qp = req.nextUrl.searchParams.get("uid");
  if (qp) return qp;
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (match) {
    try {
      const adminAuth = getAdminAuth();
      if (!adminAuth) return null;
      const decoded = await adminAuth.verifyIdToken(match[1]);
      return decoded.uid;
    } catch {}
  }
  return null;
}

function normalizeTone(input: unknown): Tone {
  const t = String(input || "")
    .trim()
    .toLowerCase();
  if (t === "concise" || t === "technical" || t === "executive") return t;
  return "none";
}

export async function GET(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid) return NextResponse.json(DEFAULTS);

    const db = await getDb();
    const { axonchatSettings } = getCollectionNames();
    const doc = (await db.collection(axonchatSettings).findOne({ uid })) as
      | AxonChatSettings
      | null;
    const merged = { ...DEFAULTS, ...(doc || {}) };
    return NextResponse.json({ tone: normalizeTone(merged.tone) });
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<AxonChatSettings>;
    const tone = normalizeTone(body.tone);
    const now = new Date().toISOString();

    const db = await getDb();
    const { axonchatSettings } = getCollectionNames();
    await db
      .collection(axonchatSettings)
      .updateOne(
        { uid },
        { $set: { uid, tone, updatedAt: now } satisfies AxonChatSettings },
        { upsert: true }
      );

    return NextResponse.json({ ok: true, settings: { tone } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

