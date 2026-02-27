import { NextRequest, NextResponse } from "next/server";
import { teamsBotAdapter, handleTeamsTurn } from "@/lib/teams-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";

    await teamsBotAdapter.processActivity(authHeader, body, async (context) => {
      await handleTeamsTurn(context);
    });

    // Bot Framework expects 200/202; response body is not required for Teams.
    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error("Teams bot error", e);
    const message = e instanceof Error ? e.message : "Bot error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

