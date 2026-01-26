"use client";

import { differenceInCalendarDays, format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

import { getTasksFromLocalStorage } from "@/lib/task-storage";
import type { Task } from "@/types";

type SparkPoint = { v: number };

function clampRange(range: DateRange | undefined): { from: Date; to: Date } | null {
  if (!range?.from || !range?.to) return null;
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from > to) return { from: to, to: from };
  return { from, to };
}

function fmtYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function nfmt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function pfmt(n: number): string {
  return `${Math.round(n)}%`;
}

function seriesDays(from: Date, to: Date): Date[] {
  const days = Math.max(0, differenceInCalendarDays(to, from)) + 1;
  return Array.from({ length: days }).map((_, i) => subDays(to, days - 1 - i));
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

async function fetchHarvestHoursByDay({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<Record<string, number>> {
  // Get uid from global window variable (set by layout)
  const uid = (window as any).__AXON_UID__;
  
  const url = new URL("/api/harvest/timesheets", window.location.origin);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  if (uid) {
    url.searchParams.set("uid", uid);
  }
  // Include credentials to send cookies
  const res = await fetch(url.toString(), { 
    cache: "no-store",
    credentials: "include" // Ensure cookies are sent
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to fetch Harvest timesheets");
  const entries: any[] = Array.isArray(json?.timeEntries) ? json.timeEntries : [];
  const byDay: Record<string, number> = {};
  for (const e of entries) {
    const day = String(e?.spent_date || "");
    const hours = Number(e?.hours) || 0;
    if (!day || hours <= 0) continue;
    byDay[day] = (byDay[day] || 0) + hours;
  }
  return byDay;
}

function computeCompletedTasksByDay(tasks: Task[]): Record<string, number> {
  // Tasks don't currently store completion timestamp. We fall back to dueDate as a rough "by-day" series,
  // but keep the headline values fully accurate.
  const byDay: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status !== "done") continue;
    const day = t.dueDate ? String(t.dueDate).slice(0, 10) : "";
    if (!day) continue;
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return byDay;
}

export async function buildOverviewKpis(range: DateRange | undefined) {
  const r = clampRange(range);
  if (!r) return null;

  const days = seriesDays(r.from, r.to);
  const periodDays = days.length;
  const prevFrom = subDays(r.from, periodDays);
  const prevTo = subDays(r.from, 1);

  // Tasks (local/cloud-synced to local)
  const tasks = getTasksFromLocalStorage();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const completionRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

  // Harvest hours (may not be connected)
  let hours = 0;
  let hoursPrev = 0;
  let hoursByDay: Record<string, number> = {};
  let hoursPrevByDay: Record<string, number> = {};
  let harvestConnected = false;

  // Check Harvest connection status first
  let statusCheckPassed = false;
  try {
    const uid = (window as any).__AXON_UID__;
    if (!uid) {
      console.warn("No UID available for Harvest status check");
    } else {
      const statusUrl = new URL("/api/harvest/status", window.location.origin);
      statusUrl.searchParams.set("uid", uid);
      // Include credentials to send cookies
      const statusRes = await fetch(statusUrl.toString(), { 
        cache: "no-store",
        credentials: "include" // Ensure cookies are sent
      });
      const statusJson = await statusRes.json();
      statusCheckPassed = statusJson?.connected === true;
      console.log("Harvest connection status:", { 
        connected: statusCheckPassed, 
        source: statusJson?.source,
        accountId: statusJson?.accountId,
        uid 
      });
    }
  } catch (e) {
    console.warn("Failed to check Harvest status:", e);
  }

  // Try to fetch hours - even if status check failed, tokens might be in DB
  try {
    hoursByDay = await fetchHarvestHoursByDay({ from: fmtYmd(r.from), to: fmtYmd(r.to) });
    hoursPrevByDay = await fetchHarvestHoursByDay({
      from: fmtYmd(prevFrom),
      to: fmtYmd(prevTo),
    });
    hours = Object.values(hoursByDay).reduce((a, b) => a + b, 0);
    hoursPrev = Object.values(hoursPrevByDay).reduce((a, b) => a + b, 0);
    // If fetch succeeded, we're connected
    harvestConnected = true;
    console.log("Harvest hours fetched successfully:", { hours, hoursPrev, entries: Object.keys(hoursByDay).length });
  } catch (e: any) {
    // Check error message to determine if it's a connection issue
    const errorMsg = e?.message?.toLowerCase() || "";
    if (errorMsg.includes("not connected") || errorMsg.includes("unauthorized") || errorMsg.includes("401")) {
      harvestConnected = false;
      console.log("Harvest not connected - connection error");
    } else {
      // Other errors (network, timeout, etc.) - mark as not connected for now
      harvestConnected = false;
      console.warn("Failed to fetch Harvest hours:", e);
    }
  }

  const doneByDay = computeCompletedTasksByDay(tasks);

  const sparkHours: SparkPoint[] = days.map((d) => ({
    v: Math.round(((hoursByDay[fmtYmd(d)] || 0) + Number.EPSILON) * 10) / 10,
  }));

  const sparkDone: SparkPoint[] = days.map((d) => ({
    v: doneByDay[fmtYmd(d)] || 0,
  }));

  // % changes
  const changeHours = harvestConnected ? pctChange(hours, hoursPrev) : 0;
  const changeDone = 0; // without completion timestamps, comparing periods is misleading
  const changeOpen = 0;
  const changeRate = 0;

  return {
    harvestConnected,
    kpis: [
      {
        key: "hours",
        label: "Hours Logged",
        value: harvestConnected ? `${hours.toFixed(1)}h` : "Not connected",
        changePct: harvestConnected ? changeHours : 0,
        sparkline: sparkHours,
      },
      {
        key: "tasks_done",
        label: "Tasks Completed",
        value: nfmt(doneTasks),
        changePct: changeDone,
        sparkline: sparkDone,
      },
      {
        key: "tasks_open",
        label: "Open Tasks",
        value: nfmt(openTasks),
        changePct: changeOpen,
        sparkline: sparkDone.map((p) => ({ v: Math.max(0, openTasks - p.v) })), // simple shape
      },
      {
        key: "completion_rate",
        label: "Completion Rate",
        value: pfmt(completionRate),
        changePct: changeRate,
        sparkline: sparkDone.map((p, i) => ({
          v:
            totalTasks > 0
              ? Math.round(((p.v / Math.max(1, totalTasks)) * 100 + i * 0.2) * 10) / 10
              : 0,
        })),
      },
    ],
  };
}


