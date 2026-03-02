"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { addDays, format, formatDistanceToNow, parseISO } from "date-fns";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Gauge,
  ListChecks,
  ListTodo,
  Timer,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DateRangePicker } from "@/components/overview/date-range-picker";
import { KpiCard } from "@/components/overview/kpi-card";
import { buildOverviewKpis } from "@/components/overview/metrics";

import { EfficiencyScore } from "@/components/analytics/efficiency-score";
import { BurnoutPredictor } from "@/components/analytics/burnout-predictor";
import { NeededHours } from "@/components/analytics/needed-hours";
import { ProgressPieChart } from "@/components/analytics/progress-chart";
import { TimeUsageChart } from "@/components/analytics/time-usage-chart";
import { IntegrationSummary } from "@/components/overview/integration-summary";
import type { Task } from "@/types";

export function OverviewPage() {
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: addDays(new Date(), -13),
    to: new Date(),
  });
  type TaskSummary = {
    openCount: number;
    overdueCount: number;
    dueSoonCount: number;
    doneCount: number;
    totalCount: number;
    overdueTasks: Task[];
    dueSoonTasks: Task[];
  };
  const [kpiState, setKpiState] = React.useState<
    | { status: "loading" }
    | { status: "ready"; kpis: any[]; harvestConnected: boolean; taskSummary: TaskSummary }
    | { status: "error"; message: string }
  >({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setKpiState({ status: "loading" });
        const data = await buildOverviewKpis(range);
        if (cancelled) return;
        if (!data) {
          setKpiState({ status: "error", message: "Pick a valid date range." });
          return;
        }
        setKpiState({
          status: "ready",
          kpis: data.kpis,
          harvestConnected: data.harvestConnected,
          taskSummary: data.taskSummary,
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load KPIs";
        setKpiState({ status: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range?.from?.getTime(), range?.to?.getTime()]);

  return (
    <section>
      <div
        className={cn(
          "rounded-[28px] border border-border/50 bg-card/60 shadow-[0_20px_70px_rgba(0,0,0,0.35)]",
          "backdrop-blur-xl"
        )}
      >
        {/* Header */}
        <div className="px-5 pt-5 md:px-8 md:pt-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                Dashboard <span className="mx-1">/</span>{" "}
                <span className="text-foreground/80">Overview</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Overview
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                A high-level view of progress, time usage, and AI insights.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker value={range} onChange={setRange} />
              <Button variant="outline" className="rounded-xl gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
              <Button variant="outline" className="rounded-xl gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <Separator className="my-6 bg-border/60" />
        </div>

        {/* Integrations + Task summary strip + KPI strip */}
        <div className="px-5 md:px-8 space-y-6">
          <IntegrationSummary mode="personal" />

          {/* Interactive task summary: Open | Overdue | Due soon | Completed */}
          {kpiState.status === "ready" && kpiState.taskSummary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link
                href="/tasks?status=todo"
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-muted/40 hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  <ListTodo className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Open tasks
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {kpiState.taskSummary.openCount}
                  </p>
                </div>
              </Link>
              <Link
                href="/tasks?overdue=1"
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-destructive/10 hover:border-destructive/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Overdue
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {kpiState.taskSummary.overdueCount}
                  </p>
                </div>
              </Link>
              <Link
                href="/tasks?dueSoon=1"
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-amber-500/10 hover:border-amber-500/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Due in 7 days
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {kpiState.taskSummary.dueSoonCount}
                  </p>
                </div>
              </Link>
              <Link
                href="/tasks?status=done"
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Completed
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {kpiState.taskSummary.doneCount}
                  </p>
                </div>
              </Link>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpiState.status === "ready" ? (
              kpiState.kpis.map((kpi, i) => {
                const icon =
                  kpi.key === "overdue"
                    ? AlertCircle
                    : kpi.key === "due_soon"
                      ? Clock
                      : kpi.key === "tasks_done"
                        ? ListChecks
                        : kpi.key === "tasks_open"
                          ? ListTodo
                          : Timer;
                return (
                  <KpiCard
                    key={kpi.key}
                    label={kpi.label}
                    value={kpi.value}
                    changePct={kpi.changePct}
                    icon={icon}
                    sparkline={kpi.sparkline}
                    href={kpi.href}
                  />
                );
              })
            ) : kpiState.status === "error" ? (
              <div className="col-span-full rounded-2xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                {kpiState.message}
              </div>
            ) : (
              <div className="col-span-full grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[150px] rounded-2xl border border-border/50 bg-card/40 animate-pulse"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Overdue & due soon task list */}
          {kpiState.status === "ready" &&
            kpiState.taskSummary &&
            (kpiState.taskSummary.overdueTasks.length > 0 ||
              kpiState.taskSummary.dueSoonTasks.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {kpiState.taskSummary.overdueTasks.length > 0 && (
                  <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Overdue ({kpiState.taskSummary.overdueTasks.length})
                      </h3>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/tasks?overdue=1">View all</Link>
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {kpiState.taskSummary.overdueTasks.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          <Link
                            href="/tasks"
                            className="block rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                          >
                            <span className="font-medium">{t.name}</span>
                            {t.dueDate && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                due {format(parseISO(t.dueDate.slice(0, 10)), "MMM d")} (
                                {formatDistanceToNow(parseISO(t.dueDate.slice(0, 10)), {
                                  addSuffix: true,
                                })}
                                )
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {kpiState.taskSummary.dueSoonTasks.length > 0 && (
                  <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="h-4 w-4" />
                        Due in 7 days ({kpiState.taskSummary.dueSoonTasks.length})
                      </h3>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/tasks?dueSoon=1">View all</Link>
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {kpiState.taskSummary.dueSoonTasks.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          <Link
                            href="/tasks"
                            className="block rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 hover:border-border"
                          >
                            <span className="font-medium">{t.name}</span>
                            {t.dueDate && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                due {format(parseISO(t.dueDate.slice(0, 10)), "MMM d")}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Charts */}
        <div className="px-5 pb-6 pt-6 md:px-8 md:pb-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <TimeUsageChart />
            <ProgressPieChart />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <EfficiencyScore />
            </div>
            <div className="lg:col-span-1">
              <BurnoutPredictor />
            </div>
            <div className="lg:col-span-1">
              <NeededHours />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


