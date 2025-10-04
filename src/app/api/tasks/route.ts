import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const uid = String(
      body?.uid || req.nextUrl.searchParams.get("uid") || ""
    ).trim();
    if (!uid)
      return NextResponse.json({ error: "uid required" }, { status: 400 });

    const { adminDb } = await import("@/lib/firebase-admin");

    // Bulk upsert mode (used by Monday import fallback)
    if (Array.isArray(body?.bulk)) {
      const tasks: any[] = body.bulk;
      const col = adminDb.collection("users").doc(uid).collection("tasks");
      const batch = adminDb.batch();
      for (const t of tasks) {
        const name = String(t?.name || "").trim();
        if (!name) continue;
        const id = String(
          t?.id ||
            Buffer.from(`${name}|${t?.dueDate || ""}|${t?.source || "monday"}`)
              .toString("base64")
              .replace(/=+$/g, "")
        );
        const ref = col.doc(id);
        batch.set(
          ref,
          {
            ...t,
            source: t?.source || "import",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      return NextResponse.json({ inserted: body.bulk.length });
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
    await adminDb
      .collection("users")
      .doc(uid)
      .collection("tasks")
      .doc(id)
      .set(
        {
          ...task,
          source: task?.source || "chat",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
