"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogoImg } from "@/components/icons";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { OrgSidebarNav } from "./org-sidebar-nav";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import { cn } from "@/lib/utils";

export function OrgSidebar() {
  const { user, logout } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const { orgId } = useCurrentOrgId();
  const pathname = usePathname();
  const router = useRouter();

  const initials =
    (user?.displayName?.trim()?.[0] || user?.email?.trim()?.[0] || "A").toUpperCase();

  const goPersonalWorkspace = () => {
    router.push("/dashboard");
  };

  const goOrgWorkspace = () => {
    const base = "/org/dashboard";
    const url =
      orgId && !pathname?.includes("onboarding")
        ? `${base}?orgId=${encodeURIComponent(orgId)}`
        : base;
    router.push(url);
  };

  const isOrgWorkspace = pathname?.startsWith("/org");

  return (
    <Sidebar
      collapsible="icon"
      side="left"
      variant="floating"
      className="border-sidebar-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_20px_80px_rgba(0,0,0,0.4)]"
    >
      <SidebarRail />
      <SidebarHeader className="p-4 md:p-2 md:bg-transparent">
        <div className="flex items-center justify-between gap-2">
          <Link href="/org/dashboard" className="block md:hidden">
            <LogoImg className="h-10 w-auto" />
            <span className="sr-only">Axon Org</span>
          </Link>
          <Link
            href="/org/dashboard"
            className="hidden md:block group-data-[collapsible=icon]:hidden"
          >
            <LogoImg className="h-12 w-auto" />
          </Link>
          {/* Icon when collapsed */}
          <Link href="/org/dashboard" className="hidden group-data-[collapsible=icon]:block">
            <Image
              src="/favicon.png"
              alt="Axon"
              width={28}
              height={28}
              className="rounded-lg"
            />
          </Link>

          {/* Compact mode toggle (desktop) */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleSidebar}
            className="hidden md:inline-flex rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:shadow-[0_0_0_1px_hsl(var(--ring)/0.25),0_0_24px_hsl(var(--ring)/0.18)]"
            aria-label={state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"}
            title={state === "collapsed" ? "Expand" : "Collapse"}
          >
            {state === "collapsed" ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-center group-data-[collapsible=icon]:hidden">
          <div className="inline-flex items-center rounded-2xl bg-white/5 p-1 text-xs shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <button
              type="button"
              onClick={goPersonalWorkspace}
              className={cn(
                "px-3 py-1.5 rounded-xl transition text-xs",
                !isOrgWorkspace
                  ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(56,189,248,0.6)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={goOrgWorkspace}
              className={cn(
                "px-3 py-1.5 rounded-xl transition text-xs",
                isOrgWorkspace
                  ? "bg-slate-900/80 text-slate-50 shadow-[0_0_20px_rgba(15,23,42,0.8)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Organization
            </button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-0">
        <OrgSidebarNav />
      </SidebarContent>
      {user && (
        <SidebarFooter className="p-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
              <Avatar className="h-9 w-9 ring-1 ring-white/10 shadow-[0_0_24px_rgba(0,212,255,0.15)]">
                <AvatarImage
                  src={user.photoURL || "https://placehold.co/64x64.png"}
                  alt={user.displayName || user.email || "User"}
                />
                <AvatarFallback className="bg-white/10 text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-medium">
                  {user.displayName || "Axon User"}
                </div>
                {user.email ? (
                  <div className="truncate text-xs text-muted-foreground/90">
                    {user.email}
                  </div>
                ) : null}
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start rounded-xl hover:bg-white/10 group-data-[collapsible=icon]:justify-center"
              onClick={logout}
            >
              <LogOut className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7" />
              <span className="group-data-[collapsible=icon]:hidden">Log out</span>
            </Button>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
