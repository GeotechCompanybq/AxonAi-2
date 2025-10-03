import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Reuse Monday tasks fetcher by importing from the route file
// We exported fetchMondayTasks there.
import { fetchMondayTasks } from "@/app/api/monday/tasks/route";

type DraftTimesheet = {
  id: string;
  spent_date: string; // YYYY-MM-DD
  hours: number;
  notes: string;
  source: "monday";
  createdAt: string; // ISO
  status: "draft";
};

async function getHarvestAuth(
  req: NextRequest
): Promise<
  { token: string; accountId: string } | { error: string; status: number }
> {
  const cookieStore = await cookies();
  let token = cookieStore.get("harvest_token")?.value;
  let accountId = cookieStore.get("harvest_account_id")?.value;
  if (!token || !accountId) {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    if (uid) {
      try {
        const { adminDb } = await import("@/lib/firebase-admin");
        const snap = await adminDb.collection("users").doc(uid).get();
        token =
          token || (snap.get("harvest.accessToken") as string | undefined);
        accountId =
          accountId || (snap.get("harvest.accountId") as string | undefined);
      } catch {}
    }
  }
  if (!token)
    return { error: "Not connected to Harvest", status: 400 } as const;
  if (!accountId) {
    try {
      const res = await fetch("https://id.getharvest.com/api/v2/accounts", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const json = await res.json();
      const first = Array.isArray(json?.accounts)
        ? json.accounts[0]
        : undefined;
      if (first?.id) {
        accountId = String(first.id);
        const cookieStore2 = await cookies();
        cookieStore2.set("harvest_account_id", accountId, {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
    } catch {}
  }
  if (!accountId)
    return { error: "Missing Harvest account id", status: 400 } as const;
  return { token, accountId } as const;
}

async function fetchHarvestEntries(
  token: string,
  accountId: string,
  from: string,
  to: string
) {
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
          process.env.HARVEST_USER_AGENT ||
          "AxonAI (support@geotechcompany.us)",
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const uid = (req.nextUrl.searchParams.get("uid") || body?.uid || "").trim();
    const from = (body?.from || "").trim(); // YYYY-MM-DD
    const to = (body?.to || "").trim();
    const defaultHours = Number(body?.defaultHours ?? 1);
    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Monday token via cookie/DB
    const cookieStore = await cookies();
    let mondayToken = cookieStore.get("monday_token")?.value;
    if (!mondayToken && uid) {
      try {
        const { adminDb } = await import("@/lib/firebase-admin");
        const snap = await adminDb.collection("users").doc(uid).get();
        mondayToken = snap.get("monday.accessToken") as string | undefined;
      } catch {}
    }
    if (!mondayToken) {
      return NextResponse.json(
        { error: "Not connected to Monday" },
        { status: 400 }
      );
    }

    // Harvest auth
    const harvestAuth = await getHarvestAuth(req);
    if ("error" in harvestAuth)
      return NextResponse.json(
        { error: harvestAuth.error },
        { status: harvestAuth.status }
      );

    // Fetch Monday tasks and Harvest entries
    const mondayTasks = await fetchMondayTasks(mondayToken);
    const harvestEntries = await fetchHarvestEntries(
      harvestAuth.token,
      harvestAuth.accountId,
      from,
      to
    );

    // Build a set of dates that already have Harvest entries
    const datesWithEntries = new Set<string>();
    for (const e of harvestEntries) {
      const d = String(e?.spent_date || "");
      if (d) datesWithEntries.add(d);
    }

    // Filter Monday tasks in range and missing in Harvest
    function inRange(dateStr?: string) {
      if (!dateStr) return false;
      return dateStr >= from && dateStr <= to;
    }

    const drafts: DraftTimesheet[] = [];
    for (const t of mondayTasks) {
      const date = t?.dueDate as string | undefined;
      if (!inRange(date)) continue;
      if (datesWithEntries.has(date!)) continue; // already have time on that date
      const id = `${date}_${(t as any).id || t.name}`
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 120);
      drafts.push({
        id,
        spent_date: date!,
        hours:
          Number.isFinite(defaultHours) && defaultHours > 0 ? defaultHours : 1,
        notes: `${t.name} — ${t.description || "from Monday"}`.slice(0, 255),
        source: "monday",
        createdAt: new Date().toISOString(),
        status: "draft",
      });
    }

    // Persist drafts for manual approval
    if (uid && drafts.length > 0) {
      try {
        const { adminDb } = await import("@/lib/firebase-admin");
        const col = adminDb
          .collection("users")
          .doc(uid)
          .collection("timesheetDrafts");
        const batch = adminDb.batch();
        for (const d of drafts) {
          const ref = col.doc(d.id);
          batch.set(ref, d, { merge: true });
        }
        await batch.commit();
      } catch (e) {
        console.error("Failed to persist drafts", e);
      }
    }

    return NextResponse.json({ drafts });
  } catch (e) {
    console.error("reconcile drafts error", e);
    const message = e instanceof Error ? e.message : "Failed to reconcile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
