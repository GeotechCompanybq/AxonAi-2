import { NextRequest, NextResponse } from "next/server";
import { handleAnalyzeTimeUsage } from "@/lib/actions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tasks = body?.tasks || [];
    const currentDate = body?.currentDate;
    if (!Array.isArray(tasks))
      return NextResponse.json({ error: "Invalid tasks" }, { status: 400 });
    const result = await handleAnalyzeTimeUsage({ tasks, currentDate });
    return NextResponse.json(result);
  } catch (e) {
    console.error("plan-from-tasks error", e);
    return NextResponse.json({ error: "AI planning failed" }, { status: 500 });
  }
}
