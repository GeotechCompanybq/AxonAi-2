"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function OrgLoginPage() {
  const router = useRouter();
  const { user, signInWithGoogle, isLoading } = useAuth();

  async function handleLogin() {
    try {
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("postLoginRedirect", "/org/dashboard");
        } catch {}
      }
      if (!user) await signInWithGoogle();
      router.replace("/org/dashboard");
    } finally {
      // no-op
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to your Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This login is for organization admins and team managers. You’ll
            access org-wide analytics, integrations, and member management.
          </p>
          <Button className="w-full" disabled={isLoading} onClick={handleLogin}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
