import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("harvest_token")?.value;
    const accountId = cookieStore.get("harvest_account_id")?.value;
    let connected = Boolean(token);
    let source: string = token ? "cookie" : "none";

    if (!token) {
      const uid = req.nextUrl.searchParams.get("uid") || undefined;
      if (uid) {
        try {
          const { adminDb } = await import("@/lib/firebase-admin");
          const snap = await adminDb.collection("users").doc(uid).get();
          const dbToken = snap.get("harvest.accessToken") as string | undefined;
          const dbAccountId = snap.get("harvest.accountId") as
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
