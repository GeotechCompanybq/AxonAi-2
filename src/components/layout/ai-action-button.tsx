"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIActionButton() {
  return (
    <div className="md:hidden">
      <Link
        href="/schedule/create"
        className={cn(
          "fixed left-1/2 z-50 -translate-x-1/2",
          "rounded-full px-5 py-3 text-sm font-semibold",
          "bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-600",
          "shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_40px_rgba(0,212,255,0.35)]",
          "text-white",
          "hover:scale-[1.03] active:scale-[0.98] transition-transform duration-200"
        )}
        style={{
          bottom: "max(96px, calc(env(safe-area-inset-bottom) + 72px))",
        }}
      >
        <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <Sparkles className="h-4 w-4" />
        </span>
        Quick Schedule
      </Link>
    </div>
  );
}
