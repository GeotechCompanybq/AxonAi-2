"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconSpinner } from "@/components/ui/icon-spinner";

type Status = "idle" | "linking" | "success" | "error";

export default function TeamsLinkPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { orgId } = useCurrentOrgId();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const runLink = useCallback(async () => {
    if (!searchParams || !user) return;

    const tenantId = searchParams.get("tenantId") || "";
    const teamsUserId = searchParams.get("userId") || "";
    const orgIdFromQuery = searchParams.get("orgId") || orgId || "";

    if (!tenantId || !teamsUserId || !orgIdFromQuery) {
      setError(
        "Missing Teams identifiers or org. Open this link from Microsoft Teams with an active Axon organization."
      );
      setStatus("error");
      return;
    }

    try {
      setStatus("linking");
      setError(null);
      const { getIdToken } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");
      const idToken = await getIdToken(auth.currentUser!);

      const res = await fetch("/api/teams/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ tenantId, teamsUserId, orgId: orgIdFromQuery }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to link Teams account");
      }

      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "Failed to link Teams account"
      );
    }
  }, [orgId, searchParams, user]);

  useEffect(() => {
    if (!user || !searchParams) return;
    if (status === "idle") {
      void runLink();
    }
  }, [runLink, searchParams, status, user]);

  const renderBody = () => {
    if (!user) {
      return (
        <p className="text-sm text-muted-foreground">
          Please sign in to Axon in this browser, then refresh this page to link
          your Microsoft Teams account.
        </p>
      );
    }

    if (status === "linking" || status === "idle") {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconSpinner className="h-4 w-4" />
          <span>Linking your Microsoft Teams user to Axon…</span>
        </div>
      );
    }

    if (status === "success") {
      return (
        <p className="text-sm text-muted-foreground">
          Your Microsoft Teams user is now linked to this Axon account and
          organization. You can return to Teams and use commands like{" "}
          <strong>plan today</strong>.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          We couldn&apos;t complete the link.
        </p>
        {error ? (
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-10 max-w-xl">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            Link Microsoft Teams to Axon
          </CardTitle>
        </CardHeader>
        <CardContent>{renderBody()}</CardContent>
      </Card>
    </div>
  );
}

