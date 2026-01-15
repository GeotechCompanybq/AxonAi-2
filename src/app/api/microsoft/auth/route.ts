import { NextRequest, NextResponse } from "next/server";
import { buildMicrosoftAuthorizeUrl, getMicrosoftClientSecret } from "@/lib/microsoft";

export async function GET(req: NextRequest) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Missing MICROSOFT_CLIENT_ID" },
      { status: 500 }
    );
  }
  try {
    // Validate early so misconfig shows up before user gets redirected to Microsoft.
    getMicrosoftClientSecret();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid MICROSOFT_CLIENT_SECRET";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const uid = req.nextUrl.searchParams.get("uid") || undefined;
  const returnTo = req.nextUrl.searchParams.get("returnTo") || undefined;

  const stateParts = [uid ? `uid:${uid}` : null, returnTo ? `ret:${returnTo}` : null]
    .filter(Boolean)
    .slice(0, 4);
  const state =
    stateParts.length > 0 ? stateParts.join("|") : "microsoft_oauth_state";

  const url = buildMicrosoftAuthorizeUrl({ req, state });
  const res = NextResponse.redirect(url);
  // uid fallback cookie in case provider drops state
  if (uid) {
    try {
      res.cookies.set("microsoft_uid", uid, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 10,
      });
    } catch {}
  }
  return res;
}


