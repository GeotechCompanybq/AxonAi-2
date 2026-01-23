import { adminDb } from "@/lib/firebase-admin";
import { getDb, getCollectionNames } from "@/lib/mongo";

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
    const first = Array.isArray((json as any)?.accounts)
      ? (json as any).accounts[0]
      : undefined;
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
}): Promise<any[]> {
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
    if (!res.ok) break;
    const items = Array.isArray((json as any)?.time_entries)
      ? (json as any).time_entries
      : [];
    all.push(...items);
    const nextPage = (json as any)?.next_page;
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return all;
}

async function syncForUserConn({
  uid,
  conn,
  token,
  accountId,
  range,
}: {
  uid: string;
  conn: "primary" | "alt";
  token: string;
  accountId?: string;
  range: { from: string; to: string };
}): Promise<number> {
  const db = await getDb();
  const { timesheets, users } = getCollectionNames();

  let acct = String(accountId || "").trim();
  if (!acct) {
    const resolved = await resolveHarvestAccountId(token);
    if (resolved) {
      acct = resolved;
      const field =
        conn === "alt" ? "harvestAlt.accountId" : "harvest.accountId";
      try {
        await db.collection(users).updateOne(
          { uid },
          { $set: { uid, [field]: resolved } as any },
          { upsert: true }
        );
      } catch {}
      try {
        if (conn === "alt") {
          await adminDb
            .collection("users")
            .doc(uid)
            .set({ harvestAlt: { accountId: resolved } }, { merge: true });
        } else {
          await adminDb
            .collection("users")
            .doc(uid)
            .set({ harvest: { accountId: resolved } }, { merge: true });
        }
      } catch {}
    }
  }
  if (!acct) return 0;

  const entries = await fetchHarvestEntriesDirect({
    token,
    accountId: acct,
    from: range.from,
    to: range.to,
  });

  const ops = entries.map((t: any) => {
    const rawId = String(t?.id ?? `${t?.spent_date}_${t?.user?.id || "me"}`);
    const harvestId = conn === "alt" ? `alt:${rawId}` : rawId;
    const doc = {
      uid,
      harvestId,
      harvestConn: conn,
      ...t,
      syncedAt: new Date().toISOString(),
    };
    return {
      updateOne: {
        filter: { uid, harvestId },
        update: { $set: doc },
        upsert: true,
      },
    } as const;
  });

  if (ops.length) {
    await db.collection(timesheets).bulkWrite(ops as any, { ordered: false });
  }

  return entries.length;
}

export async function runHarvestTimesheetSync(opts?: {
  uid?: string;
  days?: number;
  dry?: boolean;
}): Promise<{ ok: true; processedUsers: number; entries: number }> {
  if (opts?.dry) return { ok: true, processedUsers: 0, entries: 0 } as const;

  const days = Number(opts?.days || process.env.HARVEST_SYNC_DAYS || 30);
  const range = defaultRangeDays(days);

  const db = await getDb();
  const { users } = getCollectionNames();

  let processedUsers = 0;
  let entries = 0;

  const cursor = opts?.uid
    ? db.collection(users).find({ uid: opts.uid })
    : db.collection(users).find({
        $or: [
          { "harvest.accessToken": { $exists: true } },
          { "harvestAlt.accessToken": { $exists: true } },
        ],
      });

  for await (const user of cursor) {
    const uid = String((user as any)?.uid || "");
    if (!uid) continue;

    const harvest = (user as any)?.harvest as any;
    const harvestAlt = (user as any)?.harvestAlt as any;

    const primaryToken = String(harvest?.accessToken || "").trim();
    const altToken = String(harvestAlt?.accessToken || "").trim();

    let userEntries = 0;
    try {
      if (primaryToken) {
        userEntries += await syncForUserConn({
          uid,
          conn: "primary",
          token: primaryToken,
          accountId: harvest?.accountId,
          range,
        });
      }
      if (altToken) {
        userEntries += await syncForUserConn({
          uid,
          conn: "alt",
          token: altToken,
          accountId: harvestAlt?.accountId,
          range,
        });
      }
    } catch (e) {
      console.error("[harvest-sync] failed for uid", uid, e);
    }

    if (userEntries > 0) {
      processedUsers++;
      entries += userEntries;
    }
  }

  // Firestore-only fallback (best-effort) if Mongo has no users
  if (!opts?.uid && processedUsers === 0) {
    try {
      const snap = await adminDb.collection("users").get();
      for (const doc of snap.docs) {
        const uid = doc.id;
        const primaryToken = String(doc.get("harvest.accessToken") || "").trim();
        const altToken = String(doc.get("harvestAlt.accessToken") || "").trim();
        const primaryAccountId = doc.get("harvest.accountId") as string | undefined;
        const altAccountId = doc.get("harvestAlt.accountId") as string | undefined;

        let userEntries = 0;
        try {
          if (primaryToken) {
            userEntries += await syncForUserConn({
              uid,
              conn: "primary",
              token: primaryToken,
              accountId: primaryAccountId,
              range,
            });
          }
          if (altToken) {
            userEntries += await syncForUserConn({
              uid,
              conn: "alt",
              token: altToken,
              accountId: altAccountId,
              range,
            });
          }
        } catch {}

        if (userEntries > 0) {
          processedUsers++;
          entries += userEntries;
        }
      }
    } catch {}
  }

  return { ok: true, processedUsers, entries };
}



