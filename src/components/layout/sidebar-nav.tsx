"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarPlus,
  ListChecks,
  CalendarDays, // Added for Calendar
  Settings,
  LifeBuoy,
  BarChart3, // Added BarChart3 import
  MessagesSquare, // Added for Talk to Founder
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule/create", label: "Create Schedule", icon: CalendarPlus },
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const secondaryNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: LifeBuoy },
  { href: "/talk-to-founder", label: "Talk to Founder", icon: MessagesSquare },
];

export function SidebarNav() {
  const pathname = usePathname();

  const renderNavItems = (
    items: typeof mainNavItems // Use a more general type or typeof secondaryNavItems if they differ
  ) =>
    items.map((item) => {
      const isActive =
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
          Menu
        </SidebarGroupLabel>
        <SidebarMenu>{renderNavItems(mainNavItems)}</SidebarMenu>
      </SidebarGroup>
      <div className="mt-auto">
        <SidebarGroup className="p-2">
          <SidebarGroupLabel className="text-muted-foreground/80">
            Support
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(secondaryNavItems)}</SidebarMenu>
        </SidebarGroup>
      </div>
    </nav>
  );
}
