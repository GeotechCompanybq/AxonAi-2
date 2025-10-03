export interface NormalizedTask {
  id: string;
  source: "jira" | "monday";
  teamId: string;
  projectKey?: string;
  title: string;
  status?: string;
  priority?: string;
  estimateHours?: number;
  spentHours?: number;
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  assignee: {
    id?: string;
    email?: string;
    name?: string;
  };
}

export interface MemberMetrics {
  memberKey: string;
  openCount: number;
  dueSoonCount: number;
  totalEstimate: number;
  totalSpent: number;
  loadIndex: number;
  burnoutRisk: number; // 0..1
}

export function computeMetrics(
  tasks: NormalizedTask[],
  now = Date.now()
): MemberMetrics[] {
  const by: Record<string, NormalizedTask[]> = {};
  for (const t of tasks) {
    const key = t.assignee.email || t.assignee.id || "unassigned";
    (by[key] ??= []).push(t);
  }
  return Object.entries(by).map(([memberKey, list]) => {
    const open = list.filter(
      (t) => !/done|closed|resolved/i.test(t.status || "")
    );
    const dueSoon = open.filter((t) => t.dueAt && t.dueAt - now <= 5 * 864e5);
    const totalEstimate = open.reduce((s, t) => s + (t.estimateHours || 0), 0);
    const totalSpent = open.reduce((s, t) => s + (t.spentHours || 0), 0);
    const loadIndex = totalEstimate - totalSpent + dueSoon.length * 2;
    const maxRef = 40;
    const burnoutRaw =
      open.length * 0.1 + totalEstimate / maxRef + dueSoon.length * 0.15;
    const burnoutRisk = Math.max(0, Math.min(1, burnoutRaw / 2));
    return {
      memberKey,
      openCount: open.length,
      dueSoonCount: dueSoon.length,
      totalEstimate,
      totalSpent,
      loadIndex,
      burnoutRisk,
    };
  });
}

export function computeBalanceScore(metrics: MemberMetrics[]): number {
  if (!metrics.length) return 1;
  const loads = metrics.map((m) => m.loadIndex);
  const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((a, l) => a + (l - avg) ** 2, 0) / loads.length;
  const std = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - Math.min(std / 10, 1)));
}

