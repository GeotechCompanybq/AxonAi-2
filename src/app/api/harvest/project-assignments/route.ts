import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export const runtime = "nodejs";

async function getHarvestAuth(
  req: NextRequest
): Promise<{ token: string; accountId: string } | { error: string; status: number }> {
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

  if (!token) return { error: "Not connected", status: 400 } as const;
  if (!accountId) {
    // Resolve accountId from Harvest accounts API (same behavior as other Harvest routes)
    try {
      const accountsRes = await fetch("https://id.getharvest.com/api/v2/accounts", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const accountsJson = await accountsRes.json();
      const first = Array.isArray(accountsJson?.accounts) ? accountsJson.accounts[0] : undefined;
      if (first?.id) {
        accountId = String(first.id);
        const secureCookie = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
        const cookieStore2 = await cookies();
        cookieStore2.set(isAlt ? "harvest_account_id_alt" : "harvest_account_id", accountId, {
          httpOnly: true,
          sameSite: "lax",
          secure: secureCookie,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
        if (uid) {
          try {
            const db = await getDb();
            const { users } = getCollectionNames();
            const field = isAlt ? "harvestAlt.accountId" : "harvest.accountId";
            await db.collection(users).updateOne(
              { uid },
              { $set: { uid, [field]: accountId } as any },
              { upsert: true }
            );
          } catch {}
        }
      }
    } catch {}
  }
  if (!accountId) return { error: "Missing Harvest account id", status: 400 } as const;
  return { token, accountId } as const;
}

async function fetchAllProjectAssignments({
  token,
  accountId,
}: {
  token: string;
  accountId: string;
}) {
  const base = "https://api.harvestapp.com/v2/users/me/project_assignments";
  const url = new URL(base);
  url.searchParams.set("per_page", "100");
  let page = 1;
  const out: any[] = [];
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
    const items = Array.isArray((json as any)?.project_assignments)
      ? (json as any).project_assignments
      : [];
    out.push(...items);
    const nextPage = (json as any)?.next_page;
    if (!nextPage) break;
    page = Number(nextPage);
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getHarvestAuth(req);
    if ("error" in auth)
      return NextResponse.json({ error: auth.error }, { status: auth.status });

    const items = await fetchAllProjectAssignments({
      token: auth.token,
      accountId: auth.accountId,
    });

    const projects = items
      .map((pa: any) => ({
        id: pa?.project?.id,
        name: pa?.project?.name,
        is_active: Boolean(pa?.project?.is_active),
        is_billable: Boolean(pa?.project?.is_billable),
        client: pa?.project?.client?.name || null,
      }))
      .filter((p: any) => p?.id && p?.name);

    return NextResponse.json({ projects });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to fetch project assignments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


