import { NextRequest } from "next/server";
import { chat, type ChatInput } from "@/ai/flows/chat";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatInput;
    if (!body?.messages?.length) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Get the full response
          const result = await chat(body);
          const reply = result.reply || "";
          
          // Stream the response character by character for real-time effect
          for (let i = 0; i < reply.length; i++) {
            const chunk = reply[i];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`));
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Send completion
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "", done: true })}\n\n`));
          controller.close();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Chat failed";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg, done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
