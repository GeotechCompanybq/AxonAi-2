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
      let token: string | undefined;
      // Prefer Mongo
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        const doc = await db.collection(users).findOne({ uid: targetUid });
        token = (doc as any)?.monday?.accessToken as string | undefined;
      } catch {}
      // Fallback Firestore
      if (!token) {
        const userSnap = await adminDb.collection("users").doc(targetUid).get();
        token = userSnap.get("monday.accessToken") as string | undefined;
      }
      if (!token)
        return NextResponse.json({ error: "No token" }, { status: 400 });
      await fetchAndStoreForUser(targetUid, token);
      return NextResponse.json({ ok: true, processed: 1 });
    }

    // Option B: fetch for all users that have a Monday token
    // Option B: iterate tokens from Mongo users first, fallback to Firestore users
    let processed = 0;
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      const cursor = db
        .collection(users)
        .find({ "monday.accessToken": { $exists: true } });
      for await (const doc of cursor) {
        const uid = String((doc as any)?.uid || "");
        const token = (doc as any)?.monday?.accessToken as string | undefined;
        if (!uid || !token) continue;
        await fetchAndStoreForUser(uid, token);
        processed++;
      }
    } catch {}
    if (processed === 0) {
      const usersSnap = await adminDb.collection("users").get();
      for (const doc of usersSnap.docs) {
        const token = doc.get("monday.accessToken") as string | undefined;
        if (!token) continue;
        await fetchAndStoreForUser(doc.id, token);
        processed++;
      }
    }
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run cron";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
