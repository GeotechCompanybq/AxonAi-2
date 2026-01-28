import { NextRequest, NextResponse } from "next/server";
import { handleCreateSchedule } from "@/lib/actions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scheduleDescription } = body;

    if (!scheduleDescription || typeof scheduleDescription !== "string") {
      return NextResponse.json(
        { error: "scheduleDescription is required" },
        { status: 400 }
      );
    }

    const result = await handleCreateSchedule({ scheduleDescription });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Schedule creation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
