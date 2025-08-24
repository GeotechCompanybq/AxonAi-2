"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Mic, Paperclip } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "assistant" | "user"; content: string };

export function FloatingChatBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I’m Axon. I can create schedules, analyze your week, and keep you focused.",
        },
      ]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  const quickPrompts = [
    "Create my schedule",
    "What's due today?",
    "Analyze my week",
    "Suggest breaks",
  ];

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: trimmed }],
        }),
      });
      if (!res.ok) throw new Error("request_failed");
      const data = (await res.json()) as { reply: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, I couldn’t reach the AI right now.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <Button
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-50 md:bottom-8 md:right-8 right-4 group",
          "rounded-full h-12 w-12 p-0",
          "bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-600 text-white",
          "shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_40px_rgba(0,212,255,0.35)]",
          "hover:scale-[1.05] active:scale-[0.98] transition-transform"
        )}
        style={{
          bottom: "max(84px, calc(env(safe-area-inset-bottom) + 64px))",
        }}
      >
        <span className="absolute -z-10 inline-block h-12 w-12 rounded-full bg-cyan-400/40 blur-xl transition-opacity group-hover:opacity-80" />
        <Bot className="h-5 w-5" />
      </Button>

      {/* Chat panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "w-[min(92vw,28rem)] md:w-[28rem] border-white/10",
            "bg-background/70 backdrop-blur-xl"
          )}
        >
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(0,212,255,0.35)]">
                <Bot className="h-4 w-4" />
              </div>
              <div className="text-left">
                <SheetTitle>Axon Assistant</SheetTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                  Online
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Quick prompts */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {quickPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInput(p)}
                className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-xs text-foreground shadow hover:bg-background/60"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-3 flex h-[72vh] flex-col md:h-[70vh]">
            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-auto rounded-xl border border-white/10 bg-background/40 p-3"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 text-foreground border border-white/10"
                        : "bg-background/70 text-foreground border border-white/10"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-background/60 px-2 border border-white/10">
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground" />
                    <span className="size-1.5 animate-bounce rounded-full bg-foreground [animation-delay:0.2s]" />
                  </span>
                  Axon is typing...
                </div>
              )}
            </div>
            <form
              className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-background/60 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Attach</span>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Axon to plan, schedule, or analyze..."
                className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Mic className="h-4 w-4" />
                <span className="sr-only">Voice</span>
              </button>
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
