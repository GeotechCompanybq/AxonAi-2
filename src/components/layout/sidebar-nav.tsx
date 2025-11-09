"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import {
  LayoutDashboard,
  CalendarPlus,
  ListChecks,
  CalendarDays, // Added for Calendar
  Settings,
  LifeBuoy,
  BarChart3, // Added BarChart3 import
  MessagesSquare, // Added for Talk to Founder
  Clock4,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
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
  { href: "/timesheets", label: "Timesheets", icon: Clock4 },
  { href: "/weekly-summary", label: "Weekly Summary", icon: BarChart3 },
];

const secondaryNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: LifeBuoy },
  { href: "/talk-to-founder", label: "Talk to Founder", icon: MessagesSquare },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { setOpen } = useSidebar();
  const [showTsPanel, setShowTsPanel] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [pinnedTs, setPinnedTs] = useState(false);

  const openTs = useCallback(() => setShowTsPanel(true), []);
  const closeTs = useCallback(() => {
    if (!pinnedTs) setShowTsPanel(false);
  }, [pinnedTs]);

  const renderNavItems = (
    items: typeof mainNavItems // Use a more general type or typeof secondaryNavItems if they differ
  ) =>
    items.map((item) => {
      const isActive =
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href));
      return (
        <SidebarMenuItem
          key={item.href}
          onMouseEnter={(e) => {
            if (item.href === "/timesheets") {
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              setPanelTop(Math.round(rect.top));
              openTs();
              setOpen(true);
            }
          }}
          onMouseLeave={(e) => {
            if (item.href === "/timesheets") {
              // Slight delay to allow moving into the panel
              setTimeout(() => closeTs(), 80);
            }
          }}
        >
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
              <span className="transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0 group-hover/sidebar-wrapper:group-data-[collapsible=icon]:opacity-100">
                {item.label}
              </span>
            </SidebarMenuButton>
          </Link>
          {/* Hover slide-out for Timesheets */}
          {item.href === "/timesheets" && (
            <div
              onMouseEnter={openTs}
              onMouseLeave={closeTs}
              className={cn(
                "fixed z-40 w-64",
                "transition-all duration-200",
                showTsPanel
                  ? "opacity-100 translate-x-0 pointer-events-auto"
                  : "opacity-0 translate-x-2 pointer-events-none"
              )}
              style={{
                left: "calc(var(--sidebar-width) + 8px)",
                top: panelTop,
              }}
            >
              <div className="rounded-2xl border border-white/10 bg-background/90 backdrop-blur shadow-xl p-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Timesheets
                  </div>
                  <button
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md border",
                      pinnedTs
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "hover:bg-sidebar-accent/30 border-white/10"
                    )}
                    onClick={() => setPinnedTs((v) => !v)}
                  >
                    {pinnedTs ? "Unpin" : "Pin"}
                  </button>
                </div>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/timesheets"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm",
                        pathname === "/timesheets"
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "hover:bg-primary/10"
                      )}
                    >
                      Timesheets
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/timesheets/drafts"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm",
                        pathname === "/timesheets/drafts"
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "hover:bg-primary/10"
                      )}
                    >
                      Timesheet Drafts
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/timesheets/settings"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm",
                        pathname === "/timesheets/settings"
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "hover:bg-primary/10"
                      )}
                    >
                      Timesheet Settings
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/timesheets/grayquarter"
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm",
                        pathname === "/timesheets/grayquarter"
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "hover:bg-primary/10"
                      )}
                    >
                      Grayquarter Timesheets
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          )}
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
