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
        token = (doc as any)?.monday?.accessToken as string | undefined;
      } catch {}
    }
    if (!token) token = cookieStore.get("monday_token")?.value;
    if (!token) return NextResponse.json({ connected: false });
    // Light validation: fetch the current user from Monday
    const query = `query { me { id } }`;
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json?.errors) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({ connected: true });
  } catch (e) {
    return NextResponse.json({ connected: false });
  }
}
