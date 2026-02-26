import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function POST(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const connRaw = req.nextUrl.searchParams.get("conn") || "";
    const isAlt =
      connRaw.trim().toLowerCase() === "alt" ||
      connRaw.trim().toLowerCase() === "compare" ||
      connRaw.trim().toLowerCase() === "secondary";

    const cookieStore = await cookies();

    // Clear Harvest cookies
    const tokenCookieName = isAlt ? "harvest_token_alt" : "harvest_token";
    const accountCookieName = isAlt
      ? "harvest_account_id_alt"
      : "harvest_account_id";

    try {
      cookieStore.set(tokenCookieName, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      cookieStore.set(accountCookieName, "", {
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

        const clearDoc = isAlt
          ? {
              uid,
              "harvestAlt.accessToken": null,
              "harvestAlt.accountId": null,
              "harvestAlt.updatedAt": Date.now(),
            }
          : {
              uid,
              "harvest.accessToken": null,
              "harvest.accountId": null,
              "harvest.updatedAt": Date.now(),
            };

        await db.collection(users).updateOne(
          { uid },
          {
            $set: clearDoc,
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to clear Harvest tokens in Mongo", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Harvest disconnect failed", error);
    return NextResponse.json({ ok: false, error: "disconnect_failed" }, { status: 500 });
  }
}

