"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";

export function MondayConnect() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const connect = useCallback(async () => {
    const url = new URL("/api/monday/auth", window.location.origin);
    window.location.href = url.toString();
  }, [user]);

  const pullAndPlan = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const tasksRes = await fetch(`/api/monday/tasks`);
      const tasksJson = await tasksRes.json();
      if (!tasksRes.ok) throw new Error(tasksJson.error || "not_connected");
      // Reuse existing AI analysis to generate a weekly plan/usage
      const today = new Date().toISOString().slice(0, 10);
      const aiRes = await fetch("/api/ai/plan-from-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: tasksJson.tasks, currentDate: today }),
      });
      const aiJson = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiJson.error || "ai_failed");
      setStatus("Plan generated. Check your dashboard/analytics.");
    } catch (e: any) {
      setStatus(e.message || "Failed to fetch tasks or plan");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return (
    <Card>
      <CardContent className="py-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Monday.com</div>
            <div className="text-xs text-muted-foreground">
              Connect to pull tasks and plan with AI
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} variant="outline">
              Connect
            </Button>
            <Button onClick={pullAndPlan} disabled={isLoading}>
              {isLoading ? (
                <>
                  <IconSpinner className="h-4 w-4" /> Generating...
                </>
              ) : (
                "Pull & Plan"
              )}
            </Button>
          </div>
        </div>
        {status && (
          <div className="text-xs text-muted-foreground">{status}</div>
        )}
      </CardContent>
    </Card>
  );
}
