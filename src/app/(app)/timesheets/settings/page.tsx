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

type Settings = {
  requireMatchProjectNames: string[];
  excludedAltProjectNames: string[];
  matchToleranceMinutes: number;
  dailyTargetHours: number;
  autoFixEnabled: boolean;
  autoFixIncrementMinutes: number;
  autoFixOnFetch: boolean;
};

const DEFAULTS: Settings = {
  requireMatchProjectNames: [],
  excludedAltProjectNames: [],
  matchToleranceMinutes: 5,
  dailyTargetHours: 8,
  autoFixEnabled: true,
  autoFixIncrementMinutes: 15,
  autoFixOnFetch: true,
};

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

export default function TimesheetSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectInput, setProjectInput] = useState("");
  const [excludedInput, setExcludedInput] = useState("");
  const [primaryProjects, setPrimaryProjects] = useState<string[]>([]);
  const [altProjects, setAltProjects] = useState<string[]>([]);
  const [projFilter, setProjFilter] = useState("");
  const [altFilter, setAltFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const url = new URL("/api/timesheets/settings", window.location.origin);
        const uid = readFirebaseAuthUid();
        if (uid) url.searchParams.set("uid", uid);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await res.json();
        setSettings({
          requireMatchProjectNames: json.requireMatchProjectNames || [],
          excludedAltProjectNames: json.excludedAltProjectNames || [],
          matchToleranceMinutes: Number(json.matchToleranceMinutes || 5),
          dailyTargetHours: Number(json.dailyTargetHours || 8),
          autoFixEnabled: Boolean(json.autoFixEnabled),
          autoFixIncrementMinutes: Number(json.autoFixIncrementMinutes || 15),
          autoFixOnFetch: Boolean(json.autoFixOnFetch),
        });
        // Fetch projects from Harvest (primary & alt)
        const [pRes, aRes] = await Promise.all([
          (async () => {
            try {
              const u = new URL("/api/harvest/projects", window.location.origin);
              if (uid) u.searchParams.set("uid", uid);
              u.searchParams.set("all", "1");
              const r = await fetch(u.toString(), { cache: "no-store" });
              const j = await r.json();
              if (r.ok) {
                const names = Array.from(
                  new Set((Array.isArray(j?.projects) ? j.projects : []).map((p: any) => String(p?.name || "")))
                ).filter(Boolean);
                setPrimaryProjects(names);
              }
            } catch {}
          })(),
          (async () => {
            try {
              const u = new URL("/api/harvest/projects", window.location.origin);
              if (uid) u.searchParams.set("uid", uid);
              u.searchParams.set("conn", "alt");
              u.searchParams.set("all", "1");
              const r = await fetch(u.toString(), { cache: "no-store" });
              const j = await r.json();
              if (r.ok) {
                const names = Array.from(
                  new Set((Array.isArray(j?.projects) ? j.projects : []).map((p: any) => String(p?.name || "")))
                ).filter(Boolean);
                setAltProjects(names);
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
      const json = await res.json();
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
                              const on = Boolean(v);
                              setSettings((s) => ({
                                ...s,
                                requireMatchProjectNames: on
                                  ? Array.from(new Set([...s.requireMatchProjectNames, name]))
                                  : s.requireMatchProjectNames.filter((x) => x !== name),
                              }));
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
                              const on = Boolean(v);
                              setSettings((s) => ({
                                ...s,
                                requireMatchProjectNames: on
                                  ? Array.from(new Set([...s.requireMatchProjectNames, name]))
                                  : s.requireMatchProjectNames.filter((x) => x !== name),
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

