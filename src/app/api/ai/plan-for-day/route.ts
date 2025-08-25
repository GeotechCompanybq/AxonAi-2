import { NextRequest, NextResponse } from "next/server";
import { handleCreateSchedule } from "@/lib/actions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tasks: Array<{ name: string; description?: string }> =
      body?.tasks || [];
    const currentDate: string | undefined = body?.currentDate;
    if (!Array.isArray(tasks)) {
      return NextResponse.json({ error: "Invalid tasks" }, { status: 400 });
    }
    const dateStr = currentDate || new Date().toISOString().slice(0, 10);
    const scheduleDescription = `Plan my day (${dateStr}) using these tasks. Prioritize high urgency, fit within 8 hours, and include short breaks. Tasks: ${tasks
      .map((t) => t.name)
      .join(", ")}.`;
    const result = await handleCreateSchedule({ scheduleDescription });
    return NextResponse.json(result);
  } catch (e) {
    console.error("plan-for-day error", e);
    return NextResponse.json({ error: "Day planning failed" }, { status: 500 });
  }
}
