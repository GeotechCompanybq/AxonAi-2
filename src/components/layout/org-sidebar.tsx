"use client";

import Link from "next/link";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogoImg } from "@/components/icons";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { OrgSidebarNav } from "./org-sidebar-nav";

export function OrgSidebar() {
  const { user, logout } = useAuth();

  return (
    <Sidebar
      collapsible="icon"
      side="left"
      variant="floating"
      className="border-sidebar-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_20px_80px_rgba(0,0,0,0.4)]"
    >
      <SidebarRail />
      <SidebarHeader className="p-4 md:p-2 items-center md:bg-transparent">
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
        <Link
          href="/org/dashboard"
          className="hidden group-data-[collapsible=icon]:block group-data-[collapsible=icon]:mt-2"
        >
          <Image
            src="/favicon.png"
            alt="Axon"
            width={28}
            height={28}
            className="rounded-lg"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-0">
        <OrgSidebarNav />
      </SidebarContent>
      {user && (
        <SidebarFooter className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start group-data-[collapsible=icon]:justify-center"
            onClick={logout}
          >
            <LogOut className="mr-2 h-5 w-5 group-data-[collapsible=icon]:mr-0" />
            <span className="group-data-[collapsible=icon]:hidden">
              Log Out
            </span>
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
