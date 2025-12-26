import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminAuth } from "@/lib/firebase-admin";
import {
  normalizeProjectName,
  type MismatchAction,
  type TimesheetMismatch,
} from "@/lib/timesheet-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUid(req: NextRequest): Promise<string | null> {
  const qp = req.nextUrl.searchParams.get("uid");
  if (qp) return qp;
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;
  try {
    const adminAuth = getAdminAuth();
    if (!adminAuth) return null;
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

function normalizeTaskName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAltAssignedProjects({
  req,
  uid,
}: {
  req: NextRequest;
  uid: string;
}): Promise<{ id: number; name: string }[]> {
  const url = new URL("/api/harvest/project-assignments", req.nextUrl.origin);
  url.searchParams.set("uid", uid);
  url.searchParams.set("conn", "alt");
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to load secondary projects");
  const list = Array.isArray(json?.projects) ? json.projects : [];
  return list
    .map((p: any) => ({ id: Number(p?.id), name: String(p?.name || "") }))
    .filter((p: any) => Number.isFinite(p.id) && p.name);
}

async function fetchAltTasksForProject({
  req,
  uid,
  projectId,
}: {
  req: NextRequest;
  uid: string;
  projectId: number;
}): Promise<{ id: number; name: string }[]> {
  const url = new URL("/api/harvest/task-assignments", req.nextUrl.origin);
  url.searchParams.set("uid", uid);
  url.searchParams.set("conn", "alt");
  url.searchParams.set("project_id", String(projectId));
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to load secondary tasks");
  const list = Array.isArray(json?.tasks) ? json.tasks : [];
  return list
    .map((t: any) => ({ id: Number(t?.id), name: String(t?.name || "") }))
    .filter((t: any) => Number.isFinite(t.id) && t.name);
}

async function createAltEntry({
  req,
  uid,
  payload,
}: {
  req: NextRequest;
  uid: string;
  payload: any;
}) {
  const url = new URL("/api/harvest/timesheets", req.nextUrl.origin);
  url.searchParams.set("uid", uid);
  url.searchParams.set("conn", "alt");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || json?.message || "Create failed");
  return json;
}

async function patchAltEntry({
  req,
  uid,
  entryId,
  payload,
}: {
  req: NextRequest;
  uid: string;
  entryId: string;
  payload: any;
}) {
  const url = new URL(`/api/harvest/timesheets/${encodeURIComponent(entryId)}`, req.nextUrl.origin);
  url.searchParams.set("uid", uid);
  url.searchParams.set("conn", "alt");
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || json?.message || "Update failed");
  return json;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUid(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const mismatchIds = Array.isArray(body?.mismatchIds)
      ? body.mismatchIds.map((x: any) => String(x)).filter(Boolean)
      : [];
    const applyAll = Boolean(body?.applyAll);

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const { timesheetMismatches } = getCollectionNames();
    const report = await db.collection(timesheetMismatches).findOne({
      uid,
      from,
      to,
      status: "pending",
    });
    if (!report) {
      return NextResponse.json(
        { error: "No pending mismatch report for this range. Run the check first." },
        { status: 400 }
      );
    }

    const mismatches: TimesheetMismatch[] = Array.isArray((report as any)?.mismatches)
      ? ((report as any).mismatches as any)
      : [];

    const target = applyAll
      ? mismatches.filter((m) => (m as any)?.status !== "applied")
      : mismatches.filter((m) => mismatchIds.includes(String((m as any)?.id)));

    // Preload alt projects list once for project resolution
    const altProjects = await fetchAltAssignedProjects({ req, uid });
    const altProjectsByNorm = new Map<string, { id: number; name: string }[]>();
    for (const p of altProjects) {
      const k = normalizeProjectName(p.name);
      if (!altProjectsByNorm.has(k)) altProjectsByNorm.set(k, []);
      altProjectsByNorm.get(k)!.push(p);
    }

    const results: {
      mismatchId: string;
      applied: boolean;
      actionsAttempted: number;
      actionsSucceeded: number;
      errors: string[];
    }[] = [];

    // Cache tasks per projectId
    const tasksCache = new Map<number, { id: number; name: string }[]>();

    for (const mm of target) {
      const mmId = String((mm as any)?.id || "");
      const actions: MismatchAction[] = Array.isArray((mm as any)?.suggestedActions)
        ? (mm as any).suggestedActions
        : [];
      const actionable = actions.filter((a) => a && (a as any).targetConn === "alt");
      if (actionable.length === 0) {
        results.push({
          mismatchId: mmId,
          applied: false,
          actionsAttempted: 0,
          actionsSucceeded: 0,
          errors: ["No actionable suggestions for secondary (alt)"],
        });
        continue;
      }

      let succeeded = 0;
      const errors: string[] = [];

      for (const action of actionable) {
        try {
          if (action.kind === "update_entry") {
            const payload: any = {};
            if (typeof action.hours === "number") payload.hours = action.hours;
            if (typeof action.notes === "string") payload.notes = action.notes;
            if (Object.keys(payload).length === 0) throw new Error("No fields to update");
            await patchAltEntry({
              req,
              uid,
              entryId: String(action.entryId),
              payload,
            });
            succeeded++;
            continue;
          }

          if (action.kind === "create_entry") {
            const projectName = String(action.projectName || "").trim();
            const taskName = String(action.taskName || "").trim();
            if (!projectName) throw new Error("Missing project name on action");
            if (!taskName) throw new Error("Missing task name on action");

            const normProj = normalizeProjectName(projectName);
            const candidates = altProjectsByNorm.get(normProj) || [];
            if (candidates.length === 0) {
              throw new Error(`No matching secondary project for: ${projectName}`);
            }
            // If multiple, pick first
            const chosenProject = candidates[0];

            if (!tasksCache.has(chosenProject.id)) {
              tasksCache.set(
                chosenProject.id,
                await fetchAltTasksForProject({
                  req,
                  uid,
                  projectId: chosenProject.id,
                })
              );
            }
            const tasks = tasksCache.get(chosenProject.id)!;
            const normTask = normalizeTaskName(taskName);
            const task =
              tasks.find((t) => normalizeTaskName(t.name) === normTask) ||
              tasks.find((t) => normalizeTaskName(t.name).includes(normTask)) ||
              tasks.find((t) => normTask.includes(normalizeTaskName(t.name)));
            if (!task) {
              throw new Error(
                `No matching task "${taskName}" on secondary project "${chosenProject.name}"`
              );
            }

            const payload = {
              project_id: chosenProject.id,
              task_id: task.id,
              spent_date: String(action.spent_date),
              hours: Number(action.hours || 0),
              notes: String(action.notes || ""),
            };
            await createAltEntry({ req, uid, payload });
            succeeded++;
            continue;
          }

          throw new Error("Unknown action");
        } catch (e: any) {
          errors.push(e?.message || "Action failed");
        }
      }

      const applied = succeeded === actionable.length;
      results.push({
        mismatchId: mmId,
        applied,
        actionsAttempted: actionable.length,
        actionsSucceeded: succeeded,
        errors,
      });
    }

    // Update mismatch statuses in stored report
    const now = new Date().toISOString();
    const resultById = new Map(results.map((r) => [r.mismatchId, r]));
    const updatedMismatches = mismatches.map((m: any) => {
      const r = resultById.get(String(m?.id || ""));
      if (!r) return m;
      if (r.applied) return { ...m, status: "applied", updatedAt: now };
      return { ...m, updatedAt: now };
    });
    await db.collection(timesheetMismatches).updateOne(
      { uid, from, to, status: "pending" },
      { $set: { mismatches: updatedMismatches, updatedAt: now } }
    );

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to apply mismatches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


