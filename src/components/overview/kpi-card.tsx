"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  changePct,
  icon: Icon,
  sparkline,
  href,
}: {
  label: string;
  value: string;
  changePct: number;
  icon: LucideIcon;
  sparkline: Array<{ v: number }>;
  href?: string;
}) {
  const up = changePct >= 0;
  const content = (
    <>
      {/* subtle gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_20%_10%,hsl(var(--ring)/0.20),transparent_55%)]"
      />

      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {value}
            </div>
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                up
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-rose-500/10 text-rose-300"
              )}
            >
              {up ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(changePct).toFixed(1)}%
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/30 shadow-sm ring-1 ring-white/10">
              <Icon className="h-5 w-5 text-foreground/90" />
            </div>
            {href && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="mt-4 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line
                type="monotone"
                dataKey="v"
                stroke="hsl(var(--ring))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </>
  );

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border-border/50 bg-card/60 shadow-[0_14px_40px_rgba(0,0,0,0.35)]",
        href &&
          "transition-shadow hover:shadow-[0_18px_50px_rgba(0,0,0,0.4)] hover:border-primary/30"
      )}
    >
      {href ? (
        <Link href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl">
          {content}
        </Link>
      ) : (
        content
      )}
    </Card>
  );
}


