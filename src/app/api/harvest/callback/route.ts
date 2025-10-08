import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, getCollectionNames } from "@/lib/mongo";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state") || undefined;
    const uid = state
      ?.split("|")
      ?.find((s) => s.startsWith("uid:"))
      ?.slice(4);
    const ret = state
      ?.split("|")
      ?.find((s) => s.startsWith("ret:"))
      ?.slice(4);

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    const clientId = process.env.HARVEST_CLIENT_ID!;
    const clientSecret = process.env.HARVEST_CLIENT_SECRET!;
    const redirectUri =
      process.env.HARVEST_REDIRECT_URI ||
      new URL("/api/harvest/callback", req.nextUrl.origin).toString();

    // Exchange code for access token at Harvest
    const params = new URLSearchParams();
    params.set("code", code);
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
    params.set("redirect_uri", redirectUri);
    params.set("grant_type", "authorization_code");

    const tokenRes = await fetch(
      "https://id.getharvest.com/api/v2/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Harvest token exchange error", { tokenJson, redirectUri });
      return NextResponse.json(
        { error: "Token exchange failed" },
        { status: 500 }
      );
    }

    // Persist token and required headers in httpOnly cookies
    const cookieStore = await cookies();
    cookieStore.set("harvest_token", tokenJson.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: tokenJson.expires_in || 60 * 60 * 24 * 30,
    });
    // Fetch accounts to determine the account id (OAuth token alone doesn't include it reliably)
    let accountId: string | undefined;
    try {
      const accountsRes = await fetch(
        "https://id.getharvest.com/api/v2/accounts",
        {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            Accept: "application/json",
          },
        }
      );
      const accountsJson = await accountsRes.json();
      const first = Array.isArray(accountsJson?.accounts)
        ? accountsJson.accounts[0]
        : undefined;
      if (first?.id) {
        accountId = String(first.id);
        cookieStore.set("harvest_account_id", accountId, {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
    } catch (e) {
      // Ignore; a later API call can attempt to resolve account id lazily
    }

    // Optionally persist in Mongo when uid is present
    if (uid) {
      try {
        const db = await getDb();
        const { users } = getCollectionNames();
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              uid,
              "harvest.accessToken": tokenJson.access_token,
              "harvest.refreshToken": tokenJson.refresh_token,
              "harvest.accountId": accountId || null,
              "harvest.tokenType": tokenJson.token_type || "Bearer",
              "harvest.updatedAt": Date.now(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist Harvest token in DB", err);
      }
    }

    const returnTo = ret || "/settings";
    return NextResponse.redirect(new URL(returnTo, req.nextUrl.origin));
  } catch (e) {
    console.error("Harvest callback error", e);
    return NextResponse.json(
      { error: "Callback processing failed" },
      { status: 500 }
    );
  }
}
