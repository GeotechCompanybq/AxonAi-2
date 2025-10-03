"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { IconSpinner } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

export default function OrgOnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setOrgId } = useCurrentOrgId();
  const [orgName, setOrgName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.uid || !orgName.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const idToken = await (
        await import("firebase/auth")
      ).getIdToken((await import("@/lib/firebase")).auth.currentUser!);
      const res = await fetch("/api/orgs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orgName: orgName.trim(), ownerUid: user.uid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create org");
      setOrgId(json.orgId);
      router.replace("/org/dashboard?orgId=" + encodeURIComponent(json.orgId));
    } catch (e: any) {
      setError(e.message || "Failed to create org");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-10">
      <Card>
        <CardHeader>
          <CardTitle>Set up your Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div>
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme Inc"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            {error && <div className="text-sm text-red-500">{error}</div>}
            <Button type="submit" disabled={isSubmitting || !orgName.trim()}>
              {isSubmitting ? (
                <>
                  <IconSpinner className="h-4 w-4" /> Creating...
                </>
              ) : (
                "Create Organization"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
