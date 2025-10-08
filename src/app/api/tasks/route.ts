import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const uid = String(req.nextUrl.searchParams.get("uid") || "").trim();
    if (!uid)
      return NextResponse.json({ error: "uid required" }, { status: 400 });

    const db = await getDb();
    const { userTasks } = getCollectionNames();
    const items = await db
      .collection(userTasks)
      .find({ uid })
      .project({ _id: 0 })
      .toArray();
    return NextResponse.json({ tasks: items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load tasks";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const uid = String(
      body?.uid || req.nextUrl.searchParams.get("uid") || ""
    ).trim();
    if (!uid)
      return NextResponse.json({ error: "uid required" }, { status: 400 });

    const db = await getDb();
    const { userTasks } = getCollectionNames();
    const col = db.collection(userTasks);

    // Bulk upsert mode (used by Monday import fallback)
    if (Array.isArray(body?.bulk)) {
      const tasks: any[] = body.bulk;
      const ops = [] as any[];
      for (const t of tasks) {
        const name = String(t?.name || "").trim();
        if (!name) continue;
        const id = String(
          t?.id ||
            Buffer.from(`${name}|${t?.dueDate || ""}|${t?.source || "monday"}`)
              .toString("base64")
              .replace(/=+$/g, "")
        );
        const doc = {
          uid,
          id,
          ...t,
          source: t?.source || "import",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        ops.push({
          updateOne: {
            filter: { uid, id },
            update: { $set: doc },
            upsert: true,
          },
        });
      }
      if (ops.length) await col.bulkWrite(ops, { ordered: false });
      return NextResponse.json({ inserted: ops.length });
    }

    // Single task create
    const task = body?.task;
    if (!task?.name)
      return NextResponse.json(
        { error: "task.name required" },
        { status: 400 }
      );
    const id = String(
      task?.id ||
        Buffer.from(`${task.name}|${task.dueDate || ""}`)
          .toString("base64")
          .replace(/=+$/g, "")
    );
    const doc = {
      uid,
      id,
      ...task,
      source: task?.source || "chat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await col.updateOne({ uid, id }, { $set: doc }, { upsert: true });
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
