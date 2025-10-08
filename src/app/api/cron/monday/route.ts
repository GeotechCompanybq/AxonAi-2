import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";

async function fetchAndStoreForUser(uid: string, token: string) {
  const mod = await import("@/app/api/monday/tasks/route");
  const tasks = await mod.fetchMondayTasks(token);
  const db = await getDb();
  const { userTasks } = getCollectionNames();
  const ops = tasks.map((t: any) => {
    const key = `${t.name}|${t.dueDate || ""}|monday`;
    const id = Buffer.from(key).toString("base64").replace(/=+$/g, "");
    const doc = {
      uid,
      id,
      source: "monday",
      name: t.name,
      description: t.description,
      dueDate: t.dueDate || null,
      priority: t.priority,
      status: t.status,
      category: t.category,
      comments: t.comments || [],
      updatedAt: new Date().toISOString(),
    };
    return {
      updateOne: { filter: { uid, id }, update: { $set: doc }, upsert: true },
    } as const;
  });
  if (ops.length)
    await db.collection(userTasks).bulkWrite(ops as any, { ordered: false });
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const secret = process.env.CRON_SECRET || "";
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Option A: fetch for a specific uid
    const body = await req.json().catch(() => ({} as any));
    const targetUid = body?.uid as string | undefined;
    if (targetUid) {
      const userSnap = await adminDb.collection("users").doc(targetUid).get();
      const token = userSnap.get("monday.accessToken") as string | undefined;
      if (!token)
        return NextResponse.json({ error: "No token" }, { status: 400 });
      await fetchAndStoreForUser(targetUid, token);
      return NextResponse.json({ ok: true, processed: 1 });
    }

    // Option B: fetch for all users that have a Monday token
    const usersSnap = await adminDb.collection("users").get();
    let processed = 0;
    for (const doc of usersSnap.docs) {
      const token = doc.get("monday.accessToken") as string | undefined;
      if (!token) continue;
      await fetchAndStoreForUser(doc.id, token);
      processed++;
    }
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run cron";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
