"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { handleAnalyzeTimeUsage } from "@/lib/actions";
import { getTasksFromLocalStorage } from "@/lib/task-storage";
import type { Task } from "@/types";
import { format, parseISO, startOfWeek, addDays } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSpinner } from "@/components/icons";
import type { AnalyzeTimeUsageOutput } from "@/ai/flows/analyze-time-usage";

const chartConfig = {
  hours: {
    label: "Hours",
  },
  Study: {
    label: "Study",
    color: "hsl(var(--chart-1))",
  },
  Work: {
    label: "Work",
    color: "hsl(var(--chart-2))",
  },
  Personal: {
    // Added Personal, as it's more derivable from tasks
    label: "Personal",
    color: "hsl(var(--chart-5))",
  },
  Chill: {
    label: "Chill (Est.)", // Indicate estimation
    color: "hsl(var(--chart-3))",
  },
  Sleep: {
    label: "Sleep (Est.)", // Indicate estimation
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

type ChartData = Array<{
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  Study?: number;
  Work?: number;
  Personal?: number;
  Chill?: number;
  Sleep?: number;
}>;

export function TimeUsageChart() {
  const [chartData, setChartData] = useState<ChartData>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [analysisSummary, setAnalysisSummary] = useState<string | null>(null);
  const [entries, setEntries] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const tasks = getTasksFromLocalStorage();
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(addDays(weekStart, 6), "yyyy-MM-dd");

      // 1) Try Harvest timesheets first (authoritative)
      try {
        const url = new URL("/api/harvest/timesheets", window.location.origin);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        if (res.ok && Array.isArray(json?.timeEntries)) {
          // keep raw entries and projects for filtering
          setEntries(json.timeEntries);
          const uniqProjects = new Map<string, string>();
          for (const e of json.timeEntries) {
            const id = String(e?.project?.id ?? "");
            const name = String(e?.project?.name ?? "");
            if (id && name) uniqProjects.set(id, name);
          }
          setProjects(
            Array.from(uniqProjects.entries()).map(([id, name]) => ({
              id,
              name,
            }))
          );
          // compute initial chart for all projects
          const weekly = computeWeeklyFromEntries(json.timeEntries);
          setChartData(weekly);
          setAnalysisSummary("Weekly time usage based on Harvest timesheets.");
          setIsLoading(false);
          return;
        }
      } catch {}

      // 2) Fallback to AI estimation from tasks
      try {
        const currentDate = format(today, "yyyy-MM-dd");
        const aiTasks = tasks.map((task) => ({
          name: task.name,
          description: task.description,
          dueDate: task.dueDate,
          priority: task.priority,
          status: task.status,
          category: task.category,
        }));
        if (aiTasks.length === 0) {
          const defaultData = [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
          ].map((day) => ({
            day: day as any,
            Study: 0,
            Work: 0,
            Personal: 0,
            Chill: 1,
            Sleep: 7,
          }));
          setChartData(defaultData);
          setAnalysisSummary("No tasks available. Showing default estimates.");
          setIsLoading(false);
          return;
        }

        const result: AnalyzeTimeUsageOutput = await handleAnalyzeTimeUsage({
          tasks: aiTasks,
          currentDate,
        });
        setChartData(result.weeklyUsage);
        setAnalysisSummary(
          result.analysisSummary || "Weekly time usage estimated by AI."
        );
      } catch (error) {
        console.error("Error fetching time usage analysis:", error);
        const fallbackData = [
          "Mon",
          "Tue",
          "Wed",
          "Thu",
          "Fri",
          "Sat",
          "Sun",
        ].map((d) => ({
          day: d as any,
          Study: 0,
          Work: 0,
          Personal: 0,
          Chill: 1,
          Sleep: 7,
        }));
        setChartData(fallbackData);
        setAnalysisSummary(
          "Could not analyze time usage. Displaying defaults."
        );
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Recompute when project filter changes on client-side entries
  useEffect(() => {
    if (!entries) return;
    setIsLoading(true);
    const filtered =
      selectedProjectId === "all"
        ? entries
        : entries.filter((e) => String(e?.project?.id) === selectedProjectId);
    const weekly = computeWeeklyFromEntries(filtered);
    setChartData(weekly);
    const projName =
      selectedProjectId === "all"
        ? "All Projects"
        : projects.find((p) => p.id === selectedProjectId)?.name || "Project";
    setAnalysisSummary(`Weekly time usage from Harvest · ${projName}`);
    setIsLoading(false);
  }, [selectedProjectId]);

  function computeWeeklyFromEntries(raw: any[]): ChartData {
    const perDay: Record<string, number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    };
    for (const e of raw) {
      const dateStr: string | undefined = e?.spent_date;
      const hours: number = Number(e?.hours) || 0;
      if (!dateStr || hours <= 0) continue;
      const d = parseISO(dateStr);
      const idx = d.getDay();
      const key = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx];
      const norm = (key === "Sun" ? "Sun" : key) as
        | "Mon"
        | "Tue"
        | "Wed"
        | "Thu"
        | "Fri"
        | "Sat"
        | "Sun";
      perDay[norm] = (perDay[norm] || 0) + hours;
    }
    return [
      {
        day: "Mon",
        Study: 0,
        Work: perDay.Mon || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Tue",
        Study: 0,
        Work: perDay.Tue || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Wed",
        Study: 0,
        Work: perDay.Wed || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Thu",
        Study: 0,
        Work: perDay.Thu || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Fri",
        Study: 0,
        Work: perDay.Fri || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Sat",
        Study: 0,
        Work: perDay.Sat || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
      {
        day: "Sun",
        Study: 0,
        Work: perDay.Sun || 0,
        Personal: 0,
        Chill: 1,
        Sleep: 7,
      },
    ];
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>AI-Estimated Weekly Time Usage</CardTitle>
            <CardDescription>
              {isLoading
                ? "Analyzing your time usage..."
                : analysisSummary ||
                  "How your time might be spent across activities (in hours)."}
            </CardDescription>
          </div>
          {projects.length > 0 && (
            <div className="w-56">
              <Select
                value={selectedProjectId}
                onValueChange={(v) => setSelectedProjectId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-0 flex items-center justify-center">
        {isLoading ? (
          <IconSpinner className="h-12 w-12 text-primary" />
        ) : chartData.length > 0 ? (
          <ChartContainer
            config={chartConfig}
            className="w-full h-[220px] sm:h-[260px] md:h-[320px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 0, left: -20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="barGlowCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--chart-1))"
                      stopOpacity="0.95"
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--chart-1))"
                      stopOpacity="0.6"
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <Tooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Legend />
                <Bar
                  dataKey="Study"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  fill="url(#barGlowCyan)"
                />
                <Bar
                  dataKey="Work"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  fill={chartConfig.Work.color}
                />
                <Bar
                  dataKey="Personal"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  fill={chartConfig.Personal.color}
                />
                <Bar
                  dataKey="Chill"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  fill={chartConfig.Chill.color}
                />
                <Bar
                  dataKey="Sleep"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  fill={chartConfig.Sleep.color}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground">
            No data to display for time usage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
