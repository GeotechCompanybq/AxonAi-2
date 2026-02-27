"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SyncLogsPage() {
  const searchParams = useSearchParams();
  const source = searchParams?.get("source") || "all";

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Sync Logs</CardTitle>
          <CardDescription>
            View recent sync activity for your integrations. Detailed logs will be added here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Selected source: <span className="font-medium">{source}</span>
          </p>
          <p>
            For now this page is a placeholder so that the{" "}
            <span className="font-medium">View Sync Logs</span> link on your
            integration cards has a destination. We can wire it up to real sync
            history next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

