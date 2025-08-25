import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const uid = searchParams.get("uid") || undefined;
    if (!code)
      return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const clientId = process.env.MONDAY_CLIENT_ID!;
    const clientSecret = process.env.MONDAY_CLIENT_SECRET!;
    const computedRedirectUri = new URL(
      "/api/monday/callback",
      req.nextUrl.origin
    ).toString();
    const redirectUri = process.env.MONDAY_REDIRECT_URI || computedRedirectUri;

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

    // Persist token in an httpOnly cookie (simple demo). For production use a DB tied to user id.
    const cookieStore = await cookies();
    cookieStore.set("monday_token", tokenJson.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    const dashboard = new URL("/settings", req.nextUrl.origin);
    return NextResponse.redirect(dashboard);
  } catch (e) {
    console.error("monday callback error", e);
    return NextResponse.json({ error: "Callback failed" }, { status: 500 });
  }
}
