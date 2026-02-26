"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { addDays } from "date-fns";
import {
  Download,
  Filter,
  Gauge,
  ListChecks,
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

export function OverviewPage() {
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: addDays(new Date(), -13),
    to: new Date(),
  });
  const [kpiState, setKpiState] = React.useState<
    | { status: "loading" }
    | { status: "ready"; kpis: any[]; harvestConnected: boolean }
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

        {/* Integrations + KPI strip */}
        <div className="px-5 md:px-8 space-y-4">
          <IntegrationSummary mode="personal" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiState.status === "ready" ? (
              <>
                <KpiCard
                  label={kpiState.kpis[0].label}
                  value={kpiState.kpis[0].value}
                  changePct={kpiState.kpis[0].changePct}
                  icon={Timer}
                  sparkline={kpiState.kpis[0].sparkline}
                />
                <KpiCard
                  label={kpiState.kpis[1].label}
                  value={kpiState.kpis[1].value}
                  changePct={kpiState.kpis[1].changePct}
                  icon={ListChecks}
                  sparkline={kpiState.kpis[1].sparkline}
                />
                <KpiCard
                  label={kpiState.kpis[2].label}
                  value={kpiState.kpis[2].value}
                  changePct={kpiState.kpis[2].changePct}
                  icon={Gauge}
                  sparkline={kpiState.kpis[2].sparkline}
                />
                <KpiCard
                  label={kpiState.kpis[3].label}
                  value={kpiState.kpis[3].value}
                  changePct={kpiState.kpis[3].changePct}
                  icon={Gauge}
                  sparkline={kpiState.kpis[3].sparkline}
                />
              </>
            ) : kpiState.status === "error" ? (
              <div className="col-span-full rounded-2xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                {kpiState.message}
              </div>
            ) : (
              <div className="col-span-full grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[150px] rounded-2xl border border-border/50 bg-card/40 animate-pulse"
                  />
                ))}
              </div>
            )}
          </div>
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


