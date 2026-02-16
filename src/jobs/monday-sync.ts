import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { EmailNotificationService } from "@/lib/email-notifications";

async function fetchAndStoreForUser(uid: string, token: string) {
  const mod = await import("@/lib/monday");
  const tasks = await mod.fetchMondayTasks(token);
  const db = await getDb();
  const { userTasks, users } = getCollectionNames();
  let newlyInserted = 0;
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
  if (ops.length) {
    const bulkRes: any = await db
      .collection(userTasks)
      .bulkWrite(ops as any, { ordered: false });
    newlyInserted = Number(bulkRes?.upsertedCount || 0);
  }

  if (newlyInserted > 0) {
    try {
      const userDoc = await db.collection(users).findOne({ uid });
      const email = (userDoc as any)?.email as string | undefined;
      if (email) {
        const previewNames = tasks
          .slice(0, 3)
          .map((t: any) => String(t?.name || "Untitled"))
          .join(", ");
        await EmailNotificationService.sendEmail({
          to: email,
          subject: `New tasks imported from Monday.com (${newlyInserted})`,
          htmlBody: `
            <p>We imported <strong>${newlyInserted}</strong> new task(s) from Monday.com into your workspace.</p>
            <p style="color:#94a3b8;font-size:12px">Recent: ${previewNames}</p>
            <p><a href="/tasks">Open Tasks</a></p>
          `,
        });
      }
    } catch (e) {
      console.error("Failed to send Monday new-tasks email", e);
    }
  }
}

export async function runMondaySync(opts?: { uid?: string; dry?: boolean }) {
  if (opts?.dry) return { ok: true, processed: 0 } as const;

  // Specific user
  if (opts?.uid) {
    let token: string | undefined;
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      const doc = await db.collection(users).findOne({ uid: opts.uid });
      token = (doc as any)?.monday?.accessToken as string | undefined;
    } catch {}
    if (!token) {
      const snap = await adminDb.collection("users").doc(opts.uid).get();
      token = snap.get("monday.accessToken") as string | undefined;
    }
    if (!token) return { error: "No token", status: 400 } as const;
    await fetchAndStoreForUser(opts.uid, token);
    return { ok: true, processed: 1 } as const;
  }

  // All users (Mongo first, Firestore fallback)
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
  return { ok: true, processed } as const;
}
