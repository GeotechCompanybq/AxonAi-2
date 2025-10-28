import { NextResponse, NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  // Example: protect org mutations by requiring Authorization header
  const url = req.nextUrl.pathname;
  const isOrgMutation = req.method !== "GET" && /\/api\/orgs\//.test(url);
  if (isOrgMutation && !req.headers.get("authorization")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/orgs/:path*"],
};











