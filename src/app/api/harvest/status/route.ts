import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const connRaw = req.nextUrl.searchParams.get("conn") || "";
    const isAlt =
      connRaw.trim().toLowerCase() === "alt" ||
      connRaw.trim().toLowerCase() === "compare" ||
      connRaw.trim().toLowerCase() === "secondary";
    const cookieStore = await cookies();
    const token = cookieStore.get(isAlt ? "harvest_token_alt" : "harvest_token")
      ?.value;
    const accountId = cookieStore.get(
      isAlt ? "harvest_account_id_alt" : "harvest_account_id"
    )?.value;
    let connected = Boolean(token);
    let source: string = token ? "cookie" : "none";

    if (!token) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
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
            connected = true;
            source = "database";
          }
          return NextResponse.json({
            connected,
            source,
            accountId: dbAccountId || null,
          });
        } catch (e) {
          // fallthrough to cookie-based response with error info
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
