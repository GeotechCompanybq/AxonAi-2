import type { Task } from "@/types";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isOverdue(task: Task, todayYmd: string): boolean {
  if (!task.dueDate) return false;
  const due = String(task.dueDate).slice(0, 10);
  return Boolean(due && due < todayYmd && task.status !== "done");
}

function isDueSoon(task: Task, today: Date, days: number): boolean {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const diffMs = due.getTime() - today.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days && task.status !== "done";
}

export function computeEfficiencyScoreLocal(tasks: Task[], todayYmd: string) {
  const total = tasks.length;
  if (total === 0) {
    return {
      score: 0,
      message: "No tasks available to calculate efficiency.",
      improvementSuggestion: "Add tasks to start tracking progress.",
    };
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const overdue = tasks.filter((t) => isOverdue(t, todayYmd));
  const overdueHigh = overdue.filter((t) => t.priority === "high").length;

  // Base score: completion rate
  let score = (done / total) * 100;
  // Penalties
  score -= overdue.length * 10;
  score -= overdueHigh * 10; // extra penalty on top of overdue
  score -= blocked * 2;
  // Small bonus for completed high priority work
  const doneHigh = tasks.filter((t) => t.status === "done" && t.priority === "high").length;
  score += Math.min(10, doneHigh * 2);

  score = clamp(Math.round(score), 0, 100);

  let message = "Good progress.";
  let improvementSuggestion: string | undefined;
  let positiveFeedback: string | undefined;

  if (score >= 85) {
    message = "Excellent work — you’re staying on top of tasks.";
    positiveFeedback = doneHigh > 0 ? "Great job completing high‑priority items." : "Great consistency.";
  } else if (score >= 60) {
    message = overdue.length
      ? "Good progress, but some tasks are overdue."
      : "Good progress — keep the momentum.";
    improvementSuggestion = overdue.length
      ? "Focus on clearing overdue tasks first."
      : "Keep pushing high‑priority tasks to done.";
  } else {
    message = overdue.length
      ? "Needs attention — several tasks are overdue."
      : "Needs improvement — too many tasks are still open.";
    improvementSuggestion = overdue.length
      ? "Triage overdue items and reduce your active load."
      : "Pick 1–2 key tasks and finish them before starting new ones.";
  }

  return { score, message, positiveFeedback, improvementSuggestion };
}

export function computeBurnoutRiskLocal(tasks: Task[], today: Date, todayYmd: string) {
  if (tasks.length === 0) {
    return {
      riskLevel: "low" as const,
      progressValue: 10,
      message: "No tasks to analyze. Enjoy your free time!",
      contributingFactors: ["No active workload detected"],
    };
  }

  const active = tasks.filter((t) => t.status !== "done");
  const overdue = active.filter((t) => isOverdue(t, todayYmd));
  const dueSoon = active.filter((t) => isDueSoon(t, today, 3));
  const highPriority = active.filter((t) => t.priority === "high");
  const blocked = active.filter((t) => t.status === "blocked");

  // Heuristic risk score
  const raw =
    active.length * 5 +
    overdue.length * 12 +
    dueSoon.length * 4 +
    highPriority.length * 6 +
    blocked.length * 3;

  const progressValue = clamp(Math.round(raw), 10, 95);
  const riskLevel =
    progressValue >= 70 ? ("high" as const) : progressValue >= 40 ? ("medium" as const) : ("low" as const);

  const factors: string[] = [];
  if (overdue.length) factors.push(`${overdue.length} overdue task(s)`);
  if (dueSoon.length) factors.push(`${dueSoon.length} due soon (≤3 days)`);
  if (highPriority.length) factors.push(`${highPriority.length} high‑priority active`);
  if (blocked.length) factors.push(`${blocked.length} blocked`);
  if (!factors.length) factors.push("Manageable workload");

  const message =
    riskLevel === "low"
      ? "You’re maintaining a healthy workload. Keep taking short breaks."
      : riskLevel === "medium"
      ? "Your workload is getting heavy. Consider prioritizing and taking breaks."
      : "High risk of burnout. Reduce scope, defer non‑essential work, and rest.";

  return { riskLevel, progressValue, message, contributingFactors: factors };
}




