import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state") || undefined;

    // Extract user ID from state if provided
    const uid = state?.startsWith("uid:") ? state.slice(4) : undefined;

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    // Jira token exchange endpoint
    const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: process.env.JIRA_REDIRECT_URI,
      }),
    });

    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Jira token exchange error", { tokenJson });
      return NextResponse.json(
        { error: "Token exchange failed" },
        { status: 500 }
      );
    }

    // If user ID is provided, store token in Mongo
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              uid,
              "jira.accessToken": tokenJson.access_token,
              "jira.refreshToken": tokenJson.refresh_token,
              "jira.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist Jira token in DB", err);
      }
    }

    // Redirect to settings page
    const settingsPage = new URL("/settings", req.nextUrl.origin);
    const res = NextResponse.redirect(settingsPage);
    const secureCookie =
      req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
    res.cookies.set("jira_token", tokenJson.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: Number(tokenJson.expires_in || 60 * 60 * 24 * 30), // default 30 days
    });
    return res;
  } catch (e) {
    console.error("Jira callback error", e);
    return NextResponse.json(
      { error: "Callback processing failed" },
      { status: 500 }
    );
  }
}
