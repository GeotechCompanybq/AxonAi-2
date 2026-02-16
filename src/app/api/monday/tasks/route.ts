import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { fetchMondayTasks } from "@/lib/monday";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    let token: string | undefined;
    // Optionally scope to a user id for storing tasks
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const doSync = req.nextUrl.searchParams.get("sync") === "1";

    // Always prefer Mongo when uid is present
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        const doc = await db.collection(users).findOne({ uid });
        token = (doc as any)?.monday?.accessToken as string | undefined;
      } catch {}
      // Fallback to Firestore if not in Mongo
      if (!token) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token = snap.get("monday.accessToken") as string | undefined;
        } catch {}
      }
      // Final fallback to cookie
      if (!token) {
        token = cookieStore.get("monday_token")?.value;
      }
    } else {
      // No uid: fall back to cookie only
      token = cookieStore.get("monday_token")?.value;
    }
    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 400 });
    const tasks = await fetchMondayTasks(token);
    // Upsert tasks into Mongo if uid provided and sync requested
    if (uid && doSync) {
      try {
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
            updateOne: {
              filter: { uid, id },
              update: { $set: doc },
              upsert: true,
            },
          } as const;
        });
        if (ops.length)
          await db.collection(userTasks).bulkWrite(ops as any, {
            ordered: false,
          });
      } catch (e) {
        console.error("Failed to upsert tasks", e);
      }
    }
    return NextResponse.json({ tasks });
  } catch (e) {
    console.error("monday tasks error", e);
    const message = e instanceof Error ? e.message : "Failed to fetch tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
