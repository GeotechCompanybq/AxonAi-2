"use client";

import React, { useEffect, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconSpinner } from "@/components/icons";
import { OrgSidebar } from "@/components/layout/org-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileTabBar } from "@/components/layout/mobile-tabbar";
import { AIActionButton } from "@/components/layout/ai-action-button";
import { FloatingChatBot } from "@/components/chat/floating-chatbot";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";

function OrgLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { orgId } = useCurrentOrgId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgIdFromQuery = searchParams?.get("orgId");

  // Redirects must occur in effects, not during render
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (
      !isLoading &&
      user &&
      !orgId &&
      !orgIdFromQuery &&
      pathname !== "/org/onboarding"
    ) {
      router.replace("/org/onboarding");
    }
  }, [isLoading, user, orgId, orgIdFromQuery, pathname, router]);

  if (
    isLoading ||
    !user ||
    (!orgId && !orgIdFromQuery && pathname !== "/org/onboarding")
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IconSpinner className="h-10 w-10 text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <OrgSidebar />
      <SidebarInset className="flex flex-col min-h-screen ai-grid-bg">
        <AppHeader />
        <main
          className="flex-1 p-4 md:p-8 overflow-auto pb-28 md:pb-8"
          style={{
            paddingBottom:
              "max(128px, calc(env(safe-area-inset-bottom) + 104px))",
          }}
        >
          {children}
        </main>
        <AIActionButton />
        <MobileTabBar />
        <FloatingChatBot />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <IconSpinner className="h-10 w-10 text-primary" />
        </div>
      }
    >
      <OrgLayoutInner>{children}</OrgLayoutInner>
    </Suspense>
  );
}
