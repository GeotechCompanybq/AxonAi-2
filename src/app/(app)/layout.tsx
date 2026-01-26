"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
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
    <div className="flex min-h-screen ai-grid-bg">
      {/* Always visible sidebar on desktop */}
      <aside className="hidden md:flex w-72 flex-shrink-0">
        <AppSidebar />
      </aside>
      
      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader />
        {/* Expose uid globally for API routes that need uid query param */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__AXON_UID__ = ${JSON.stringify(user.uid)};`,
          }}
        />
        <main className="flex-1 p-4 md:p-8 overflow-auto pb-28 md:pb-8">
          {children}
        </main>
      </div>
      
      {/* Mobile-only nav and AI action */}
      <AIActionButton />
      <MobileTabBar />
      <FloatingChatBot />
    </div>
  );
}
