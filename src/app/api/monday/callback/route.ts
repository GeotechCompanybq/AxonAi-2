import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { appConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state") || undefined;
    // Prefer uid from state; fallback to short-lived cookie set during auth
    const cookieStore = await cookies();
    const uidFromCookie = cookieStore.get("monday_uid")?.value || undefined;
    const uid =
      state
        ?.split("|")
        ?.find((s) => s.startsWith("uid:"))
        ?.slice(4) || uidFromCookie;
    const ret = state
      ?.split("|")
      ?.find((s) => s.startsWith("ret:"))
      ?.slice(4);
    if (!code)
      return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const clientId = process.env.MONDAY_CLIENT_ID!;
    const clientSecret = process.env.MONDAY_CLIENT_SECRET!;
    const computedRedirectUri = new URL(
      appConfig.mondayRedirectPath,
      req.nextUrl.origin
    ).toString();
    const redirectUri = computedRedirectUri;

    const params = new URLSearchParams();
    params.set("code", code);
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
    params.set("redirect_uri", redirectUri);
    params.set("grant_type", "authorization_code");

    const tokenRes = await fetch("https://auth.monday.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("monday token error", {
        tokenJson,
        redirectUriUsed: redirectUri,
      });
      return NextResponse.json(
        { error: "Token exchange failed" },
        { status: 500 }
      );
    }

    // Persist token in an httpOnly cookie for convenience; also store in DB tied to user.
    cookieStore.set("monday_token", tokenJson.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    // Clear the temporary uid cookie
    try {
      cookieStore.set("monday_uid", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 0,
      });
    } catch {}

    // If uid is provided, store token in Mongo (and keep Firestore fallback)
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              uid,
              "monday.accessToken": tokenJson.access_token,
              "monday.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("failed to persist monday token in db", err);
      }
    }

    const dashboard = new URL(ret || "/settings", req.nextUrl.origin);
    return NextResponse.redirect(dashboard);
  } catch (e) {
    console.error("monday callback error", e);
    return NextResponse.json({ error: "Callback failed" }, { status: 500 });
  }
}
