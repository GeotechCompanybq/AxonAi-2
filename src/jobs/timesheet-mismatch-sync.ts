import { getDb, getCollectionNames } from "@/lib/mongo";
import { EmailNotificationService } from "@/lib/email-notifications";
import { detectBillableMismatches, type HarvestEntry } from "@/lib/timesheet-matching";
import { getAdminAuth } from "@/lib/firebase-admin";

type MatchJobSettings = {
  billableClientNames: string[];
  matchToleranceMinutes: number;
  notificationEmail?: string;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRangeDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - Math.max(0, days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

async function resolveHarvestAccountId(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://id.getharvest.com/api/v2/accounts", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const json = await res.json();
    if (!res.ok) return null;
    const first = Array.isArray((json as any)?.accounts) ? (json as any).accounts[0] : undefined;
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

async function fetchHarvestEntriesDirect({
  token,
  accountId,
  from,
  to,
}: {
  token: string;
  accountId: string;
  from: string;
  to: string;
}): Promise<HarvestEntry[]> {
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
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const msg =
        (json as any)?.message ||
        (json as any)?.error ||
        JSON.stringify(json);
      throw new Error(`Harvest time_entries failed (${res.status}): ${msg}`);
    }
    const items = Array.isArray((json as any)?.time_entries)
      ? (json as any).time_entries
      : [];
    all.push(...items);
    const nextPage = (json as any)?.next_page;
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return all as any;
}

async function loadUserSettings(uid: string): Promise<MatchJobSettings> {
  const db = await getDb();
  const { timesheetSettings, users } = getCollectionNames();
  const s = await db.collection(timesheetSettings).findOne({ uid });
  const u = await db.collection(users).findOne({ uid });

  // Notifications should go to the logged-in user's email.
  // Prefer Firebase Auth email (authoritative), fallback to Mongo users.email if present.
  let notificationEmail: string | undefined;
  try {
    const adminAuth = getAdminAuth();
    const authUser = adminAuth ? await adminAuth.getUser(uid) : null;
    const email = String(authUser?.email || "").trim();
    if (email) notificationEmail = email;
  } catch {}
  if (!notificationEmail) {
    const email = String((u as any)?.email || "").trim();
    if (email) notificationEmail = email;
  }
  return {
    billableClientNames: Array.isArray((s as any)?.billableClientNames)
      ? (s as any).billableClientNames.map((x: any) => String(x))
      : ["TruePoint Solutions"],
    matchToleranceMinutes: Number((s as any)?.matchToleranceMinutes ?? 5) || 5,
    notificationEmail,
  };
}

function mismatchEmailHtml({
  count,
  from,
  to,
}: {
  count: number;
  from: string;
  to: string;
}) {
  const href = `/timesheets/mismatches?from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}`;
  return `
    <p>We found <strong>${count}</strong> billable timesheet mismatch${
      count === 1 ? "" : "es"
    } between your <strong>Primary</strong> and <strong>Grayquarter</strong> Harvest connections.</p>
    <p><strong>Range:</strong> ${from} → ${to}</p>
    <p><a href="${href}">Open mismatch approvals</a></p>
  `;
}

export async function runTimesheetMismatchSync(opts?: {
  uid?: string;
  days?: number;
}): Promise<{ ok: true; processed: number; emailed: number }> {
  const db = await getDb();
  const { users, timesheetMismatches } = getCollectionNames();
  const days = Number(opts?.days || 7);
  const range = defaultRangeDays(days);

  let processed = 0;
  let emailed = 0;

  const cursor = opts?.uid
    ? db.collection(users).find({ uid: opts.uid })
    : db
        .collection(users)
        .find({ "harvest.accessToken": { $exists: true }, "harvestAlt.accessToken": { $exists: true } });

  for await (const user of cursor) {
    const uid = String((user as any)?.uid || "");
    if (!uid) continue;
    const settings = await loadUserSettings(uid);

    try {
      const harvest = (user as any)?.harvest as any;
      const harvestAlt = (user as any)?.harvestAlt as any;
      const primaryToken = String(harvest?.accessToken || "").trim();
      const altToken = String(harvestAlt?.accessToken || "").trim();
      if (!primaryToken || !altToken) continue;

      let primaryAccountId = String(harvest?.accountId || "").trim();
      let altAccountId = String(harvestAlt?.accountId || "").trim();

      // Resolve missing account ids (best-effort) and persist back to Mongo
      if (!primaryAccountId) {
        const resolved = await resolveHarvestAccountId(primaryToken);
        if (resolved) {
          primaryAccountId = resolved;
          await db.collection(users).updateOne(
            { uid },
            { $set: { "harvest.accountId": resolved } }
          );
        }
      }
      if (!altAccountId) {
        const resolved = await resolveHarvestAccountId(altToken);
        if (resolved) {
          altAccountId = resolved;
          await db.collection(users).updateOne(
            { uid },
            { $set: { "harvestAlt.accountId": resolved } }
          );
        }
      }

      if (!primaryAccountId || !altAccountId) {
        throw new Error("Missing Harvest account id(s) for user");
      }

      const [primaryEntries, altEntries] = await Promise.all([
        fetchHarvestEntriesDirect({
          token: primaryToken,
          accountId: primaryAccountId,
          from: range.from,
          to: range.to,
        }),
        fetchHarvestEntriesDirect({
          token: altToken,
          accountId: altAccountId,
          from: range.from,
          to: range.to,
        }),
      ]);

      const mismatches = detectBillableMismatches({
        primaryEntries,
        altEntries,
        from: range.from,
        to: range.to,
        settings: { ...settings, sourceOfTruth: "primary" },
      });

      const now = new Date().toISOString();
      const doc = {
        uid,
        from: range.from,
        to: range.to,
        status: "pending",
        mismatchCount: mismatches.length,
        mismatches,
        updatedAt: now,
        createdAt: now,
      };

      // Detect new mismatches vs last stored count
      const prev = await db.collection(timesheetMismatches).findOne({
        uid,
        from: range.from,
        to: range.to,
        status: "pending",
      });
      const prevCount = Number((prev as any)?.mismatchCount || 0);

      await db.collection(timesheetMismatches).updateOne(
        { uid, from: range.from, to: range.to, status: "pending" },
        { $set: doc },
        { upsert: true }
      );

      if (
        settings.notificationEmail &&
        mismatches.length > 0 &&
        mismatches.length !== prevCount
      ) {
        try {
          await EmailNotificationService.sendEmail({
            to: settings.notificationEmail,
            subject: `Timesheet mismatches pending approval (${mismatches.length})`,
            htmlBody: mismatchEmailHtml({
              count: mismatches.length,
              from: range.from,
              to: range.to,
            }),
          });
          emailed++;
        } catch (e) {
          console.error("[mismatch-sync] email failed", e);
        }
      }

      processed++;
    } catch (e) {
      console.error("[mismatch-sync] failed for uid", uid, e);
    }
  }

  return { ok: true, processed, emailed };
}


