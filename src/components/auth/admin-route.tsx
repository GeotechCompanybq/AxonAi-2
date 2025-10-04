"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { IconSpinner } from "@/components/icons";

export default function AdminRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useRole();
  const router = useRouter();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IconSpinner className="h-10 w-10 text-primary" />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  if (!isAdmin) {
    // Keep the user on their current page rather than forcing a dashboard redirect.
    return null;
  }

  return <>{children}</>;
}
