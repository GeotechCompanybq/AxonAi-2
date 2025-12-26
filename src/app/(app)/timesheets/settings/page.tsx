"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Settings = {
  requireMatchProjectNames: string[];
  excludedAltProjectNames: string[];
  billableClientNames: string[];
  matchToleranceMinutes: number;
  dailyTargetHours: number;
  autoFixEnabled: boolean;
  autoFixIncrementMinutes: number;
  autoFixOnFetch: boolean;
  meetingHarvestProjectId?: string;
  meetingHarvestTaskId?: string;
  notificationEmail?: string;
};

const DEFAULTS: Settings = {
  requireMatchProjectNames: [],
  excludedAltProjectNames: [],
  billableClientNames: ["TruePoint Solutions"],
  matchToleranceMinutes: 5,
  dailyTargetHours: 8,
  autoFixEnabled: true,
  autoFixIncrementMinutes: 15,
  autoFixOnFetch: true,
  meetingHarvestProjectId: "",
  meetingHarvestTaskId: "",
  notificationEmail: "",
};

function normalizeProjectName(name: string): string {
  const raw = String(name || "").toLowerCase();
  // Remove bracketed meta like [Accela], [PO ...], initials, etc.
  const noBrackets = raw.replace(/\[[^\]]*\]/g, " ");
  // Remove parenthetical meta
  const noParens = noBrackets.replace(/\([^)]*\)/g, " ");
  // Remove common ID-ish tokens and date fragments
  const noIds = noParens
    .replace(/\bpo\b/g, " ")
    .replace(/\bfy\d{2,4}\b/g, " ")
    .replace(/\bp\d{6,}\b/g, " ")
    .replace(/\b\d{2,4}\/\d{2,4}\/\d{2,4}\b/g, " ")
    .replace(/\b\d{2,4}-\d{2,4}\b/g, " ");
  // Remove standalone numbers and punctuation
  const noNums = noIds.replace(/\b\d+\b/g, " ");
  return noNums.replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}

function readFirebaseAuthUid(): string | undefined {
  try {
    const globalUid = (window as any)?.__AXON_UID__;
    if (globalUid) return String(globalUid);
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) || "";
      if (key.startsWith("firebase:authUser")) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          if (obj?.uid) return String(obj.uid);
        } catch {}
      }
    }
  } catch {}
  return undefined;
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function TimesheetSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altProjectsError, setAltProjectsError] = useState<string | null>(null);
  const [harvestProjectsFull, setHarvestProjectsFull] = useState<
    { id: string; name: string; client?: string | null }[]
  >([]);
  const [harvestTasksForMeetingProject, setHarvestTasksForMeetingProject] =
    useState<{ id: string; name: string; is_active?: boolean }[]>([]);

  const [projectInput, setProjectInput] = useState("");
  const [excludedInput, setExcludedInput] = useState("");
  const [primaryProjects, setPrimaryProjects] = useState<string[]>([]);
  const [altProjects, setAltProjects] = useState<string[]>([]);
  const [projFilter, setProjFilter] = useState("");
  const [altFilter, setAltFilter] = useState("");
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState("");

  function toggleMatchProjectBySimilarity({
    name,
    isEnabled,
  }: {
    name: string;
    isEnabled: boolean;
  }) {
    const key = normalizeProjectName(name);
    setSettings((s) => {
      if (!isEnabled) {
        return {
          ...s,
          requireMatchProjectNames: (s.requireMatchProjectNames || []).filter(
            (x) => x !== name
          ),
        };
      }

      const pool = Array.from(
        new Set([...(primaryProjects || []), ...(altProjects || [])])
      );
      const similar = pool.filter((n) => normalizeProjectName(n) === key);
      return {
        ...s,
        requireMatchProjectNames: Array.from(
          new Set([...(s.requireMatchProjectNames || []), name, ...similar])
        ).slice(0, 200),
      };
    });
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const url = new URL("/api/timesheets/settings", window.location.origin);
        const uid = readFirebaseAuthUid();
        if (uid) url.searchParams.set("uid", uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await readJsonSafe(res);
        if (!res.ok) throw new Error(json?.error || "Failed to load settings");
        setSettings({
          requireMatchProjectNames: json.requireMatchProjectNames || [],
          excludedAltProjectNames: json.excludedAltProjectNames || [],
          billableClientNames: json.billableClientNames || ["TruePoint Solutions"],
          matchToleranceMinutes: Number(json.matchToleranceMinutes || 5),
          dailyTargetHours: Number(json.dailyTargetHours || 8),
          autoFixEnabled: Boolean(json.autoFixEnabled),
          autoFixIncrementMinutes: Number(json.autoFixIncrementMinutes || 15),
          autoFixOnFetch: Boolean(json.autoFixOnFetch),
          meetingHarvestProjectId: String(json.meetingHarvestProjectId || ""),
          meetingHarvestTaskId: String(json.meetingHarvestTaskId || ""),
          notificationEmail: String(json.notificationEmail || ""),
        });
        // Fetch projects from Harvest (primary & alt)
        const [pRes, aRes] = await Promise.all([
          (async () => {
            try {
              // Prefer assigned projects (these are what users typically need)
              let arr: any[] = [];
              try {
                const u2 = new URL(
                  "/api/harvest/project-assignments",
                  window.location.origin
                );
                if (uid) u2.searchParams.set("uid", uid);
                const r2 = await fetch(u2.toString(), { cache: "no-store" });
                const j2 = await readJsonSafe(r2);
                if (r2.ok) {
                  arr = Array.isArray(j2?.projects) ? j2.projects : [];
                }
              } catch {}

              // Fallback: list all projects (admins / broader permissions)
              if (arr.length === 0) {
                const u = new URL("/api/harvest/projects", window.location.origin);
                if (uid) u.searchParams.set("uid", uid);
                u.searchParams.set("all", "1");
                u.searchParams.set("active", "0");
                const r = await fetch(u.toString(), { cache: "no-store" });
                const j = await readJsonSafe(r);
                if (r.ok) {
                  arr = Array.isArray(j?.projects) ? j.projects : [];
                }
              }

              if (arr.length > 0) {
                setHarvestProjectsFull(
                  arr
                    .map((p: any) => ({
                      id: String(p?.id || ""),
                      name: String(p?.name || ""),
                      client: p?.client ? String(p.client) : null,
                    }))
                    .filter((p: any) => p.id && p.name)
                );
                const names = Array.from(
                  new Set(arr.map((p: any) => String(p?.name || "")))
                ).filter(Boolean);
                setPrimaryProjects(names);
                const clients = Array.from(
                  new Set(arr.map((p: any) => String(p?.client || "")).filter(Boolean))
                );
                setClientNames((prev) =>
                  Array.from(new Set([...(prev || []), ...clients]))
                );
                // Auto-categorize billable projects: add their client names to billableClientNames
                const billableClients = Array.from(
                  new Set(
                    arr
                      .filter((p: any) => Boolean(p?.is_billable) && p?.client)
                      .map((p: any) => String(p?.client || ""))
                      .filter(Boolean)
                  )
                );
                // Also auto-add "TruePoint Solutions" if found in projects (even if not explicitly billable)
                const truePointFound = clients.some(
                  (c) => c.toLowerCase().includes("truepoint") || c.toLowerCase().includes("true point")
                );
                if (truePointFound && !billableClients.some((c) => c.toLowerCase().includes("truepoint"))) {
                  const truePointClient = clients.find(
                    (c) => c.toLowerCase().includes("truepoint") || c.toLowerCase().includes("true point")
                  );
                  if (truePointClient) billableClients.push(truePointClient);
                }
                if (billableClients.length > 0) {
                  setSettings((s) => ({
                    ...s,
                    billableClientNames: Array.from(
                      new Set([...s.billableClientNames, ...billableClients])
                    ),
                  }));
                }
              }
            } catch {}
          })(),
          (async () => {
            try {
              setAltProjectsError(null);
              const u = new URL("/api/harvest/projects", window.location.origin);
              if (uid) u.searchParams.set("uid", uid);
              u.searchParams.set("conn", "alt");
              u.searchParams.set("all", "1");
              u.searchParams.set("active", "0");
              const r = await fetch(u.toString(), { cache: "no-store" });
              const j = await readJsonSafe(r);
              let arr = Array.isArray(j?.projects) ? j.projects : [];
              if (!r.ok) {
                // Fallback: if user can't list all projects in the comparison org, use project assignments
                try {
                  const u2 = new URL(
                    "/api/harvest/project-assignments",
                    window.location.origin
                  );
                  if (uid) u2.searchParams.set("uid", uid);
                  u2.searchParams.set("conn", "alt");
                  const r2 = await fetch(u2.toString(), { cache: "no-store" });
                  const j2 = await readJsonSafe(r2);
                  if (r2.ok) {
                    arr = Array.isArray(j2?.projects) ? j2.projects : [];
                  } else {
                    setAltProjectsError(
                      j?.error ||
                        j2?.error ||
                        "Failed to load comparison projects from Harvest."
                    );
                  }
                } catch {
                  setAltProjectsError(
                    j?.error || "Failed to load comparison projects from Harvest."
                  );
                }
              }
              if (arr.length > 0) {
                const names = Array.from(
                  new Set(arr.map((p: any) => String(p?.name || "")))
                ).filter(Boolean);
                setAltProjects(names);
                const clients = Array.from(
                  new Set(arr.map((p: any) => String(p?.client || "")).filter(Boolean))
                );
                setClientNames((prev) =>
                  Array.from(new Set([...(prev || []), ...clients]))
                );
                // Auto-categorize billable projects: add their client names to billableClientNames
                const billableClients = Array.from(
                  new Set(
                    arr
                      .filter((p: any) => Boolean(p?.is_billable) && p?.client)
                      .map((p: any) => String(p?.client || ""))
                      .filter(Boolean)
                  )
                );
                // Also auto-add "TruePoint Solutions" if found in projects (even if not explicitly billable)
                const truePointFound = clients.some(
                  (c) => c.toLowerCase().includes("truepoint") || c.toLowerCase().includes("true point")
                );
                if (truePointFound && !billableClients.some((c) => c.toLowerCase().includes("truepoint"))) {
                  const truePointClient = clients.find(
                    (c) => c.toLowerCase().includes("truepoint") || c.toLowerCase().includes("true point")
                  );
                  if (truePointClient) billableClients.push(truePointClient);
                }
                if (billableClients.length > 0) {
                  setSettings((s) => ({
                    ...s,
                    billableClientNames: Array.from(
                      new Set([...s.billableClientNames, ...billableClients])
                    ),
                  }));
                }
              }
            } catch {}
          })(),
        ]);
        void pRes;
        void aRes;
      } catch (e: any) {
        setError(e?.message || "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const uid = readFirebaseAuthUid();
        const projectId = String(settings.meetingHarvestProjectId || "").trim();
        if (!uid || !projectId) {
          setHarvestTasksForMeetingProject([]);
          return;
        }
        const url = new URL("/api/harvest/task-assignments", window.location.origin);
        url.searchParams.set("uid", uid);
        url.searchParams.set("project_id", projectId);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await readJsonSafe(res);
        if (!res.ok) throw new Error(json?.error || "Failed to load tasks");
        const tasks = Array.isArray(json?.tasks) ? json.tasks : [];
        setHarvestTasksForMeetingProject(
          tasks
            .map((t: any) => ({
              id: String(t?.id || ""),
              name: String(t?.name || ""),
              is_active: Boolean(t?.is_active),
            }))
            .filter((t: any) => t.id && t.name)
        );
      } catch {
        setHarvestTasksForMeetingProject([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.meetingHarvestProjectId]);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      const url = new URL("/api/timesheets/settings", window.location.origin);
      const uid = readFirebaseAuthUid();
      if (uid) url.searchParams.set("uid", uid);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) throw new Error(json?.error || "Save failed");
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function addMatchProject() {
    const name = projectInput.trim();
    if (!name) return;
    setSettings((s) => ({
      ...s,
      requireMatchProjectNames: Array.from(new Set([
        ...s.requireMatchProjectNames,
        name,
      ])).slice(0, 200),
    }));
    setProjectInput("");
  }

  function addExcludedProject() {
    const name = excludedInput.trim();
    if (!name) return;
    setSettings((s) => ({
      ...s,
      excludedAltProjectNames: Array.from(new Set([
        ...s.excludedAltProjectNames,
        name,
      ])).slice(0, 200),
    }));
    setExcludedInput("");
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Timesheet Settings</CardTitle>
          <CardDescription>Configure comparison and auto-fix behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <div className="text-sm text-red-600">{error}</div>}

          <section className="space-y-3">
            <div className="font-medium">Billable project matching</div>
            <div className="text-sm text-muted-foreground">
              Add project names that must match between primary and Grayquarter timesheets.
            </div>
            {/* Project pickers from Harvest */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-md p-3 space-y-2">
                <div className="text-sm font-medium">Primary projects</div>
                <Input
                  value={projFilter}
                  onChange={(e) => setProjFilter(e.target.value)}
                  placeholder="Filter projects"
                />
                <div className="max-h-56 overflow-auto space-y-1">
                  {primaryProjects
                    .filter((n) => n.toLowerCase().includes(projFilter.toLowerCase()))
                    .map((name) => {
                      const checked = settings.requireMatchProjectNames.includes(name);
                      return (
                        <label key={name} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v: any) => {
                              toggleMatchProjectBySimilarity({
                                name,
                                isEnabled: Boolean(v),
                              });
                            }}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      );
                    })}
                  {primaryProjects.length === 0 && (
                    <div className="text-xs text-muted-foreground">No projects or not connected.</div>
                  )}
                </div>
              </div>
              <div className="border rounded-md p-3 space-y-2">
                <div className="text-sm font-medium">Grayquarter projects</div>
                <Input
                  value={altFilter}
                  onChange={(e) => setAltFilter(e.target.value)}
                  placeholder="Filter projects"
                />
                {altProjectsError && (
                  <div className="text-xs text-amber-600">{altProjectsError}</div>
                )}
                <div className="max-h-56 overflow-auto space-y-1">
                  {altProjects
                    .filter((n) => n.toLowerCase().includes(altFilter.toLowerCase()))
                    .map((name) => {
                      const checked = settings.requireMatchProjectNames.includes(name);
                      return (
                        <label key={name} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v: any) => {
                              toggleMatchProjectBySimilarity({
                                name,
                                isEnabled: Boolean(v),
                              });
                            }}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      );
                    })}
                  {altProjects.length === 0 && (
                    <div className="text-xs text-muted-foreground">No projects or not connected.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                placeholder="e.g. Client A - Website Redesign"
              />
              <Button onClick={addMatchProject} disabled={!projectInput.trim()}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.requireMatchProjectNames.map((p) => (
                <Badge
                  key={p}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      requireMatchProjectNames: s.requireMatchProjectNames.filter(
                        (x) => x !== p
                      ),
                    }))
                  }
                  title="Click to remove"
                >
                  {p}
                </Badge>
              ))}
              {settings.requireMatchProjectNames.length === 0 && (
                <div className="text-xs text-muted-foreground">None</div>
              )}
            </div>

            {/* Billable clients */}
            <div className="space-y-2 mt-4">
              <div className="font-medium">Billable clients</div>
              <div className="text-sm text-muted-foreground">
                Select client names considered billable. Preselected includes "TruePoint Solutions".
              </div>
              <Input
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                placeholder="Filter clients"
              />
              <div className="max-h-56 overflow-auto space-y-1">
                {clientNames
                  .filter((n) => n.toLowerCase().includes(clientFilter.toLowerCase()))
                  .map((name) => {
                    const checked = (settings.billableClientNames || []).includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v: any) => {
                            const on = Boolean(v);
                            setSettings((s) => ({
                              ...s,
                              billableClientNames: on
                                ? Array.from(new Set([...(s.billableClientNames || []), name]))
                                : (s.billableClientNames || []).filter((x) => x !== name),
                            }));
                          }}
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    );
                  })}
                {clientNames.length === 0 && (
                  <div className="text-xs text-muted-foreground">No clients found or not connected.</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Match tolerance (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.matchToleranceMinutes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      matchToleranceMinutes: Math.max(0, Number(e.target.value || 0)),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Daily target hours</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  value={settings.dailyTargetHours}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      dailyTargetHours: Math.max(0, Number(e.target.value || 0)),
                    }))
                  }
                />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="font-medium">Non‑billable projects (exclude from Grayquarter)</div>
            <div className="text-sm text-muted-foreground">
              Entries under these project names do not need to exist in Grayquarter.
            </div>
            <div className="flex gap-2">
              <Input
                value={excludedInput}
                onChange={(e) => setExcludedInput(e.target.value)}
                placeholder="e.g. Internal, Administrative"
              />
              <Button onClick={addExcludedProject} disabled={!excludedInput.trim()}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.excludedAltProjectNames.map((p) => (
                <Badge
                  key={p}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      excludedAltProjectNames: s.excludedAltProjectNames.filter(
                        (x) => x !== p
                      ),
                    }))
                  }
                  title="Click to remove"
                >
                  {p}
                </Badge>
              ))}
              {settings.excludedAltProjectNames.length === 0 && (
                <div className="text-xs text-muted-foreground">None</div>
              )}
            </div>
            {/* Alt project picker for exclusions */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="text-sm font-medium">Pick from Grayquarter projects</div>
              <div className="max-h-56 overflow-auto space-y-1">
                {altProjects.map((name) => {
                  const checked = settings.excludedAltProjectNames.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v: any) => {
                          const on = Boolean(v);
                          setSettings((s) => ({
                            ...s,
                            excludedAltProjectNames: on
                              ? Array.from(new Set([...s.excludedAltProjectNames, name]))
                              : s.excludedAltProjectNames.filter((x) => x !== name),
                          }));
                        }}
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  );
                })}
                {altProjects.length === 0 && (
                  <div className="text-xs text-muted-foreground">No projects or not connected.</div>
                )}
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="font-medium">Auto‑fixing</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Enable auto‑fix</div>
                  <div className="text-xs text-muted-foreground">
                    Allow the system to normalize time entries to the specified increment.
                  </div>
                </div>
                <Switch
                  checked={settings.autoFixEnabled}
                  onCheckedChange={(v) =>
                    setSettings((s) => ({ ...s, autoFixEnabled: Boolean(v) }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Run on fetch</div>
                  <div className="text-xs text-muted-foreground">
                    Automatically apply auto‑fix after loading entries.
                  </div>
                </div>
                <Switch
                  checked={settings.autoFixOnFetch}
                  onCheckedChange={(v) =>
                    setSettings((s) => ({ ...s, autoFixOnFetch: Boolean(v) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Increment (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={settings.autoFixIncrementMinutes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      autoFixIncrementMinutes: Math.max(1, Number(e.target.value || 15)),
                    }))
                  }
                />
                <div className="text-xs text-muted-foreground">
                  Common values: 5, 10, 12, 15, 20, 30, 60
                </div>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="font-medium">Calendar → Harvest (meetings)</div>
            <div className="text-sm text-muted-foreground">
              Choose where your Microsoft/Teams meetings should be posted in Harvest when you
              use the “Post meetings” button on the Timesheets page.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Harvest project</Label>
                <Select
                  value={String(settings.meetingHarvestProjectId || "")}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      meetingHarvestProjectId: String(v || ""),
                      // Reset task when project changes
                      meetingHarvestTaskId: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {harvestProjectsFull.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.client ? ` — ${p.client}` : ""}
                      </SelectItem>
                    ))}
                    {harvestProjectsFull.length === 0 && (
                      <SelectItem value="__none__" disabled>
                        No projects (connect Harvest first)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Harvest task</Label>
                <Select
                  value={String(settings.meetingHarvestTaskId || "")}
                  onValueChange={(v) =>
                    setSettings((s) => ({ ...s, meetingHarvestTaskId: String(v || "") }))
                  }
                  disabled={!String(settings.meetingHarvestProjectId || "").trim()}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        String(settings.meetingHarvestProjectId || "").trim()
                          ? "Select a task"
                          : "Select a project first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {harvestTasksForMeetingProject
                      .filter((t) => t.is_active !== false)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    {String(settings.meetingHarvestProjectId || "").trim() &&
                      harvestTasksForMeetingProject.length === 0 && (
                        <SelectItem value="__none__" disabled>
                          No tasks found for this project
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="font-medium">Alerts</div>
            <div className="text-sm text-muted-foreground">
              When billable timesheets don’t match between Primary and Grayquarter, AxonAI can email you
              a link to approve the suggested fixes.
            </div>
            <div className="space-y-1.5 max-w-xl">
              <Label>Notification email</Label>
              <Input
                value={String(settings.notificationEmail || "")}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, notificationEmail: e.target.value }))
                }
                placeholder="you@company.com"
              />
            </div>
          </section>

          <div className="flex justify-end">
            <Button onClick={save} disabled={loading || saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

