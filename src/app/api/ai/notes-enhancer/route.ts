import { NextRequest, NextResponse } from "next/server";
import { enhanceNotes } from "@/ai/flows/notes-enhancer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const notes: string = body?.notes || "";
    const jiraUrl: string | undefined = body?.jiraUrl || undefined;
    const title: string | undefined = body?.title || undefined;
    if (!notes || typeof notes !== "string") {
      return NextResponse.json({ error: "Missing notes" }, { status: 400 });
    }
    const result = await enhanceNotes({ notes, jiraUrl, title });
    return NextResponse.json(result);
  } catch (e) {
    try {
      // Log error for server diagnostics only
      // eslint-disable-next-line no-console
      console.error("notes-enhancer error", e);
    } catch {}
    // Safe fallback: generate a concise comment without AI
    try {
      const { notes, jiraUrl, title } = await req.json();
      const fallback = buildFallbackComment(
        String(notes || ""),
        title,
        jiraUrl
      );
      return NextResponse.json({ comment: fallback });
    } catch {
      return NextResponse.json(
        { error: "Notes enhancement failed" },
        { status: 500 }
      );
    }
  }
}

function buildFallbackComment(
  raw: string,
  title?: string,
  jiraUrl?: string
): string {
  const clean = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const body = sentences.join(" ") || clean.slice(0, 160);
  const shortTitle = (title || inferTitleFromNotes(clean)).trim();
  const suffix = jiraUrl ? ` (${jiraUrl})` : "";
  return `${shortTitle}${suffix} – ${body}`.trim();
}

function inferTitleFromNotes(text: string): string {
  // Take first 6-8 significant words as a title stub
  const words = text
    .replace(/[^\w\s\-:/]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Task Update";
}
