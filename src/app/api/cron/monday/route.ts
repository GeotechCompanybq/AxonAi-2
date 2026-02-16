import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { EmailNotificationService } from "@/lib/email-notifications";
import { runMondaySync } from "@/jobs/monday-sync";

// Ensure long-running cron can complete
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300; // extend to 5 minutes (platform max)

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
      updateOne: {
        filter: { uid, id },
        update: [
          {
            $set: doc,
          },
          // Track inserts by checking if prior doc existed
        ],
        upsert: true,
      },
    } as const;
  });
  if (ops.length) {
    const bulkRes: any = await db
      .collection(userTasks)
      .bulkWrite(ops as any, { ordered: false });
    newlyInserted = Number(bulkRes?.upsertedCount || 0);
  }

  // If new tasks were inserted, send a concise email to the user
  if (newlyInserted > 0) {
    try {
      const userDoc = await db.collection(users).findOne({ uid });
      const email = (userDoc as any)?.email as string | undefined;
      if (email) {
        const safeCount = Math.min(newlyInserted, tasks.length);
        const previewNames = tasks
          .slice(0, 3)
          .map((t: any) => String(t?.name || "Untitled"))
          .join(", ");
        await EmailNotificationService.sendEmail({
          to: email,
          subject: `New tasks imported from Monday.com (${safeCount})`,
          htmlBody: `
            <p>We imported <strong>${safeCount}</strong> new task(s) from Monday.com into your workspace.</p>
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

function isAuthorized(_req: NextRequest): boolean {
  // Public endpoint: allow all requests (no secret required)
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fast health-check mode for schedulers that probe with short timeouts
    const dry = req.nextUrl.searchParams.get("dry") === "1";
    if (dry) return NextResponse.json({ ok: true, processed: 0 });

    const body = await req.json().catch(() => ({} as any));
    const targetUid =
      (body?.uid as string | undefined) ||
      req.nextUrl.searchParams.get("uid") ||
      undefined;
    const result = await runMondaySync({ uid: targetUid });
    if ((result as any)?.error) {
      return NextResponse.json(result as any, {
        status: (result as any).status || 400,
      });
    }
    return NextResponse.json(result as any);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run cron";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Allow GET for public cron services (query ?secret= or CRON_PUBLIC=1)
export async function GET(req: NextRequest) {
  return POST(req);
}

// Some schedulers perform a HEAD probe; return quick success
export async function HEAD(_req: NextRequest) {
  return new NextResponse(null, { status: 200 });
}
