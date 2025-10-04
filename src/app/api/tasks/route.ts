import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const uid = String(
      body?.uid || req.nextUrl.searchParams.get("uid") || ""
    ).trim();
    const task = body?.task;
    if (!uid)
      return NextResponse.json({ error: "uid required" }, { status: 400 });
    if (!task?.name)
      return NextResponse.json(
        { error: "task.name required" },
        { status: 400 }
      );

    const { adminDb } = await import("@/lib/firebase-admin");
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
        },
        { merge: true }
      );
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
