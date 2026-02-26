import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const cookieStore = await cookies();

    // Clear auth cookies
    try {
      cookieStore.set("microsoft_token", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      cookieStore.set("microsoft_refresh_token", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      cookieStore.set("microsoft_expires_at", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    } catch {}

    if (uid) {
      // Mongo: clear stored tokens
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              uid,
              "microsoft.accessToken": null,
              "microsoft.refreshToken": null,
              "microsoft.expiresAt": null,
              "microsoft.tokenType": null,
              "microsoft.scope": null,
              "microsoft.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to clear Microsoft tokens in Mongo", err);
      }

      // Firestore: best-effort mirror
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          await adminDb.collection("users").doc(uid).set(
            {
              microsoft: {
                accessToken: null,
                refreshToken: null,
                expiresAt: null,
                tokenType: null,
                scope: null,
                updatedAt: Date.now(),
              },
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.error("Failed to clear Microsoft tokens in Firestore", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Microsoft disconnect failed", error);
    return NextResponse.json({ ok: false, error: "disconnect_failed" }, { status: 500 });
  }
}

