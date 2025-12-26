export type HarvestEntry = {
  id: number | string;
  spent_date: string; // YYYY-MM-DD
  hours: number;
  notes?: string | null;
  project?: {
    id?: number | string;
    name?: string | null;
    is_billable?: boolean;
    client?: { name?: string | null } | null;
  } | null;
  task?: { id?: number | string; name?: string | null } | null;
};

export type MatchSettings = {
  billableClientNames: string[];
  matchToleranceMinutes: number;
  // Direction: make secondary match primary (default)
  sourceOfTruth?: "primary" | "secondary";
};

export type MismatchAction =
  | {
      kind: "create_entry";
      targetConn: "primary" | "alt";
      spent_date: string;
      hours: number;
      notes: string;
      projectName: string;
      taskName: string;
      // resolved IDs
      project_id?: number;
      task_id?: number;
      // provenance
      sourceEntryId?: string;
    }
  | {
      kind: "update_entry";
      targetConn: "primary" | "alt";
      entryId: string;
      hours?: number;
      notes?: string;
      sourceEntryId?: string;
    };

export type TimesheetMismatch = {
  id: string;
  spent_date: string;
  projectKey: string;
  projectPrimary?: string;
  projectAlt?: string;
  reason:
    | "missing_in_secondary"
    | "missing_in_primary"
    | "hours_mismatch"
    | "notes_mismatch";
  primaryEntry?: HarvestEntry;
  altEntry?: HarvestEntry;
  suggestedActions: MismatchAction[];
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

export function normalizeProjectName(name: string): string {
  const raw = String(name || "").toLowerCase();
  const noBrackets = raw.replace(/\[[^\]]*\]/g, " ");
  const noParens = noBrackets.replace(/\([^)]*\)/g, " ");
  const noIds = noParens
    .replace(/\bpo\b/g, " ")
    .replace(/\bfy\d{2,4}\b/g, " ")
    .replace(/\bp\d{6,}\b/g, " ")
    .replace(/\b\d{2,4}\/\d{2,4}\/\d{2,4}\b/g, " ")
    .replace(/\b\d{2,4}-\d{2,4}\b/g, " ");
  const noNums = noIds.replace(/\b\d+\b/g, " ");
  return noNums.replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isBillableEntry({
  entry,
  billableClientNames,
}: {
  entry: HarvestEntry;
  billableClientNames: string[];
}): boolean {
  const isBillable = Boolean(entry?.project?.is_billable);
  if (isBillable) return true;
  const client = String(entry?.project?.client?.name || "").toLowerCase().trim();
  if (!client) return false;
  const set = (billableClientNames || []).map((x) => String(x).toLowerCase().trim());
  return set.some((c) => c && client.includes(c));
}

function hoursDeltaMinutes(a: number, b: number): number {
  return Math.round(Math.abs((Number(a) || 0) - (Number(b) || 0)) * 60);
}

function stableId(parts: string[]): string {
  // Short deterministic id, ok for UI keys + Mongo upserts
  const raw = parts.join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `mm_${hash.toString(16)}`;
}

export function detectBillableMismatches({
  primaryEntries,
  altEntries,
  from,
  to,
  settings,
}: {
  primaryEntries: HarvestEntry[];
  altEntries: HarvestEntry[];
  from: string;
  to: string;
  settings: MatchSettings;
}): TimesheetMismatch[] {
  const now = new Date().toISOString();
  const source = settings.sourceOfTruth || "primary";
  const tolerance = Math.max(0, Number(settings.matchToleranceMinutes || 0));
  const billableClientNames = settings.billableClientNames || [];

  // Filter billable only
  const p = (primaryEntries || []).filter((e) =>
    isBillableEntry({ entry: e, billableClientNames })
  );
  const a = (altEntries || []).filter((e) =>
    isBillableEntry({ entry: e, billableClientNames })
  );

  // Index by date + normalized project
  const keyOf = (e: HarvestEntry) =>
    `${String(e.spent_date || "")}|${normalizeProjectName(String(e.project?.name || ""))}`;

  const pByKey = new Map<string, HarvestEntry[]>();
  const aByKey = new Map<string, HarvestEntry[]>();
  for (const e of p) {
    const k = keyOf(e);
    if (!pByKey.has(k)) pByKey.set(k, []);
    pByKey.get(k)!.push(e);
  }
  for (const e of a) {
    const k = keyOf(e);
    if (!aByKey.has(k)) aByKey.set(k, []);
    aByKey.get(k)!.push(e);
  }

  const allKeys = new Set<string>([...pByKey.keys(), ...aByKey.keys()]);
  const out: TimesheetMismatch[] = [];

  for (const key of allKeys) {
    const pList = (pByKey.get(key) || []).slice();
    const aList = (aByKey.get(key) || []).slice();
    // Greedy matching by closest hours
    const usedAlt = new Set<number>();
    for (const pe of pList) {
      let bestIdx = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let i = 0; i < aList.length; i++) {
        if (usedAlt.has(i)) continue;
        const delta = hoursDeltaMinutes(Number(pe.hours || 0), Number(aList[i].hours || 0));
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }

      const projectKey = key.split("|")[1] || "";
      const spent_date = String(pe.spent_date || "");
      const mmId = stableId([spent_date, projectKey, String(pe.id || "")]);

      if (bestIdx === -1) {
        // No corresponding alt entry → suggest create on alt (primary is source)
        const action: MismatchAction = {
          kind: "create_entry",
          targetConn: "alt",
          spent_date,
          hours: Number(pe.hours || 0),
          notes: String(pe.notes || ""),
          projectName: String(pe.project?.name || ""),
          taskName: String(pe.task?.name || ""),
          sourceEntryId: String(pe.id || ""),
        };
        out.push({
          id: mmId,
          spent_date,
          projectKey,
          projectPrimary: String(pe.project?.name || ""),
          projectAlt: undefined,
          reason: "missing_in_secondary",
          primaryEntry: pe,
          altEntry: undefined,
          suggestedActions: source === "primary" ? [action] : [],
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      usedAlt.add(bestIdx);
      const ae = aList[bestIdx];

      // Hours mismatch
      if (bestDelta > tolerance) {
        const action: MismatchAction = {
          kind: "update_entry",
          targetConn: source === "primary" ? "alt" : "primary",
          entryId: String(source === "primary" ? ae.id : pe.id),
          hours: Number(source === "primary" ? pe.hours : ae.hours),
          sourceEntryId: String(source === "primary" ? pe.id : ae.id),
        };
        out.push({
          id: mmId,
          spent_date,
          projectKey,
          projectPrimary: String(pe.project?.name || ""),
          projectAlt: String(ae.project?.name || ""),
          reason: "hours_mismatch",
          primaryEntry: pe,
          altEntry: ae,
          suggestedActions: [action],
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }
    }

    // Extra alt entries not matched to any primary entry (flag only; no auto-delete)
    for (let i = 0; i < aList.length; i++) {
      if (usedAlt.has(i)) continue;
      const ae = aList[i];
      const projectKey = key.split("|")[1] || "";
      const spent_date = String(ae.spent_date || "");
      const mmId = stableId([spent_date, projectKey, String(ae.id || ""), "alt_extra"]);
      out.push({
        id: mmId,
        spent_date,
        projectKey,
        projectPrimary: undefined,
        projectAlt: String(ae.project?.name || ""),
        reason: "missing_in_primary",
        primaryEntry: undefined,
        altEntry: ae,
        suggestedActions: [], // no automatic action; requires manual decision
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Final sort
  out.sort((x, y) =>
    x.spent_date === y.spent_date
      ? (x.projectPrimary || x.projectAlt || "").localeCompare(
          y.projectPrimary || y.projectAlt || ""
        )
      : x.spent_date.localeCompare(y.spent_date)
  );
  return out;
}


