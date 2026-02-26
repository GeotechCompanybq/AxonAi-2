"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogoImg, IconSpinner } from "@/components/icons";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { OrgSidebarNav } from "./org-sidebar-nav";
import { useCurrentOrgId } from "@/hooks/use-current-org-id";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

export function OrgSidebar() {
  const { user, logout } = useAuth();
  const { orgId, setOrgId } = useCurrentOrgId();
  const pathname = usePathname();
  const router = useRouter();

  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!orgId) {
      setOrgName(null);
      return;
    }
    let ignore = false;
    setOrgLoading(true);
    setOrgError(null);
    (async () => {
      try {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/integrations`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to load organisation");
        }
        if (!ignore) {
          setOrgName(json.org?.name || "Untitled organisation");
        }
      } catch (e: any) {
        if (!ignore) {
          setOrgError(e?.message || "Failed to load organisation");
        }
      } finally {
        if (!ignore) {
          setOrgLoading(false);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [orgId]);

  const handleCreateOrg = useCallback(async () => {
    if (!user?.uid) return;
    const name = window.prompt("Organisation name");
    if (!name) return;
    try {
      setOrgLoading(true);
      setOrgError(null);
      const res = await fetch("/api/orgs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName: name.trim(), ownerUid: user.uid }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create organisation");
      }
      const newOrgId = String(json.orgId);
      setOrgId(newOrgId);
      setOrgName(name.trim());
      router.push(`/org/dashboard?orgId=${encodeURIComponent(newOrgId)}`);
    } catch (e: any) {
      setOrgError(e?.message || "Failed to create organisation");
    } finally {
      setOrgLoading(false);
    }
  }, [router, setOrgId, user?.uid]);

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
        </div>

        <div className="mt-4 flex flex-col gap-3 group-data-[collapsible=icon]:hidden">
          <div className="px-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              Current organisation
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {orgId ? orgName || "Loading…" : "No organisation selected"}
                </div>
                {orgError && (
                  <div className="mt-0.5 text-[11px] text-red-500 truncate">
                    {orgError}
                  </div>
                )}
                {orgLoading && !orgError && (
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <IconSpinner className="h-3 w-3" />
                    Loading…
                  </div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCreateOrg}
                className="h-7 rounded-xl px-2 text-[11px]"
              >
                New
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center">
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

