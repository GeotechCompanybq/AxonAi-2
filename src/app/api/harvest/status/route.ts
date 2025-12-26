import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
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
    let connected = Boolean(token);
    let source: string = token ? "cookie" : "none";

    if (!token) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        // Check MongoDB first (matching projects endpoint logic)
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
          if (token) {
            connected = true;
            source = "mongodb";
          }
        } catch {}
        // Fallback to Firestore if not found in MongoDB
        if (!token) {
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            const snap = await adminDb.collection("users").doc(uid).get();
            const dbToken = (isAlt
              ? snap.get("harvestAlt.accessToken")
              : snap.get("harvest.accessToken")) as string | undefined;
            const dbAccountId = (isAlt
              ? snap.get("harvestAlt.accountId")
              : snap.get("harvest.accountId")) as
              | string
              | undefined;
            if (dbToken) {
              token = dbToken;
              accountId = accountId || dbAccountId;
              connected = true;
              source = "firestore";
            }
          } catch (e) {
            // fallthrough to cookie-based response with error info
          }
        }
      }
    }

    return NextResponse.json({
      connected,
      source,
      accountId: accountId || null,
    });
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: "status_failed" },
      { status: 500 }
    );
  }
}
