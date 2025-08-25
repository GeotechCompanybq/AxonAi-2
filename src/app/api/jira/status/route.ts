import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("jira_token")?.value;

    if (!token) {
      return NextResponse.json({ connected: false });
    }

    // Validate token by checking user's Jira profile
    const meRes = await fetch("https://api.atlassian.com/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!meRes.ok) {
      // Token is invalid or expired
      return NextResponse.json({ connected: false });
    }

    const me = await meRes.json();
    return NextResponse.json({
      connected: true,
      email: me.email,
      name: me.name,
    });
  } catch (error) {
    console.error("Jira connection status check failed", error);
    return NextResponse.json({ connected: false });
  }
}
