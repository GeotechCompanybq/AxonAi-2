export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mod = await import("@/lib/mongo");
    // Try a very small, safe action that forces the driver to load.
    const db = await mod.getDb();
    const ping = await db.command({ ping: 1 });
    return new Response(JSON.stringify({ ok: true, ping }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}


