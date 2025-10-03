"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { IconSpinner } from "@/components/icons";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

type Metrics = Record<string, number>;

export default function OrgAnalyticsPage() {
  const { orgId } = useCurrentOrgId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orgs/${orgId}/analytics`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load analytics");
        if (!ignore) {
          setMetrics(json.metrics || null);
          setBalance(typeof json.balance === "number" ? json.balance : null);
        }
      } catch (e: any) {
        if (!ignore) setError(e.message || "Failed to load analytics");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [orgId]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          {!orgId && (
            <div className="text-sm text-muted-foreground">
              Select an organization to view team-wide analytics.
            </div>
          )}
          {orgId && loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconSpinner className="h-4 w-4" /> Loading analytics...
            </div>
          )}
          {orgId && error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          {orgId && !loading && !error && metrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(metrics).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">{key}</div>
                  <div className="text-2xl font-bold">{value}</div>
                </div>
              ))}
              {typeof balance === "number" && (
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Balance Score
                  </div>
                  <div className="text-2xl font-bold">{balance}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
