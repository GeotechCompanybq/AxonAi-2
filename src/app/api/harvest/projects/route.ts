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
  // Harvest API typically limits to 100 per page, so use 100 for consistency
  url.searchParams.set("per_page", "100");
  
  if (!all) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
        Accept: "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return (Array.isArray(json?.projects) ? json.projects : []) as any[];
  }
  
  // Paginate through all pages - Harvest API uses cursor-based pagination (links.next) or page-based
  const out: any[] = [];
  let nextUrl: string | null = url.toString();
  let pageCount = 0;
  const perPage = 100;
  const maxPages = 1000; // Safety limit
  
  while (nextUrl && pageCount < maxPages) {
    pageCount++;
    
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
        Accept: "application/json",
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    
    const projects = Array.isArray(json?.projects) ? json.projects : [];
    out.push(...projects);
    
    // Check for next page: prefer links.next (cursor-based), then next_page (page-based)
    const links = json?.links as any;
    const nextPageNum = (json as any)?.next_page as number | undefined;
    const totalPages = (json as any)?.total_pages as number | undefined;
    
    if (links?.next) {
      // Use cursor-based pagination (preferred)
      nextUrl = links.next;
    } else if (nextPageNum) {
      // Use page-based pagination
      const pageUrl = new URL(url.toString());
      pageUrl.searchParams.set("page", String(nextPageNum));
      nextUrl = pageUrl.toString();
    } else if (totalPages) {
      // Extract current page from URL and increment
      const currentUrl = new URL(nextUrl);
      const currentPage = parseInt(currentUrl.searchParams.get("page") || "1", 10);
      if (currentPage < totalPages) {
        const pageUrl = new URL(url.toString());
        pageUrl.searchParams.set("page", String(currentPage + 1));
        nextUrl = pageUrl.toString();
      } else {
        nextUrl = null;
      }
    } else {
      // Fallback: if we got a full page (100 items), there might be more
      // If we got fewer than 100, we're definitely on the last page
      if (projects.length === perPage) {
        // Try to increment page number
        const currentUrl = new URL(nextUrl);
        const currentPage = parseInt(currentUrl.searchParams.get("page") || "1", 10);
        const pageUrl = new URL(url.toString());
        pageUrl.searchParams.set("page", String(currentPage + 1));
        nextUrl = pageUrl.toString();
      } else {
        nextUrl = null;
      }
    }
  }
  
  if (pageCount >= maxPages) {
    console.warn("Harvest projects pagination reached safety limit");
  }
  
  return out;
}

async function listAccounts(token: string): Promise<string[]> {
  const res = await fetch("https://id.getharvest.com/api/v2/accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      (json as any)?.error_description ||
        (json as any)?.error ||
        JSON.stringify(json)
    );
  }
  const ids = Array.isArray(json?.accounts) ? json.accounts.map((a: any) => String(a?.id)).filter(Boolean) : [];
  return ids;
}

async function probeAccount(token: string, accountId: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.harvestapp.com/v2/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": process.env.HARVEST_USER_AGENT || "AxonAI (support@geotechcompany.us)",
        Accept: "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isHarvestAuthErrorMessage(message: string): boolean {
  const msg = String(message || "");
  const lower = msg.toLowerCase();
  // Common Harvest shapes are JSON: { code: "not_authorized", message: "...", ... }
  try {
    const parsed = JSON.parse(msg);
    const code = String((parsed as any)?.code || (parsed as any)?.error || "");
    const status = Number((parsed as any)?.status || (parsed as any)?.http_status);
    const parsedLower = JSON.stringify(parsed).toLowerCase();
    return (
      status === 401 ||
      status === 403 ||
      code.toLowerCase() === "not_authorized" ||
      parsedLower.includes("not authorized") ||
      parsedLower.includes("not_authorized") ||
      parsedLower.includes("\"status\":401") ||
      parsedLower.includes("\"status\":403")
    );
  } catch {
    return (
      lower.includes("not authorized") ||
      lower.includes("not_authorized") ||
      lower.includes("401") ||
      lower.includes("403")
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getHarvestAuth(req);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const all = req.nextUrl.searchParams.get("all") === "1";
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";
    const connRaw = (req.nextUrl.searchParams.get("conn") || "").trim().toLowerCase();
    const isAlt = connRaw === "alt" || connRaw === "compare" || connRaw === "secondary";
    const accountCookieKey = isAlt ? "harvest_account_id_alt" : "harvest_account_id";
    let projects: any[] = [];
    try {
      projects = await fetchProjects(token, accountId, all, activeOnly);
    } catch (e: any) {
      const msg = String(e?.message || "");
      // Handle "Not authorized" by probing all accessible accounts and persisting the working one
      if (isHarvestAuthErrorMessage(msg)) {
        const ids = await listAccounts(token);
        const cookieStore2 = await cookies();
        const uid = req.nextUrl.searchParams.get("uid") || undefined;
        let chosen: string | null = null;

        for (const id of ids) {
          // Try the cheapest probe first
          const ok = await probeAccount(token, id);
          if (!ok) continue;
          chosen = id;
          break;
        }

        // If /users/me probe is blocked for some reason, try fetching a small projects page per account
        if (!chosen) {
          for (const id of ids) {
            try {
              const test = await fetchProjects(token, id, false, activeOnly);
              if (Array.isArray(test)) {
                chosen = id;
                break;
              }
            } catch {}
          }
        }

        if (!chosen) {
          return NextResponse.json(
            { error: "Not authorized (Harvest account mismatch). Reconnect Grayquarter Harvest." },
            { status: 403 }
          );
        }

        // Persist cookie ONLY for the connection slot we are querying
        cookieStore2.set(accountCookieKey, chosen, {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });

        // Persist to DB/Firestore if uid present
        if (uid) {
          try {
            const db = await getDb();
            const { users } = getCollectionNames();
            const field = isAlt ? "harvestAlt.accountId" : "harvest.accountId";
            await db.collection(users).updateOne(
              { uid },
              { $set: { uid, [field]: chosen } as any },
              { upsert: true }
            );
          } catch {}
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            if (isAlt) {
              await adminDb
                .collection("users")
                .doc(uid)
                .set({ harvestAlt: { accountId: chosen } }, { merge: true });
            } else {
              await adminDb
                .collection("users")
                .doc(uid)
                .set({ harvest: { accountId: chosen } }, { merge: true });
            }
          } catch {}
        }

        // Retry with the chosen account id
        projects = await fetchProjects(token, chosen, all, activeOnly);
      } else {
        throw e;
      }
    }
    // Return simplified mapping: id, name, is_active, is_billable, client
    const simplified = projects.map((p: any) => ({
      id: p?.id,
      name: p?.name,
      is_active: Boolean(p?.is_active),
      is_billable: Boolean(p?.is_billable),
      client: p?.client?.name || null,
    }));
    return NextResponse.json({ projects: simplified });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

