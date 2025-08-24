import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatInput } from "@/ai/flows/chat";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatInput;
    if (!body?.messages?.length) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }
    const result = await chat(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
