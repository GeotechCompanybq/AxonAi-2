import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function POST(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const cookieStore = await cookies();

    // Clear monday cookie
    try {
      cookieStore.set("monday_token", "", {
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
              "monday.accessToken": null,
              "monday.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to clear Monday tokens in Mongo", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Monday disconnect failed", error);
    return NextResponse.json({ ok: false, error: "disconnect_failed" }, { status: 500 });
  }
}

