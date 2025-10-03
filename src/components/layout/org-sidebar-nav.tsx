"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, Settings, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { href: "/org/dashboard", label: "Org Dashboard", icon: LayoutDashboard },
  { href: "/org/analytics", label: "Org Analytics", icon: BarChart3 },
  { href: "/org/tasks", label: "Org Tasks", icon: ListChecks },
  { href: "/org/settings", label: "Org Settings", icon: Settings },
];

export function OrgSidebarNav() {
  const pathname = usePathname();

  const renderNavItems = (items: typeof mainNavItems) =>
    items.map((item) => {
      const isActive =
        pathname === item.href ||
        (item.href !== "/org/dashboard" && pathname.startsWith(item.href));
      return (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href} legacyBehavior passHref>
            <SidebarMenuButton
              isActive={isActive}
              tooltip={item.label}
              className={cn(
                "w-full justify-start rounded-xl",
                "transition-all duration-300 hover:translate-x-0.5",
                "bg-transparent/10 backdrop-blur md:hover:bg-primary/10",
                isActive &&
                  "bg-primary/15 text-primary shadow-[0_0_24px_rgba(0,212,255,0.35)] border border-primary/20"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 drop-shadow-[0_0_8px_rgba(0,212,255,0.45)]",
                  isActive ? "text-primary" : "text-foreground"
                )}
              />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      );
    });

  return (
    <nav className="flex flex-col h-full">
      <SidebarGroup className="p-2">
        <SidebarGroupLabel className="text-muted-foreground/80">
          Organization
        </SidebarGroupLabel>
        <SidebarMenu>{renderNavItems(mainNavItems)}</SidebarMenu>
      </SidebarGroup>
    </nav>
  );
}
