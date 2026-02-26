import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function POST(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const cookieStore = await cookies();

    // Clear Jira cookie
    try {
      cookieStore.set("jira_token", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    } catch {}

    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              uid,
              "jira.accessToken": null,
              "jira.refreshToken": null,
              "jira.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to clear Jira tokens in Mongo", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Jira disconnect failed", error);
    return NextResponse.json({ ok: false, error: "disconnect_failed" }, { status: 500 });
  }
}

