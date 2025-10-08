import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    let token: string | undefined;
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        const doc = await db.collection(users).findOne({ uid });
        token = (doc as any)?.jira?.accessToken as string | undefined;
      } catch {}
    }
    if (!token) token = cookieStore.get("jira_token")?.value;

    // Local UX: consider "connected" if we have any stored token
    if (token) {
      return NextResponse.json({ connected: true });
    }

    return NextResponse.json({ connected: false });
  } catch (error) {
    console.error("Jira connection status check failed", error);
    return NextResponse.json({ connected: false });
  }
}
