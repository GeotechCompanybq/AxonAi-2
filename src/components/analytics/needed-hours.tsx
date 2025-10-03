"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type TimeEntry = { spent_date?: string; hours?: number };

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameWeek(dateStr: string, ref: Date) {
  const d = new Date(dateStr);
  const start = startOfWeek(ref);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}

export function NeededHours() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPerDay, setTargetPerDay] = useState<string>("8");
  const [note, setNote] = useState<string>("");
  const [noting, setNoting] = useState(false);

  async function loadWeek() {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL("/api/harvest/timesheets", window.location.origin);
      const today = new Date();
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      url.searchParams.set("from", start.toISOString().slice(0, 10));
      url.searchParams.set("to", end.toISOString().slice(0, 10));
      url.searchParams.set("per_page", "100");
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load timesheets");
      const list: TimeEntry[] = Array.isArray(json?.timeEntries)
        ? json.timeEntries
        : [];
      setEntries(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load timesheets");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWeek();
  }, []);

  const summary = useMemo(() => {
    const today = new Date();
    const inWeek = entries.filter((e) =>
      e?.spent_date ? isSameWeek(e.spent_date, today) : false
    );
    const perDay = parseFloat(targetPerDay) || 8;
    const worked = inWeek.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    // Workdays elapsed this week (Mon..Fri)
    const dow = (today.getDay() + 6) % 7; // 0..6 where 0=Mon
    const elapsedDays = Math.min(5, dow + 1);
    const remainingWorkDays = Math.max(0, 5 - elapsedDays);
    const targetWeek = perDay * 5;
    const remainingHours = Math.max(0, targetWeek - worked);
    const neededPerRemainingDay = remainingWorkDays
      ? remainingHours / remainingWorkDays
      : 0;
    return {
      perDay,
      worked: Math.round(worked * 100) / 100,
      remainingHours: Math.round(remainingHours * 100) / 100,
      remainingWorkDays,
      neededPerRemainingDay: Math.round(neededPerRemainingDay * 100) / 100,
    };
  }, [entries, targetPerDay]);

  function normalizeAIText(raw: string): string {
    let text = raw?.trim() ?? "";
    try {
      const data = JSON.parse(text);
      if (typeof data === "string") text = data;
      else if (data?.reply || data?.response || data?.output || data?.note) {
        text = String(data.reply || data.response || data.output || data.note);
      }
    } catch {}
    // Strip simple JSON wrappers like {"note":"..."}
    text = text
      .replace(/^\s*\{\s*"?(?:note|message)"?\s*:\s*"/i, "")
      .replace(/"\s*}\s*$/i, "");
    // Remove surrounding quotes/backticks if present
    text = text.replace(/^['"`]+|['"`]+$/g, "").trim();
    return text;
  }

  async function generateNote() {
    setNoting(true);
    setError(null);
    try {
      const prompt = `Write one concise professional sentence summarizing weekly time balance.
Numbers to use exactly:
- Worked so far: ${summary.worked} hours
- Target per day: ${summary.perDay} hours
- Remaining hours to hit target week: ${summary.remainingHours} hours
- Remaining work days: ${summary.remainingWorkDays}
- Needed per remaining day: ${summary.neededPerRemainingDay} hours
Return ONLY the sentence (no JSON, no quotes).`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      const raw = await res.text();
      setNote(normalizeAIText(raw));
    } catch (e: any) {
      setError(e?.message || "Failed to generate note");
    } finally {
      setNoting(false);
    }
  }

  // Auto-generate the note whenever weekly data or target changes
  useEffect(() => {
    if (entries.length > 0) {
      // debounce slightly to avoid double-runs during fast state updates
      const t = setTimeout(() => void generateNote(), 150);
      return () => clearTimeout(t);
    }
  }, [entries, targetPerDay]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-bold">
          Hours Needed This Week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Target/day</div>
            <Input
              value={targetPerDay}
              onChange={(e) => setTargetPerDay(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <div className="text-muted-foreground">Worked</div>
            <div className="font-medium">{summary.worked} h</div>
          </div>
          <div>
            <div className="text-muted-foreground">Remaining</div>
            <div className="font-medium">{summary.remainingHours} h</div>
          </div>
          <div>
            <div className="text-muted-foreground">Needed/day</div>
            <div className="font-medium">
              {summary.neededPerRemainingDay} h ({summary.remainingWorkDays}{" "}
              days)
            </div>
          </div>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <Textarea
          placeholder="Short note will appear here…"
          value={note}
          readOnly
          rows={3}
        />
      </CardContent>
    </Card>
  );
}
