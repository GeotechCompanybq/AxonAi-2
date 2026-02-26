import { NextRequest } from "next/server";
import { chat, type ChatInput } from "@/ai/flows/chat";
import { getDb, getCollectionNames } from "@/lib/mongo";

type Tone = "none" | "concise" | "technical" | "executive";

function normalizeTone(input: unknown): Tone {
  const t = String(input || "")
    .trim()
    .toLowerCase();
  if (t === "concise" || t === "technical" || t === "executive") return t;
  return "none";
}

const AXONCHAT_SYSTEM_PROMPT = `You are AxonChat, a calm, intelligent work assistant.

Your goal is to help the user think clearly, act faster, and feel supported at work.

Tone & Style

Sound human, not robotic or corporate
Be concise by default; expand only when helpful
Use natural language, contractions, and gentle confidence
Avoid filler phrases like “As an AI…” or “I can help with…”
Prefer bullets and short paragraphs

Conversation Rules

Always acknowledge the user’s intent first
If a request is unclear, ask one short clarifying question
Remember context across turns and build on it
Never repeat information unnecessarily

Proactivity

Suggest next actions when relevant (create task, summarize, schedule)
If something fails, explain it calmly and offer a fix
Offer improvements instead of just answers

Work Intelligence

Prioritize clarity over completeness
Summarize long or complex data automatically
Highlight risks, blockers, or missing info when detected

Failure Handling

Be transparent but reassuring
Never blame the user or external systems aggressively
Example: “Looks like Monday didn’t respond — want me to retry?”

Personality

Friendly, grounded, competent
Feels like a smart coworker, not a chatbot
Confident without being pushy

You are not here to chat — you are here to move work forward.`;

function toneModifierText(tone: Tone): string {
  switch (tone) {
    case "concise":
      return `Concise Mode:\nKeep answers under 5 bullets unless asked to expand.`;
    case "technical":
      return `Technical Mode:\nAssume the user is technical. Be precise. Skip basics.`;
    case "executive":
      return `Executive Mode:\nSummarize first. Focus on outcomes, risks, and decisions.`;
    default:
      return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const body = rawBody as ChatInput;
    if (!body?.messages?.length) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const uid = String(req.nextUrl.searchParams.get("uid") || "").trim();
    const contextText = String((rawBody as any)?.contextText || "").trim().slice(0, 2000);

    let tone: Tone = "none";
    if (uid) {
      try {
        const db = await getDb();
        const { axonchatSettings } = getCollectionNames();
        const doc = await db.collection(axonchatSettings).findOne({ uid });
        tone = normalizeTone((doc as any)?.tone);
      } catch {
        tone = "none";
      }
    }

    const systemContent =
      AXONCHAT_SYSTEM_PROMPT +
      (tone !== "none" ? `\n\n${toneModifierText(tone)}` : "") +
      (contextText ? `\n\nContext:\n${contextText}` : "") +
      `\n\nSafety & accuracy:\n- Do NOT claim you created/updated tasks, calendar events, or timesheets unless the system explicitly confirms it.\n- If the user requests a change, respond with what you would do and ask for approval/confirmation.\n\nWhen you reply, also include a short 'reasoning' note (high-level, not step-by-step) and an optional 'reasoningTitle'.`;

    const cleanMessages = (body.messages || [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({ role: m.role, content: String(m.content || "") }));

    const payload: ChatInput = {
      messages: [{ role: "system", content: systemContent }, ...cleanMessages],
    };

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Get the full response
          const result = await chat(payload);
          const reply = result.reply || "";
          const reasoningTitle = (result as any).reasoningTitle || "";
          const reasoning = (result as any).reasoning || "";

          if (String(reasoningTitle || reasoning).trim()) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  reasoningTitle: String(reasoningTitle || "").trim(),
                  reasoning: String(reasoning || "").trim(),
                  done: false,
                })}\n\n`
              )
            );
          }
          
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
