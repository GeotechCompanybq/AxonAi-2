import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getUidFromRequest,
  loadMicrosoftTokensForUser,
  persistMicrosoftTokensForUser,
  refreshMicrosoftTokens,
  setMicrosoftAuthCookies,
  type MicrosoftTokenSet,
} from "@/lib/microsoft";
import { getDb, getCollectionNames } from "@/lib/mongo";

export const runtime = "nodejs";

type HarvestAuth =
  | { token: string; accountId: string }
  | { error: string; status: number };

type MeetingDraft = {
  microsoftEventId: string;
  subject: string;
  spent_date: string; // YYYY-MM-DD
  hours: number;
  notes: string;
  existingEntryId?: number; // If set, this entry should be updated instead of created
};

function parseIsoDate(value: string): Date | null {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function listDatesInclusive(from: string, to: string, maxDays = 62): string[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return [];
  const out: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
    if (guard > maxDays) break;
  }
  return out;
}

function roundToIncrementHours(hours: number, minutes: number): number {
  const inc = Math.max(1, minutes);
  const factor = 60 / inc;
  return Math.round(hours * factor) / factor;
}

function clampNotes(s: string, max = 255): string {
  const v = String(s || "").trim();
  if (!v) return "";
  return v.length > max ? v.slice(0, max - 1) + "…" : v;
}

function isExpired({ tokens }: { tokens: MicrosoftTokenSet }): boolean {
  if (!tokens.expiresAt) return false;
  return Date.now() >= tokens.expiresAt - 30_000;
}

async function getHarvestAuth(req: NextRequest): Promise<HarvestAuth> {
  const connRaw = req.nextUrl.searchParams.get("conn") || "";
  const isAlt =
    connRaw.trim().toLowerCase() === "alt" ||
    connRaw.trim().toLowerCase() === "compare" ||
    connRaw.trim().toLowerCase() === "secondary";

  const cookieStore = await cookies();
  let token = cookieStore.get(isAlt ? "harvest_token_alt" : "harvest_token")?.value;
  let accountId = cookieStore.get(isAlt ? "harvest_account_id_alt" : "harvest_account_id")?.value;
  const uid = req.nextUrl.searchParams.get("uid") || undefined;

  if (!token || !accountId) {
    if (uid) {
      // Prefer Mongo
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        const doc = await db.collection(users).findOne({ uid });
        token =
          token ||
          ((isAlt
            ? (doc as any)?.harvestAlt?.accessToken
            : (doc as any)?.harvest?.accessToken) as string | undefined);
        accountId =
          accountId ||
          ((isAlt
            ? (doc as any)?.harvestAlt?.accountId
            : (doc as any)?.harvest?.accountId) as string | undefined);
      } catch {}
      // Fallback Firestore
      if (!token || !accountId) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token =
            token ||
            ((isAlt
              ? snap.get("harvestAlt.accessToken")
              : snap.get("harvest.accessToken")) as string | undefined);
          accountId =
            accountId ||
            ((isAlt
              ? snap.get("harvestAlt.accountId")
              : snap.get("harvest.accountId")) as string | undefined);
        } catch {}
      }
    }
  }

  if (!token) return { error: "Not connected to Harvest", status: 400 } as const;
  if (!accountId) return { error: "Missing Harvest account id", status: 400 } as const;
  return { token, accountId } as const;
}

async function fetchCalendarView({
  accessToken,
  start,
  end,
  timezone,
}: {
  accessToken: string;
  start: string;
  end: string;
  timezone?: string;
}) {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: `outlook.timezone="${timezone || "UTC"}"`,
    },
    cache: "no-store",
  });
  const json = await res.json();
  return { res, json };
}

function parseGraphDateTime(value: any): Date | null {
  const dt = String(value?.dateTime || "").trim();
  if (!dt) return null;
  // If Graph returns "YYYY-MM-DDTHH:mm:ss" without timezone, treat as UTC.
  const hasZone =
    dt.endsWith("Z") ||
    /[+-]\d\d:\d\d$/.test(dt) ||
    /[+-]\d\d\d\d$/.test(dt);
  const d = new Date(hasZone ? dt : `${dt}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchHarvestEntries({
  token,
  accountId,
  from,
  to,
}: {
  token: string;
  accountId: string;
  from: string;
  to: string;
}) {
  const url = new URL("https://api.harvestapp.com/v2/time_entries");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("per_page", "100");
  let page = 1;
  const all: any[] = [];
  while (true) {
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent":
          process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
        Accept: "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    const items = Array.isArray(json?.time_entries) ? json.time_entries : [];
    all.push(...items);
    const nextPage = (json as any)?.next_page;
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return all;
}

async function getMeetingTargetFromSettings({
  uid,
}: {
  uid: string;
}): Promise<{ projectId: string; taskId: string } | null> {
  try {
    const db = await getDb();
    const { timesheetSettings } = getCollectionNames();
    const doc = await db.collection(timesheetSettings).findOne({ uid });
    const projectId = String((doc as any)?.meetingHarvestProjectId || "").trim();
    const taskId = String((doc as any)?.meetingHarvestTaskId || "").trim();
    if (!projectId || !taskId) return null;
    return { projectId, taskId };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const uid =
      (await getUidFromRequest({ req })) ||
      (req.nextUrl.searchParams.get("uid") || body?.uid || "").trim() ||
      null;
    if (!uid)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    if (!from || !to)
      return NextResponse.json(
        { error: "from and to are required (YYYY-MM-DD)" },
        { status: 400 }
      );

    const dateList = listDatesInclusive(from, to, 62);
    if (dateList.length === 0)
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 }
      );

    const tz = String(body?.tz || "UTC");
    const incrementMinutes = Number(body?.incrementMinutes || 15);
    const dryRun = Boolean(body?.dryRun);

    const explicitProjectId = String(body?.projectId || "").trim();
    const explicitTaskId = String(body?.taskId || "").trim();
    const target =
      explicitProjectId && explicitTaskId
        ? { projectId: explicitProjectId, taskId: explicitTaskId }
        : await getMeetingTargetFromSettings({ uid });
    if (!target)
      return NextResponse.json(
        {
          error:
            "Missing meeting Harvest target. Set a default project/task in Timesheet Settings.",
        },
        { status: 400 }
      );

    // Microsoft tokens
    let tokens = await loadMicrosoftTokensForUser({ req, uid });
    if (!tokens?.accessToken) {
      return NextResponse.json(
        { error: "Not connected to Microsoft" },
        { status: 400 }
      );
    }

    // Refresh proactively
    if (uid && isExpired({ tokens }) && tokens.refreshToken) {
      try {
        const refreshed = await refreshMicrosoftTokens({
          refreshToken: tokens.refreshToken,
        });
        tokens = refreshed;
        await persistMicrosoftTokensForUser({ uid, tokens: refreshed });
        await setMicrosoftAuthCookies({ tokens: refreshed });
      } catch {}
    }

    // Fetch Microsoft events for range (inclusive, UTC boundaries)
    const startIso = `${from}T00:00:00.000Z`;
    const endIso = `${to}T23:59:59.999Z`;
    let { res: msRes, json: msJson } = await fetchCalendarView({
      accessToken: tokens.accessToken,
      start: startIso,
      end: endIso,
      timezone: tz,
    });

    // Retry once on 401
    if (!msRes.ok && msRes.status === 401 && tokens.refreshToken) {
      const refreshed = await refreshMicrosoftTokens({
        refreshToken: tokens.refreshToken,
      });
      await persistMicrosoftTokensForUser({ uid, tokens: refreshed });
      await setMicrosoftAuthCookies({ tokens: refreshed });
      const retry = await fetchCalendarView({
        accessToken: refreshed.accessToken,
        start: startIso,
        end: endIso,
        timezone: tz,
      });
      msRes = retry.res;
      msJson = retry.json;
    }

    if (!msRes.ok) {
      const message =
        (msJson as any)?.error?.message ||
        (msJson as any)?.error_description ||
        "Failed to fetch calendar";
      return NextResponse.json({ error: message }, { status: msRes.status });
    }

    const events = Array.isArray((msJson as any)?.value) ? (msJson as any).value : [];

    // Harvest auth + existing entries for dedupe
    const harvestAuth = await getHarvestAuth(req);
    if ("error" in harvestAuth)
      return NextResponse.json(
        { error: harvestAuth.error },
        { status: harvestAuth.status }
      );

    // Verify Harvest user identity
    let harvestUser: any = null;
    try {
      const userRes = await fetch("https://api.harvestapp.com/v2/users/me", {
        headers: {
          Authorization: `Bearer ${harvestAuth.token}`,
          "Harvest-Account-Id": harvestAuth.accountId,
          "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
        },
      });
      if (userRes.ok) {
        harvestUser = await userRes.json();
        console.log('[Harvest] Posting as user:', {
          name: harvestUser?.first_name + ' ' + harvestUser?.last_name,
          email: harvestUser?.email,
          accountId: harvestAuth.accountId,
        });
      }
    } catch (e) {
      console.error('[Harvest] Failed to fetch user info:', e);
    }

    const existing = await fetchHarvestEntries({
      token: harvestAuth.token,
      accountId: harvestAuth.accountId,
      from,
      to,
    });

    // Create a map of existing entries for deduplication and updates
    // Key: "subject|date|hours" (normalized for comparison)
    // Value: { id: harvestEntryId, notes: currentNotes }
    const existingEntries = new Map<string, { id: number; notes: string }>();
    for (const e of existing) {
      const notes = String(e?.notes || "").trim();
      const date = String(e?.spent_date || "").trim();
      const hours = Number(e?.hours || 0);
      const entryId = Number(e?.id || 0);
      // Remove any [MS:...] markers from notes for comparison
      const cleanNotes = notes.replace(/\[MS[^:]*:[^\]]+\]/gi, "").trim();
      if (cleanNotes && date && hours > 0 && entryId > 0) {
        const key = `${cleanNotes.toLowerCase()}|${date}|${hours.toFixed(2)}`;
        existingEntries.set(key, { id: entryId, notes });
      }
    }

    const drafts: MeetingDraft[] = [];
    for (const e of events) {
      const id = String(e?.id || "").trim();
      if (!id) continue;
      const subject = String(e?.subject || "Meeting").trim() || "Meeting";
      const isAllDay = Boolean(e?.isAllDay);
      if (isAllDay) continue;
      const start = parseGraphDateTime(e?.start);
      const end = parseGraphDateTime(e?.end);
      if (!start || !end) continue;
      const durMs = end.getTime() - start.getTime();
      if (!Number.isFinite(durMs) || durMs <= 5 * 60_000) continue;
      const rawHours = durMs / 3_600_000;
      const hours = Math.max(
        0,
        roundToIncrementHours(rawHours, Number.isFinite(incrementMinutes) ? incrementMinutes : 15)
      );
      if (hours <= 0) continue;
      const spent_date = start.toISOString().slice(0, 10);
      // Guard: keep in requested date list
      if (!dateList.includes(spent_date)) continue;

      // Check for existing entry using subject, date, and hours
      const dedupeKey = `${subject.toLowerCase()}|${spent_date}|${hours.toFixed(2)}`;
      const existingEntry = existingEntries.get(dedupeKey);

      // Notes without any codes - just the subject
      const notes = clampNotes(subject);
      
      // If entry exists but notes are different, update it
      // If entry doesn't exist, create it
      if (existingEntry && existingEntry.notes === notes) {
        // Entry exists with same notes, skip it
        continue;
      }

      drafts.push({
        microsoftEventId: id,
        subject,
        spent_date,
        hours,
        notes,
        existingEntryId: existingEntry?.id,
      });
    }

    // Sort for nicer UI
    drafts.sort((a, b) =>
      a.spent_date === b.spent_date
        ? a.subject.localeCompare(b.subject)
        : a.spent_date.localeCompare(b.spent_date)
    );

    if (dryRun) {
      const wouldCreate = drafts.filter(d => !d.existingEntryId).length;
      const wouldUpdate = drafts.filter(d => d.existingEntryId).length;
      return NextResponse.json({
        ok: true,
        dryRun: true,
        target,
        drafts,
        wouldCreate,
        wouldUpdate,
        skippedAlreadyPosted: events.length - drafts.length,
      });
    }

    const created: any[] = [];
    const updated: any[] = [];
    const errors: { microsoftEventId: string; error: string }[] = [];
    for (const d of drafts) {
      try {
        const payload = {
          project_id: Number(target.projectId),
          task_id: Number(target.taskId),
          spent_date: d.spent_date,
          hours: d.hours,
          notes: d.notes,
        };

        // If existingEntryId is set, update the existing entry; otherwise create a new one
        const isUpdate = d.existingEntryId !== undefined;
        const url = isUpdate
          ? `https://api.harvestapp.com/v2/time_entries/${d.existingEntryId}`
          : "https://api.harvestapp.com/v2/time_entries";
        const method = isUpdate ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${harvestAuth.token}`,
            "Harvest-Account-Id": harvestAuth.accountId,
            "User-Agent":
              process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg =
            (json as any)?.message ||
            (json as any)?.error ||
            JSON.stringify(json);
          throw new Error(msg);
        }
        // Log successful operation for debugging
        const action = isUpdate ? "Updated" : "Created";
        console.log(`[Harvest] ${action} entry:`, {
          id: json?.id,
          project: json?.project?.name,
          task: json?.task?.name,
          hours: json?.hours,
          spent_date: json?.spent_date,
          notes: json?.notes?.substring(0, 50),
        });
        if (isUpdate) {
          updated.push(json);
        } else {
          created.push(json);
        }
      } catch (e: any) {
        errors.push({
          microsoftEventId: d.microsoftEventId,
          error: e?.message || (d.existingEntryId ? "Update failed" : "Create failed"),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      target,
      attempted: drafts.length,
      createdCount: created.length,
      updatedCount: updated.length,
      errorCount: errors.length,
      errors,
      created: created.map(entry => ({
        id: entry?.id,
        project: entry?.project?.name,
        task: entry?.task?.name,
        hours: entry?.hours,
        spent_date: entry?.spent_date,
        notes: entry?.notes,
        harvest_url: `https://app.harvestapp.com/time/entries/${entry?.id}`,
      })),
      updated: updated.map(entry => ({
        id: entry?.id,
        project: entry?.project?.name,
        task: entry?.task?.name,
        hours: entry?.hours,
        spent_date: entry?.spent_date,
        notes: entry?.notes,
        harvest_url: `https://app.harvestapp.com/time/entries/${entry?.id}`,
      })),
      harvestAccountId: harvestAuth.accountId,
      harvestUser: harvestUser ? {
        name: `${harvestUser.first_name} ${harvestUser.last_name}`,
        email: harvestUser.email,
      } : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to post meetings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


