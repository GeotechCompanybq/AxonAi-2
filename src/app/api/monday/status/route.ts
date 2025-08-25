import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("monday_token")?.value;
    if (!token) {
      return NextResponse.json({ connected: false });
    }
    // Light validation: fetch the current user from Monday
    const query = `query { me { id } }`;
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json?.errors) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({ connected: true });
  } catch (e) {
    return NextResponse.json({ connected: false });
  }
}
