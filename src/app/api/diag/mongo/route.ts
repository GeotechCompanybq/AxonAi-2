import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mod = await import("@/lib/mongo");
    // Try a very small, safe action that forces the driver to load.
    const db = await mod.getDb();
    const ping = await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, ping });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}


