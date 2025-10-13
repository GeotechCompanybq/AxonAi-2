"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfWeek(date = new Date()): Date {
  const s = startOfWeek(date);
  const d = new Date(s);
  d.setDate(s.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function formatDate(d?: string | Date): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

export default function WeeklySummaryTablePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Period controls
  const [range, setRange] = useState<"week" | "lastWeek" | "month" | "custom">(
    "week"
  );
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const { rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date();
    if (range === "week")
      return { rangeStart: startOfWeek(today), rangeEnd: endOfWeek(today) };
    if (range === "lastWeek") {
      const last = new Date(today);
      last.setDate(today.getDate() - 7);
      return { rangeStart: startOfWeek(last), rangeEnd: endOfWeek(last) };
    }
    if (range === "month") {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      e.setHours(23, 59, 59, 999);
      return { rangeStart: s, rangeEnd: e };
    }
    if (from && to) {
      const s = new Date(from);
      s.setHours(0, 0, 0, 0);
      const e = new Date(to);
      e.setHours(23, 59, 59, 999);
      return { rangeStart: s, rangeEnd: e };
    }
    return { rangeStart: startOfWeek(today), rangeEnd: endOfWeek(today) };
  }, [range, from, to]);

  // Timesheets for generating summaries
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const url = new URL("/api/harvest/timesheets", window.location.origin);
        url.searchParams.set("from", formatDate(rangeStart));
        url.searchParams.set("to", formatDate(rangeEnd));
        if (user?.uid) url.searchParams.set("uid", user.uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json?.error || "Failed to fetch time entries");
        if (!ignore)
          setTimeEntries(
            Array.isArray(json?.timeEntries) ? json.timeEntries : []
          );
      } catch (e: any) {
        if (!ignore) setTimeEntries([]);
        toast({
          title: "Failed to load timesheets",
          description: e?.message || "",
        });
      }
    })();
    return () => {
      ignore = true;
    };
  }, [user?.uid, rangeStart, rangeEnd, toast]);

  // Filtered entries for the selected period and aggregations
  const filteredEntries = useMemo(() => {
    return timeEntries.filter((e: any) => {
      const d = String(e?.spent_date || "");
      if (!d) return false;
      const ms = new Date(d).getTime();
      return ms >= rangeStart.getTime() && ms <= rangeEnd.getTime();
    });
  }, [timeEntries, rangeStart, rangeEnd]);

  const {
    hoursTotal,
    hoursBillable,
    utilizationPct,
    entriesCount,
    projectsTouched,
    byProject,
    byDay,
    issues,
    highlights,
  } = useMemo(() => {
    let hoursTotal = 0;
    let hoursBillable = 0;
    const byProjectMap: Record<string, number> = {};
    const byDayMap: Record<string, number> = {};
    const issueSet = new Set<string>();

    for (const e of filteredEntries) {
      const hrs = Number(e?.hours || 0);
      hoursTotal += hrs;
      if (e?.billable) hoursBillable += hrs;
      const proj = String(e?.project?.name || "General");
      byProjectMap[proj] = (byProjectMap[proj] || 0) + hrs;
      const date = formatDate(String(e?.spent_date || ""));
      if (date) byDayMap[date] = (byDayMap[date] || 0) + hrs;
      const notes = String(e?.notes || "");
      if (notes) {
        const found = notes.match(/[A-Z][A-Z0-9]+-\d+/g);
        if (found) for (const k of found) issueSet.add(k);
      }
    }

    const byProject = Object.entries(byProjectMap)
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);
    const byDay = Object.entries(byDayMap)
      .map(([date, hours]) => ({ date, hours }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Create highlights from first line of notes, weighted by hours
    const highlightMap = new Map<string, number>();
    for (const e of filteredEntries) {
      const hrs = Number(e?.hours || 0);
      const notes = String(e?.notes || "").trim();
      if (!notes) continue;
      const keyMatch = notes.match(/[A-Z][A-Z0-9]+-\d+/);
      const firstLine = notes.split(/\r?\n/)[0].trim();
      const key = keyMatch ? keyMatch[0] : firstLine;
      if (!key) continue;
      highlightMap.set(key, (highlightMap.get(key) || 0) + hrs);
    }
    const highlights = Array.from(highlightMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([text]) => text);

    const utilizationPct =
      hoursTotal > 0 ? (hoursBillable / hoursTotal) * 100 : 0;
    return {
      hoursTotal,
      hoursBillable,
      utilizationPct,
      entriesCount: filteredEntries.length,
      projectsTouched: byProject.length,
      byProject,
      byDay,
      issues: Array.from(issueSet.values()).sort(),
      highlights,
    };
  }, [filteredEntries]);

  // Generate AI summary from time entries
  const [generating, setGenerating] = useState(false);
  const [aiText, setAiText] = useState<string>("");
  const [summaryMode, setSummaryMode] = useState<"concise" | "comprehensive">(
    "comprehensive"
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [structured, setStructured] = useState<any | null>(null);
  const [manualJson, setManualJson] = useState<string>("");

  // Parse JSON from AI text if available
  useEffect(() => {
    const t = String(aiText || "").trim();
    if (!t) {
      setStructured(null);
      return;
    }
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const maybe = t.slice(start, end + 1);
      try {
        const obj = JSON.parse(maybe);
        setStructured(obj);
        return;
      } catch {}
    }
    setStructured(null);
  }, [aiText]);

  // Normalize structured report root (supports with/without wrapper key)
  const report = useMemo(() => {
    if (!structured || typeof structured !== "object") return null;
    const maybe = (structured as any)["Weekly Retro Report"];
    if (maybe && typeof maybe === "object") return maybe;
    return structured as any;
  }, [structured]);
  // (no duplicate state/effect definitions)
  async function generate() {
    setGenerating(true);
    setAiText("");
    try {
      const entries = filteredEntries.slice(0, 200);
      if (entries.length === 0) {
        setAiText("No logged time in the selected period.");
        return;
      }
      const lines: string[] = [];
      for (const e of entries) {
        const date = String(e?.spent_date || "");
        const proj = String(e?.project?.name || "General");
        const task = String(e?.task?.name || "Work");
        const hrs = Number(e?.hours || 0);
        const notes = String(e?.notes || "");
        lines.push(
          `- ${date}: ${proj} – ${task} (${hrs.toFixed(2)}h) :: ${notes}`
        );
      }
      const base = [
        `Period: ${formatDate(rangeStart)} → ${formatDate(rangeEnd)}`,
      ];
      let prompt = "";
      if (summaryMode === "concise") {
        prompt = [
          "Write a concise weekly report (2–3 sentences) summarizing accomplishments from these timesheet lines.",
          ...base,
          "Timesheet lines:",
          ...lines,
        ].join("\n");
      } else {
        // Comprehensive, structured retro
        const metrics = [
          `Total hours: ${hoursTotal.toFixed(2)}`,
          `Billable hours: ${hoursBillable.toFixed(2)}`,
          `Utilization: ${utilizationPct.toFixed(1)}%`,
          `Projects touched: ${projectsTouched}`,
          `Entries: ${entriesCount}`,
          `Issues: ${(issues || []).join(", ")}`,
        ];
        const byProjectLines = byProject
          .slice(0, 12)
          .map((p) => `- ${p.name}: ${p.hours.toFixed(2)}h`);
        const byDayLines = byDay.map(
          (d) => `- ${d.date}: ${d.hours.toFixed(2)}h`
        );
        const schema =
          `\nReturn ONLY valid minified JSON matching this exact shape (no markdown, no code fences, no commentary):\n{\n  "Weekly Retro Report": {\n    "Overview Metrics": {\n      "Total Hours": number,\n      "Billable Hours": number,\n      "Utilization": number,\n      "Projects Touched": number,\n      "Entries": number,\n      "Issues": string[]\n    },\n    "Hours by Day": { [date:string]: number },\n    "Hours by Project": { [project:string]: number },\n    "Projects and Issue Keys": { "Projects": string[], "Issues": string[] },\n    "Key Accomplishments and Outcomes": string[],\n    "Notable Impact": string[],\n    "Risks/Blockers": string[],\n    "Suggested Focus for Next Week": string[]\n  }\n}`.trim();
        prompt = [
          "Create a comprehensive weekly retro.",
          ...base,
          "Use the lines to populate the fields.",
          "Timesheet lines:",
          ...lines,
          "Output:",
          schema,
        ].join("\n");
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      const j = await res.json().catch(() => ({}));
      const text =
        j?.reply ||
        j?.response ||
        j?.summary ||
        j?.message ||
        j?.output?.reply ||
        j?.output?.summary ||
        j?.output?.message ||
        "";
      setAiText(String(text || "Summary unavailable.").trim());
    } catch (e: any) {
      setAiText(e?.message || "Failed to generate summary.");
    } finally {
      setGenerating(false);
    }
  }

  // Save summary
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!user?.uid || !aiText) return;
    try {
      setSaving(true);
      const hours = filteredEntries.reduce(
        (s: number, e: any) => s + (Number(e?.hours) || 0),
        0
      );
      await fetch("/api/weekly-summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          from: formatDate(rangeStart),
          to: formatDate(rangeEnd),
          summary: aiText,
          hoursTotal: hours,
          entriesCount: filteredEntries.length,
        }),
      });
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  // Table of saved summaries
  const [rows, setRows] = useState<any[]>([]);
  async function loadRows() {
    if (!user?.uid) return;
    const url = new URL("/api/weekly-summaries", window.location.origin);
    url.searchParams.set("uid", user.uid);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setRows(Array.isArray(json?.summaries) ? json.summaries : []);
  }
  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Auto-generate when entries change and comprehensive mode
  useEffect(() => {
    if (
      summaryMode === "comprehensive" &&
      filteredEntries.length > 0 &&
      user?.uid
    ) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    summaryMode,
    filteredEntries.length,
    rangeStart.getTime(),
    rangeEnd.getTime(),
    user?.uid,
  ]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Weekly AI Summaries</div>
        <div className="flex gap-2">
          <Select
            value={summaryMode}
            onValueChange={(v) => setSummaryMode(v as any)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Summary Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="comprehensive">Comprehensive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="lastWeek">Last Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {range === "custom" && (
            <div className="flex gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          )}
          <Button onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate"}
          </Button>
          <Button onClick={save} disabled={saving || !aiText}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" disabled={!aiText}>
                Preview Summary
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Weekly Summary Preview</DialogTitle>
                <DialogDescription>
                  {formatDate(rangeStart)} → {formatDate(rangeEnd)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[70vh] overflow-auto pr-2">
                {/* Manual JSON UI removed in production */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total:</span>{" "}
                    <span className="font-medium">
                      {hoursTotal.toFixed(2)}h
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Billable:</span>{" "}
                    <span className="font-medium">
                      {hoursBillable.toFixed(2)}h
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Utilization:</span>{" "}
                    <span className="font-medium">
                      {utilizationPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Projects:</span>{" "}
                    <span className="font-medium">{projectsTouched}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Entries:</span>{" "}
                    <span className="font-medium">{entriesCount}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Issues:</span>{" "}
                    <span className="font-medium">{issues.length}</span>
                  </div>
                </div>
                {issues.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Issues
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {issues.map((k) => (
                        <Badge key={`modal-${k}`}>{k}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {highlights.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Highlights
                    </div>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      {highlights.map((h, i) => (
                        <li key={`mh-${i}`}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Structured Weekly Retro Report
                    </div>
                    <Card>
                      <CardContent className="p-4 space-y-4 text-sm">
                        {report ? (
                          <>
                            {report["Overview Metrics"] && (
                              <div>
                                <div className="font-medium mb-2">
                                  Overview Metrics
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {Object.entries(
                                    report["Overview Metrics"]
                                  ).map(([k, v]: any) => (
                                    <div key={`om-${k}`} className="text-sm">
                                      <span className="text-muted-foreground">
                                        {k}:
                                      </span>{" "}
                                      <span className="font-medium">
                                        {Array.isArray(v)
                                          ? v.length
                                          : String(v)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {report["Hours by Day"] && (
                              <div>
                                <div className="font-medium mb-2">
                                  Hours by Day
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Day</TableHead>
                                      <TableHead className="w-[140px]">
                                        Hours
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {Object.entries(report["Hours by Day"]).map(
                                      ([d, h]: any) => (
                                        <TableRow key={`hbd-${d}`}>
                                          <TableCell>{d}</TableCell>
                                          <TableCell>
                                            {Number(h).toFixed(2)}h
                                          </TableCell>
                                        </TableRow>
                                      )
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {report["Hours by Project"] && (
                              <div>
                                <div className="font-medium mb-2">
                                  Hours by Project
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Project</TableHead>
                                      <TableHead className="w-[140px]">
                                        Hours
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {Object.entries(
                                      report["Hours by Project"]
                                    ).map(([p, h]: any) => (
                                      <TableRow key={`hbp-${p}`}>
                                        <TableCell>{p}</TableCell>
                                        <TableCell>
                                          {Number(h).toFixed(2)}h
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {report["Projects and Issue Keys"] && (
                              <div>
                                <div className="font-medium mb-2">
                                  Projects and Issue Keys
                                </div>
                                <div className="text-sm mb-2">
                                  <span className="text-muted-foreground">
                                    Projects:
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {(
                                    report["Projects and Issue Keys"][
                                      "Projects"
                                    ] || []
                                  ).map((p: string) => (
                                    <Badge key={`pp-${p}`} variant="secondary">
                                      {p}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="text-sm mb-2">
                                  <span className="text-muted-foreground">
                                    Issues:
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(
                                    report["Projects and Issue Keys"][
                                      "Issues"
                                    ] || []
                                  ).map((i: string) => (
                                    <Badge key={`pi-${i}`}>{i}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {Array.isArray(
                              report["Key Accomplishments and Outcomes"]
                            ) && (
                              <div>
                                <div className="font-medium mb-2">
                                  Key Accomplishments and Outcomes
                                </div>
                                <ul className="list-disc ml-5 space-y-1">
                                  {report[
                                    "Key Accomplishments and Outcomes"
                                  ].map((t: string, idx: number) => (
                                    <li key={`ka-${idx}`}>{t}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {Array.isArray(report["Notable Impact"]) && (
                              <div>
                                <div className="font-medium mb-2">
                                  Notable Impact
                                </div>
                                <ul className="list-disc ml-5 space-y-1">
                                  {report["Notable Impact"].map(
                                    (t: string, idx: number) => (
                                      <li key={`ni-${idx}`}>{t}</li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}
                            {Array.isArray(report["Risks/Blockers"]) && (
                              <div>
                                <div className="font-medium mb-2">
                                  Risks/Blockers
                                </div>
                                {report["Risks/Blockers"].length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    None
                                  </div>
                                ) : (
                                  <ul className="list-disc ml-5 space-y-1">
                                    {report["Risks/Blockers"].map(
                                      (t: string, idx: number) => (
                                        <li key={`rb-${idx}`}>{t}</li>
                                      )
                                    )}
                                  </ul>
                                )}
                              </div>
                            )}
                            {Array.isArray(
                              report["Suggested Focus for Next Week"]
                            ) && (
                              <div>
                                <div className="font-medium mb-2">
                                  Suggested Focus for Next Week
                                </div>
                                <ul className="list-disc ml-5 space-y-1">
                                  {report["Suggested Focus for Next Week"].map(
                                    (t: string, idx: number) => (
                                      <li key={`sf-${idx}`}>{t}</li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Unrecognized JSON structure
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">
                      AI Summary
                    </div>
                    <Card>
                      <CardContent className="p-4 text-sm leading-6 whitespace-pre-wrap">
                        {aiText}
                      </CardContent>
                    </Card>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[180px]">Day</TableHead>
                            <TableHead className="w-[120px]">Hours</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byDay.map((d) => (
                            <TableRow key={`md-${d.date}`}>
                              <TableCell>{d.date}</TableCell>
                              <TableCell>{d.hours.toFixed(2)}h</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead className="w-[120px]">Hours</TableHead>
                            <TableHead className="w-[120px]">Share</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byProject.map((p) => (
                            <TableRow key={`mp-${p.name}`}>
                              <TableCell>{p.name}</TableCell>
                              <TableCell>{p.hours.toFixed(2)}h</TableCell>
                              <TableCell>
                                {hoursTotal > 0
                                  ? `${((p.hours / hoursTotal) * 100).toFixed(
                                      1
                                    )}%`
                                  : "0.0%"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <div className="flex w-full justify-between items-center gap-3">
                  <div className="text-xs text-muted-foreground">
                    Ready for weekly retro presentation
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const text = `Period: ${formatDate(
                          rangeStart
                        )} → ${formatDate(rangeEnd)}\n\n${aiText}`;
                        navigator.clipboard?.writeText(text).catch(() => {});
                      }}
                    >
                      Copy Summary
                    </Button>
                    <Button onClick={() => setModalOpen(false)}>Close</Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total hours</div>
            <div className="text-2xl font-semibold">
              {hoursTotal.toFixed(2)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Billable hours</div>
            <div className="text-2xl font-semibold">
              {hoursBillable.toFixed(2)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Utilization</div>
            <div className="text-2xl font-semibold">
              {utilizationPct.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">
              Projects touched
            </div>
            <div className="text-2xl font-semibold">{projectsTouched}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Entries</div>
            <div className="text-2xl font-semibold">{entriesCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Issues</div>
            <div className="text-2xl font-semibold">{issues.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Issues worked */}
      {issues.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-2">
              Issues worked
            </div>
            <div className="flex flex-wrap gap-2">
              {issues.map((k) => (
                <Badge key={k}>{k}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Highlights */}
      {highlights.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-2">
              Key highlights
            </div>
            <ul className="list-disc ml-5 space-y-1 text-sm">
              {highlights.map((h, i) => (
                <li key={`${h}-${i}`}>{h}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {aiText && (
        <Card>
          <CardContent className="p-4 text-sm leading-6 whitespace-pre-wrap">
            {aiText}
          </CardContent>
        </Card>
      )}

      {/* Manual JSON UI removed in production */}

      {/* Structured Weekly Retro (if JSON provided or parsed) */}
      {structured && (
        <Card>
          <CardContent className="p-4 space-y-4 text-sm">
            {structured["Weekly Retro Report"] ? (
              <>
                {structured["Weekly Retro Report"]["Overview Metrics"] && (
                  <div>
                    <div className="font-medium mb-2">Overview Metrics</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(
                        structured["Weekly Retro Report"]["Overview Metrics"]
                      ).map(([k, v]: any) => (
                        <div key={`om2-${k}`} className="text-sm">
                          <span className="text-muted-foreground">{k}:</span>{" "}
                          <span className="font-medium">
                            {Array.isArray(v) ? v.length : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {structured["Weekly Retro Report"]["Hours by Day"] && (
                  <div>
                    <div className="font-medium mb-2">Hours by Day</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Day</TableHead>
                          <TableHead className="w-[140px]">Hours</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(
                          structured["Weekly Retro Report"]["Hours by Day"]
                        ).map(([d, h]: any) => (
                          <TableRow key={`hbd2-${d}`}>
                            <TableCell>{d}</TableCell>
                            <TableCell>{Number(h).toFixed(2)}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {structured["Weekly Retro Report"]["Hours by Project"] && (
                  <div>
                    <div className="font-medium mb-2">Hours by Project</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead className="w-[140px]">Hours</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(
                          structured["Weekly Retro Report"]["Hours by Project"]
                        ).map(([p, h]: any) => (
                          <TableRow key={`hbp2-${p}`}>
                            <TableCell>{p}</TableCell>
                            <TableCell>{Number(h).toFixed(2)}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {structured["Weekly Retro Report"][
                  "Projects and Issue Keys"
                ] && (
                  <div>
                    <div className="font-medium mb-2">
                      Projects and Issue Keys
                    </div>
                    <div className="text-sm mb-2">
                      <span className="text-muted-foreground">Projects:</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(
                        structured["Weekly Retro Report"][
                          "Projects and Issue Keys"
                        ]["Projects"] || []
                      ).map((p: string) => (
                        <Badge key={`pp2-${p}`} variant="secondary">
                          {p}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-sm mb-2">
                      <span className="text-muted-foreground">Issues:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        structured["Weekly Retro Report"][
                          "Projects and Issue Keys"
                        ]["Issues"] || []
                      ).map((i: string) => (
                        <Badge key={`pi2-${i}`}>{i}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(
                  structured["Weekly Retro Report"][
                    "Key Accomplishments and Outcomes"
                  ]
                ) && (
                  <div>
                    <div className="font-medium mb-2">
                      Key Accomplishments and Outcomes
                    </div>
                    <ul className="list-disc ml-5 space-y-1">
                      {structured["Weekly Retro Report"][
                        "Key Accomplishments and Outcomes"
                      ].map((t: string, idx: number) => (
                        <li key={`ka2-${idx}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(
                  structured["Weekly Retro Report"]["Notable Impact"]
                ) && (
                  <div>
                    <div className="font-medium mb-2">Notable Impact</div>
                    <ul className="list-disc ml-5 space-y-1">
                      {structured["Weekly Retro Report"]["Notable Impact"].map(
                        (t: string, idx: number) => (
                          <li key={`ni2-${idx}`}>{t}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
                {Array.isArray(
                  structured["Weekly Retro Report"]["Risks/Blockers"]
                ) && (
                  <div>
                    <div className="font-medium mb-2">Risks/Blockers</div>
                    {structured["Weekly Retro Report"]["Risks/Blockers"]
                      .length === 0 ? (
                      <div className="text-sm text-muted-foreground">None</div>
                    ) : (
                      <ul className="list-disc ml-5 space-y-1">
                        {structured["Weekly Retro Report"][
                          "Risks/Blockers"
                        ].map((t: string, idx: number) => (
                          <li key={`rb2-${idx}`}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {Array.isArray(
                  structured["Weekly Retro Report"][
                    "Suggested Focus for Next Week"
                  ]
                ) && (
                  <div>
                    <div className="font-medium mb-2">
                      Suggested Focus for Next Week
                    </div>
                    <ul className="list-disc ml-5 space-y-1">
                      {structured["Weekly Retro Report"][
                        "Suggested Focus for Next Week"
                      ].map((t: string, idx: number) => (
                        <li key={`sf2-${idx}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Unrecognized JSON structure
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Day</TableHead>
                  <TableHead className="w-[120px]">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell>{d.hours.toFixed(2)}h</TableCell>
                  </TableRow>
                ))}
                {byDay.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-sm text-muted-foreground p-6"
                    >
                      No time logged for selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="w-[120px]">Hours</TableHead>
                  <TableHead className="w-[120px]">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProject.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.hours.toFixed(2)}h</TableCell>
                    <TableCell>
                      {hoursTotal > 0
                        ? `${((p.hours / hoursTotal) * 100).toFixed(1)}%`
                        : "0.0%"}
                    </TableCell>
                  </TableRow>
                ))}
                {byProject.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-sm text-muted-foreground p-6"
                    >
                      No projects in selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">From</TableHead>
                <TableHead className="w-[140px]">To</TableHead>
                <TableHead className="w-[120px]">Hours</TableHead>
                <TableHead className="w-[120px]">Entries</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.uid}-${r.from}-${r.to}`}>
                  <TableCell>{r.from}</TableCell>
                  <TableCell>{r.to}</TableCell>
                  <TableCell>{Number(r.hoursTotal || 0).toFixed(2)}h</TableCell>
                  <TableCell>{r.entriesCount || 0}</TableCell>
                  <TableCell className="whitespace-pre-wrap text-sm leading-6">
                    {r.summary}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-sm text-muted-foreground p-6"
                  >
                    No summaries yet. Generate and save one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
