"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { IconSpinner } from "@/components/icons";
import { MobileTabBar } from "@/components/layout/mobile-tabbar";
import { AIActionButton } from "@/components/layout/ai-action-button";
import { FloatingChatBot } from "@/components/chat/floating-chatbot";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    // You can show a loading spinner here or a minimal layout
    // For now, showing a spinner until auth state is resolved or user is redirected
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <IconSpinner className="h-10 w-10 text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
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
        {/* Mobile-only nav and AI action */}
        <AIActionButton />
        <MobileTabBar />
        <FloatingChatBot />
      </SidebarInset>
    </SidebarProvider>
  );
}
