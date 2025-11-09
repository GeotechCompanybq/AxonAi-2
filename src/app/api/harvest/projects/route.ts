import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

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
      // Fallback to Firestore if not found in Mongo
      if (!token || !accountId) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          token =
            token ||
            ((isAlt
              ? (snap.get("harvestAlt.accessToken") as string | undefined)
              : (snap.get("harvest.accessToken") as string | undefined)));
          accountId =
            accountId ||
            ((isAlt
              ? (snap.get("harvestAlt.accountId") as string | undefined)
              : (snap.get("harvest.accountId") as string | undefined)));
        } catch {}
      }
    }
  }
  if (!token) return { error: "Not connected", status: 400 } as const;
  if (!accountId) {
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
        const cookieStore2 = await cookies();
        cookieStore2.set(isAlt ? "harvest_account_id_alt" : "harvest_account_id", accountId, {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
        // Persist resolved account id to DB/Firestore for consistency
        if (uid) {
          try {
            const db = await getDb();
            const { users } = getCollectionNames();
            const field = isAlt ? "harvestAlt.accountId" : "harvest.accountId";
            await db
              .collection(users)
              .updateOne({ uid }, { $set: { uid, [field]: accountId } as any }, { upsert: true });
          } catch {}
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            if (isAlt) {
              await adminDb.collection("users").doc(uid).set({ harvestAlt: { accountId } }, { merge: true });
            } else {
              await adminDb.collection("users").doc(uid).set({ harvest: { accountId } }, { merge: true });
            }
          } catch {}
        }
      }
    } catch {}
  }
  if (!accountId) return { error: "Missing Harvest account id", status: 400 } as const;
  return { token, accountId } as const;
}

async function fetchProjects(
  token: string,
  accountId: string,
  all: boolean,
  isActiveOnly: boolean
) {
  const base = "https://api.harvestapp.com/v2/projects";
  const url = new URL(base);
  if (isActiveOnly) url.searchParams.set("is_active", "true");
  url.searchParams.set("per_page", "100");
  if (!all) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return (Array.isArray(json?.projects) ? json.projects : []) as any[];
  }
  let page = 1;
  const out: any[] = [];
  while (true) {
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    out.push(...(Array.isArray(json?.projects) ? json.projects : []));
    const next = (json as any)?.next_page;
    if (!next) break;
    page = Number(next);
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getHarvestAuth(req);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const all = req.nextUrl.searchParams.get("all") === "1";
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";
    const projects = await fetchProjects(token, accountId, all, activeOnly);
    // Return simplified mapping: id, name, is_active, client
    const simplified = projects.map((p: any) => ({
      id: p?.id,
      name: p?.name,
      is_active: Boolean(p?.is_active),
      client: p?.client?.name || null,
    }));
    return NextResponse.json({ projects: simplified });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

