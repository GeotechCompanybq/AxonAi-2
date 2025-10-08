import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

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
  if (!token) return { error: "Not connected", status: 400 } as const;
  if (!accountId) {
    try {
      const accountsRes = await fetch(
        "https://id.getharvest.com/api/v2/accounts",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );
      const accountsJson = await accountsRes.json();
      const first = Array.isArray(accountsJson?.accounts)
        ? accountsJson.accounts[0]
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

async function fetchHarvestTimeEntriesPage(
  token: string,
  accountId: string,
  params: URLSearchParams
) {
  const baseUrl = "https://api.harvestapp.com/v2/time_entries";
  const url = new URL(baseUrl);
  // Copy params
  for (const [k, v] of params.entries()) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Harvest-Account-Id": accountId,
      "User-Agent":
        process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json as {
    time_entries: any[];
    total_pages?: number;
    next_page?: number;
    page?: number;
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getHarvestAuth(req);
    if ("error" in auth)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const from = req.nextUrl.searchParams.get("from") || undefined; // YYYY-MM-DD
    const to = req.nextUrl.searchParams.get("to") || undefined; // YYYY-MM-DD
    const fetchAll = req.nextUrl.searchParams.get("all") === "1";

    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("per_page", "100");

    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const doSync = req.nextUrl.searchParams.get("sync") === "1";
    if (!fetchAll) {
      const data = await fetchHarvestTimeEntriesPage(token, accountId, params);
      const list = data?.time_entries || [];
      if (uid && doSync) {
        try {
          const db = await getDb();
          const { timesheets } = getCollectionNames();
          const ops = list.map((t: any) => {
            const id = String(
              t?.id ?? `${t?.spent_date}_${t?.user?.id || "me"}`
            );
            const doc = {
              uid,
              harvestId: id,
              ...t,
              syncedAt: new Date().toISOString(),
            };
            return {
              updateOne: {
                filter: { uid, harvestId: id },
                update: { $set: doc },
                upsert: true,
              },
            } as const;
          });
          if (ops.length)
            await db
              .collection(timesheets)
              .bulkWrite(ops as any, { ordered: false });
        } catch (e) {
          console.error("Failed to sync timesheets", e);
        }
      }
      return NextResponse.json({ timeEntries: list });
    }

    // Paginate through all pages
    let page = 1;
    let allEntries: any[] = [];
    while (true) {
      params.set("page", String(page));
      const data = await fetchHarvestTimeEntriesPage(token, accountId, params);
      const items = Array.isArray(data?.time_entries) ? data.time_entries : [];
      allEntries = allEntries.concat(items);
      const nextPage = (data as any)?.next_page;
      if (!nextPage) break;
      page = Number(nextPage);
    }

    if (uid && doSync) {
      try {
        const db = await getDb();
        const { timesheets } = getCollectionNames();
        const ops = allEntries.map((t: any) => {
          const id = String(t?.id ?? `${t?.spent_date}_${t?.user?.id || "me"}`);
          const doc = {
            uid,
            harvestId: id,
            ...t,
            syncedAt: new Date().toISOString(),
          };
          return {
            updateOne: {
              filter: { uid, harvestId: id },
              update: { $set: doc },
              upsert: true,
            },
          } as const;
        });
        if (ops.length)
          await db
            .collection(timesheets)
            .bulkWrite(ops as any, { ordered: false });
      } catch (e) {
        console.error("Failed to sync timesheets", e);
      }
    }
    return NextResponse.json({ timeEntries: allEntries });
  } catch (e) {
    console.error("harvest timesheets error", e);
    const message =
      e instanceof Error ? e.message : "Failed to fetch time entries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getHarvestAuth(req);
    if ("error" in auth)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const body = await req.json();
    const res = await fetch("https://api.harvestapp.com/v2/time_entries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent":
          process.env.HARVEST_USER_AGENT ||
          "AxonAI (support@geotechcompany.us)",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json(json, { status: res.status });
    return NextResponse.json(json, { status: 201 });
  } catch (e) {
    console.error("harvest create time entry error", e);
    const message =
      e instanceof Error ? e.message : "Failed to create time entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
