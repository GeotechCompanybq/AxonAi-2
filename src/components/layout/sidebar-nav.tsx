"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import {
  LayoutDashboard,
  CalendarPlus,
  ListChecks,
  CalendarDays,
  Settings,
  LifeBuoy,
  BarChart3,
  MessagesSquare,
  Clock4,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navCore = [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }];

const navPlanning = [
  { href: "/schedule/create", label: "Create Schedule", icon: CalendarPlus },
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

const navInsights = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/timesheets", label: "Timesheets", icon: Clock4 },
  { href: "/weekly-summary", label: "Weekly Summary", icon: BarChart3 },
];

const navSupport = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: LifeBuoy },
  { href: "/talk-to-founder", label: "Talk to Founder", icon: MessagesSquare },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { setOpen, state } = useSidebar();
  const [showTsPanel, setShowTsPanel] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [pinnedTs, setPinnedTs] = useState(false);
  const [openedByHover, setOpenedByHover] = useState(false);

  const openTs = useCallback(() => setShowTsPanel(true), []);
  const closeTs = useCallback(() => {
    if (!pinnedTs) setShowTsPanel(false);
  }, [pinnedTs]);

  const baseButtonClass =
    "w-full justify-start rounded-xl relative overflow-hidden " +
    "transition-all duration-300 ease-out " +
    "bg-transparent/10 backdrop-blur md:hover:bg-white/10 " +
    "hover:shadow-[0_0_0_1px_hsl(var(--ring)/0.18),0_14px_40px_rgba(0,0,0,0.35)] " +
    "hover:-translate-y-[1px]";

  const activeClass =
    "bg-primary/15 text-primary border border-primary/20 " +
    "shadow-[0_0_0_1px_hsl(var(--ring)/0.25),0_0_28px_hsl(var(--ring)/0.25)]";

  const renderNavItems = (
    items: Array<{ href: string; label: string; icon: any }>
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
              if (state === "collapsed") {
                setOpen(true);
                setOpenedByHover(true);
              }
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              setPanelTop(Math.round(rect.top));
              openTs();
            }
          }}
          onMouseLeave={(e) => {
            if (item.href === "/timesheets") {
              // Slight delay to allow moving into the panel
              setTimeout(() => closeTs(), 80);
              if (openedByHover && !pinnedTs) {
                setTimeout(() => setOpen(false), 120);
                setOpenedByHover(false);
              }
            }
          }}
        >
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={item.label}
            className={cn(
              baseButtonClass,
              "hover:translate-x-0.5",
              isActive && activeClass
            )}
          >
            <Link href={item.href}>
              <item.icon
                className={cn(
                  "h-5 w-5 drop-shadow-[0_0_10px_rgba(0,212,255,0.35)]",
                  "group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7",
                  isActive ? "text-primary" : "text-foreground"
                )}
              />
              <span className="transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0 group-hover/sidebar-wrapper:group-data-[collapsible=icon]:opacity-100">
                {item.label}
              </span>
            </Link>
          </SidebarMenuButton>
          {/* Hover slide-out for Timesheets */}
          {item.href === "/timesheets" && (
            <div
              onMouseEnter={openTs}
              onMouseLeave={closeTs}
              className={cn(
                // Protruding flyout panel
                "fixed z-40 w-[280px] md:w-[320px]",
                "transition-all duration-200",
                showTsPanel
                  ? "opacity-100 translate-x-0 pointer-events-auto"
                  : "opacity-0 translate-x-2 pointer-events-none"
              )}
              style={{
                left: "calc(var(--sidebar-width) + 12px)",
                top: panelTop,
              }}
            >
              <div className="relative rounded-2xl border border-white/10 bg-background/90 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.45)] p-2">
                {/* small connector arrow to give a 'protrude' look */}
                <div
                  aria-hidden
                  className="absolute -left-1 top-4 h-3 w-3 rotate-45 bg-background/90 border-t border-l border-white/10"
                />
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
        <SidebarGroupLabel className="text-muted-foreground/80 group-data-[collapsible=icon]:hidden">
          Dashboard
        </SidebarGroupLabel>
        <SidebarMenu>{renderNavItems(navCore)}</SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="p-2 pt-0">
        <SidebarGroupLabel className="text-muted-foreground/80 group-data-[collapsible=icon]:hidden">
          Planning
        </SidebarGroupLabel>
        <SidebarMenu>{renderNavItems(navPlanning)}</SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="p-2 pt-0">
        <SidebarGroupLabel className="text-muted-foreground/80 group-data-[collapsible=icon]:hidden">
          Insights
        </SidebarGroupLabel>
        <SidebarMenu>{renderNavItems(navInsights)}</SidebarMenu>
      </SidebarGroup>
      <div className="mt-auto">
        <SidebarGroup className="p-2">
          <SidebarGroupLabel className="text-muted-foreground/80 group-data-[collapsible=icon]:hidden">
            Support
          </SidebarGroupLabel>
          <SidebarMenu>{renderNavItems(navSupport)}</SidebarMenu>
        </SidebarGroup>
      </div>
    </nav>
  );
}
