import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeMicrosoftCodeForTokens,
  persistMicrosoftTokensForUser,
  setMicrosoftAuthCookies,
} from "@/lib/microsoft";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state") || undefined;

    const cookieStore = await cookies();
    const uidFromCookie = cookieStore.get("microsoft_uid")?.value || undefined;
    const uid =
      state
        ?.split("|")
        ?.find((s) => s.startsWith("uid:"))
        ?.slice(4) || uidFromCookie;
    const ret = state
      ?.split("|")
      ?.find((s) => s.startsWith("ret:"))
      ?.slice(4);

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const tokens = await exchangeMicrosoftCodeForTokens({ req, code });

    // Persist in httpOnly cookies for convenience
    await setMicrosoftAuthCookies({ tokens });

    // Clear temporary uid cookie
    try {
      cookieStore.set("microsoft_uid", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 0,
      });
    } catch {}

    // Persist in DB keyed to user
    if (uid) {
      await persistMicrosoftTokensForUser({ uid, tokens });
    }

    return NextResponse.redirect(new URL(ret || "/settings", req.nextUrl.origin));
  } catch (e) {
    console.error("Microsoft callback error", e);
    const message = e instanceof Error ? e.message : "Callback failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


