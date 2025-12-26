import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

async function getHarvestAuth(
  req: NextRequest
): Promise<
  { token: string; accountId: string } | { error: string; status: number }
> {
  const connRaw = req.nextUrl.searchParams.get("conn") || "";
  const isAlt =
    connRaw.trim().toLowerCase() === "alt" ||
    connRaw.trim().toLowerCase() === "compare" ||
    connRaw.trim().toLowerCase() === "secondary";
  const cookieStore = await cookies();
  let token = cookieStore.get(isAlt ? "harvest_token_alt" : "harvest_token")
    ?.value;
  let accountId = cookieStore.get(
    isAlt ? "harvest_account_id_alt" : "harvest_account_id"
  )?.value;
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
        cookieStore2.set(
          isAlt ? "harvest_account_id_alt" : "harvest_account_id",
          accountId,
          {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        }
        );
        // Persist resolved account id to DB for consistency
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
          // Also mirror to Firestore if available (best-effort)
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            if (isAlt) {
              await adminDb
                .collection("users")
                .doc(uid)
                .set({ harvestAlt: { accountId } }, { merge: true });
            } else {
              await adminDb
                .collection("users")
                .doc(uid)
                .set({ harvest: { accountId } }, { merge: true });
            }
          } catch {}
        }
      }
    } catch {}
  }
  if (!accountId)
    return { error: "Missing Harvest account id", status: 400 } as const;
  return { token, accountId } as const;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const auth = await getHarvestAuth(req);
    if ("error" in auth)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const body = await req.json();
    const res = await fetch(
      `https://api.harvestapp.com/v2/time_entries/${id}`,
      {
        method: "PATCH",
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
      }
    );
    const json = await res.json();
    if (!res.ok) return NextResponse.json(json, { status: res.status });
    return NextResponse.json(json);
  } catch (e) {
    console.error("harvest update time entry error", e);
    const message =
      e instanceof Error ? e.message : "Failed to update time entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const auth = await getHarvestAuth(req);
    if ("error" in auth)
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { token, accountId } = auth;

    const res = await fetch(
      `https://api.harvestapp.com/v2/time_entries/${id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Harvest-Account-Id": accountId,
          "User-Agent":
            process.env.HARVEST_USER_AGENT ||
            "AxonAI (support@geotechcompany.us)",
          Accept: "application/json",
        },
      }
    );
    if (res.status === 200 || res.status === 204) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const text = await res.text();
    return NextResponse.json(
      { error: text || "Delete failed" },
      { status: res.status }
    );
  } catch (e) {
    console.error("harvest delete time entry error", e);
    const message =
      e instanceof Error ? e.message : "Failed to delete time entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
