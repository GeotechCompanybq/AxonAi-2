"use client";

import * as React from "react";
import { addDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DateRangePicker } from "@/components/overview/date-range-picker";
import { KpiCard } from "@/components/overview/kpi-card";
import { OrgTaskSummary } from "@/components/org/org-task-summary";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import { cn } from "@/lib/utils";
import { Gauge, ListChecks, Timer, TrendingDown } from "lucide-react";

type OrgOverviewMetrics = {
  ticketsClosed: {
    value: number;
    changePct: number;
  };
  utilizationRate: {
    valuePct: number;
    targetPct: number;
  };
  onTimeCompletion: {
    valuePct: number;
    targetPct: number;
  };
  avgResponseTimeHours: {
    value: number | null;
    targetHours: number;
  };
  changeRequestsShare: {
    valuePct: number;
    changePct: number;
  };
  categories: Array<{ name: string; count: number }>;
};

type OrgOverviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; metrics: OrgOverviewMetrics };

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatDelta(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%";
  const rounded = Math.round(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${rounded}%`;
}

export default function OrgOverviewPage() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();
  const searchParams = useSearchParams();

  const [range, setRange] = React.useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = addDays(to, -29);
    return { from, to };
  });

  const [state, setState] = React.useState<OrgOverviewState>({
    status: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!orgId || !user) {
          setState({
            status: "error",
            message: "Select an organisation and sign in to see org metrics.",
          });
          return;
        }

        setState({ status: "loading" });

        const token =
          (await import("firebase/auth")).getIdToken(
            (await import("@/lib/firebase")).auth.currentUser!,
            true
          );
        const idToken = await token;

        const url = new URL(
          `/api/orgs/${encodeURIComponent(orgId)}/overview`,
          window.location.origin
        );
        if (range?.from) url.searchParams.set("from", range.from.toISOString());
        if (range?.to) url.searchParams.set("to", range.to.toISOString());

        // Preserve any explicit range params from URL if present
        const fromParam = searchParams?.get("from") || null;
        const toParam = searchParams?.get("to") || null;
        if (fromParam && !url.searchParams.has("from")) {
          url.searchParams.set("from", fromParam);
        }
        if (toParam && !url.searchParams.has("to")) {
          url.searchParams.set("to", toParam);
        }

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          const message =
            json?.error || "Failed to load organisation overview metrics.";
          setState({ status: "error", message });
          return;
        }

        if (cancelled) return;
        setState({ status: "ready", metrics: json.metrics as OrgOverviewMetrics });
      } catch (e: any) {
        if (cancelled) return;
        setState({
          status: "error",
          message: e?.message || "Failed to load organisation overview metrics.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, user, range?.from?.getTime(), range?.to?.getTime(), searchParams]);

  const metrics =
    state.status === "ready"
      ? state.metrics
      : null;

  const kpiSkeleton = (
    <div className="col-span-full grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[150px] rounded-2xl border border-border/40 bg-card/40 animate-pulse"
        />
      ))}
    </div>
  );

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
                Organisation <span className="mx-1">/</span>{" "}
                <span className="text-foreground/80">Key Metrics</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Key Metrics &amp; Tickets Closed
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                High-level view of tickets, utilisation, and response performance
                across your organisation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker value={range} onChange={setRange} />
              <Button variant="outline" className="rounded-xl gap-2">
                Export
              </Button>
            </div>
          </div>

          <Separator className="my-6 bg-border/60" />
        </div>

        {/* Org task summary strip */}
        {orgId && (
          <div className="px-5 md:px-8 space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              Task overview
            </h2>
            <OrgTaskSummary />
          </div>
        )}

        {/* KPI strip */}
        <div className="px-5 md:px-8 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {state.status === "ready" && metrics ? (
              <>
                <KpiCard
                  label="Tickets Closed"
                  value={metrics.ticketsClosed.value.toString()}
                  changePct={metrics.ticketsClosed.changePct}
                  icon={ListChecks}
                  sparkline={[{ v: metrics.ticketsClosed.value }]}
                  href={orgId ? `/org/tasks?orgId=${encodeURIComponent(orgId)}&status=done` : undefined}
                />
                <KpiCard
                  label="Utilisation Rate"
                  value={formatPct(metrics.utilizationRate.valuePct)}
                  changePct={metrics.utilizationRate.valuePct - metrics.utilizationRate.targetPct}
                  icon={Gauge}
                  sparkline={[{ v: metrics.utilizationRate.valuePct }]}
                />
                <KpiCard
                  label="On-Time Completion"
                  value={formatPct(metrics.onTimeCompletion.valuePct)}
                  changePct={
                    metrics.onTimeCompletion.valuePct -
                    metrics.onTimeCompletion.targetPct
                  }
                  icon={Gauge}
                  sparkline={[{ v: metrics.onTimeCompletion.valuePct }]}
                />
                <KpiCard
                  label="Avg Response Time"
                  value={
                    metrics.avgResponseTimeHours.value != null
                      ? `${metrics.avgResponseTimeHours.value.toFixed(1)}h`
                      : "—"
                  }
                  changePct={0}
                  icon={Timer}
                  sparkline={[
                    {
                      v:
                        metrics.avgResponseTimeHours.value != null
                          ? metrics.avgResponseTimeHours.value
                          : 0,
                    },
                  ]}
                />
                <KpiCard
                  label="Change Requests"
                  value={formatPct(metrics.changeRequestsShare.valuePct)}
                  changePct={metrics.changeRequestsShare.changePct}
                  icon={TrendingDown}
                  sparkline={[{ v: metrics.changeRequestsShare.valuePct }]}
                />
              </>
            ) : state.status === "error" ? (
              <div className="col-span-full rounded-2xl border border-border/50 bg-card/50 p-4 text-sm text-muted-foreground">
                {state.message}
              </div>
            ) : (
              kpiSkeleton
            )}
          </div>
        </div>

        {/* Tickets by Category */}
        <div className="px-5 pb-6 pt-6 md:px-8 md:pb-8">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">
                Tickets by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {state.status === "ready" && metrics && metrics.categories.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.categories}
                      layout="vertical"
                      margin={{ left: 80, right: 16, top: 8, bottom: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        formatter={(value: any) => [`${value} tickets`, "Count"]}
                      />
                      <Bar
                        dataKey="count"
                        fill="hsl(var(--primary))"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : state.status === "error" ? (
                <div className="text-sm text-muted-foreground">
                  Unable to load tickets by category.
                </div>
              ) : (
                <div className="h-64 rounded-xl border border-border/40 bg-card/40 animate-pulse" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

