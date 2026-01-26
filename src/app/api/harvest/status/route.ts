import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

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
    
    // If we found tokens in cookies, also save them to DB for persistence
    if (token && accountId) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        // Save to database in background (don't wait for it)
        (async () => {
          try {
            const { getDb, getCollectionNames } = await import("@/lib/mongo");
            const db = await getDb();
            const { users } = getCollectionNames();
            const isAltConn = isAlt;
            const docSet = isAltConn
              ? {
                  uid,
                  "harvestAlt.accessToken": token,
                  "harvestAlt.accountId": accountId,
                  "harvestAlt.updatedAt": Date.now(),
                }
              : {
                  uid,
                  "harvest.accessToken": token,
                  "harvest.accountId": accountId,
                  "harvest.updatedAt": Date.now(),
                };
            await db.collection(users).updateOne(
              { uid },
              { $set: docSet },
              { upsert: true }
            );
            console.log(`[Harvest Status] Synced cookie tokens to MongoDB for uid: ${uid}`);
          } catch (e) {
            console.error("[Harvest Status] Failed to sync tokens to DB:", e);
          }
        })();
      }
    }

    if (!token) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        // Check MongoDB first (matching projects endpoint logic)
        try {
          const { getDb, getCollectionNames } = await import("@/lib/mongo");
          const db = await getDb();
          const { users } = getCollectionNames();
          const doc = await db.collection(users).findOne({ uid });
          
          if (doc) {
            // Try both dot notation and nested object access
            const harvestData = isAlt ? (doc as any)?.harvestAlt : (doc as any)?.harvest;
            token = harvestData?.accessToken as string | undefined;
            accountId = harvestData?.accountId as string | undefined;
            
            // Also try direct dot notation access (in case it was saved differently)
            if (!token && (doc as any)?.[isAlt ? "harvestAlt.accessToken" : "harvest.accessToken"]) {
              token = (doc as any)[isAlt ? "harvestAlt.accessToken" : "harvest.accessToken"] as string | undefined;
              accountId = (doc as any)[isAlt ? "harvestAlt.accountId" : "harvest.accountId"] as string | undefined;
            }
            
            if (token) {
              connected = true;
              source = "mongodb";
              console.log(`[Harvest Status] Found token in MongoDB for uid: ${uid}`);
            } else {
              console.log(`[Harvest Status] No token found in MongoDB for uid: ${uid}`, {
                hasDoc: !!doc,
                hasHarvest: !!(doc as any)?.harvest,
                hasHarvestAlt: !!(doc as any)?.harvestAlt,
                docKeys: doc ? Object.keys(doc) : [],
              });
            }
          } else {
            console.log(`[Harvest Status] No user document found in MongoDB for uid: ${uid}`);
          }
        } catch (e) {
          console.error("[Harvest Status] MongoDB check failed:", e);
        }
        // Fallback to Firestore if not found in MongoDB
        if (!token) {
          try {
            const { adminDb } = await import("@/lib/firebase-admin");
            const snap = await adminDb.collection("users").doc(uid).get();
            if (snap.exists) {
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
                console.log(`[Harvest Status] Found token in Firestore for uid: ${uid}`);
              } else {
                console.log(`[Harvest Status] No token found in Firestore for uid: ${uid}`);
              }
            } else {
              console.log(`[Harvest Status] No user document found in Firestore for uid: ${uid}`);
            }
          } catch (e) {
            console.error("[Harvest Status] Firestore check failed:", e);
          }
        }
      } else {
        console.log("[Harvest Status] No uid provided in request");
      }
    } else {
      console.log("[Harvest Status] Found token in cookies");
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
