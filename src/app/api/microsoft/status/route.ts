import { NextRequest, NextResponse } from "next/server";
import { loadMicrosoftTokensForUser } from "@/lib/microsoft";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid") || undefined;
    const tokens = await loadMicrosoftTokensForUser({ req, uid });
    return NextResponse.json({ connected: Boolean(tokens?.accessToken) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}


