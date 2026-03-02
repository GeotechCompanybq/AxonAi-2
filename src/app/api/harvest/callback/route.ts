import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const connRaw = state
      ?.split("|")
      ?.find((s) => s.startsWith("conn:"))
      ?.slice(5);
    const conn = (connRaw || "").trim().toLowerCase() || "primary";

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    const clientId = process.env.HARVEST_CLIENT_ID;
    const clientSecret = process.env.HARVEST_CLIENT_SECRET;
    const redirectUri = new URL(
      appConfig.harvestRedirectPath,
      req.nextUrl.origin
    ).toString();

    if (!clientId || !clientSecret) {
      console.error("Harvest callback missing env", {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        origin: req.nextUrl.origin,
        redirectUri,
      });
      return NextResponse.json(
        { error: "Missing HARVEST_CLIENT_ID / HARVEST_CLIENT_SECRET" },
        { status: 500 }
      );
    }

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
    const tokenJson = await tokenRes.json().catch(() => ({} as any));
    if (!tokenRes.ok) {
      console.error("Harvest token exchange error", { tokenJson, redirectUri });
      return NextResponse.json(
        {
          error: "Token exchange failed",
          details: (tokenJson as any)?.error_description || (tokenJson as any)?.error || tokenJson,
        },
        { status: 502 }
      );
    }

    // Persist token and required headers in httpOnly cookies
    const cookieStore = await cookies();
    const tokenCookieKey =
      conn === "alt" || conn === "compare" || conn === "secondary"
        ? "harvest_token_alt"
        : "harvest_token";
    const accountCookieKey =
      conn === "alt" || conn === "compare" || conn === "secondary"
        ? "harvest_account_id_alt"
        : "harvest_account_id";
    cookieStore.set(tokenCookieKey, tokenJson.access_token, {
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
        cookieStore.set(accountCookieKey, accountId, {
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
        const { getDb, getCollectionNames } = await import("@/lib/mongo");
        const db = await getDb();
        const { users } = getCollectionNames();
        const isAlt =
          conn === "alt" || conn === "compare" || conn === "secondary";
        const docSet = isAlt
          ? {
              uid,
              "harvestAlt.accessToken": tokenJson.access_token,
              "harvestAlt.refreshToken": tokenJson.refresh_token,
              "harvestAlt.accountId": accountId || null,
              "harvestAlt.tokenType": tokenJson.token_type || "Bearer",
              "harvestAlt.updatedAt": Date.now(),
            }
          : {
              uid,
              "harvest.accessToken": tokenJson.access_token,
              "harvest.refreshToken": tokenJson.refresh_token,
              "harvest.accountId": accountId || null,
              "harvest.tokenType": tokenJson.token_type || "Bearer",
              "harvest.updatedAt": Date.now(),
            };
        await db.collection(users).updateOne(
          { uid },
          {
            $set: {
              ...docSet,
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
