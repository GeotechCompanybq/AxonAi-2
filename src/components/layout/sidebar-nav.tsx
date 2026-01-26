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
  const [showTsPanel, setShowTsPanel] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [pinnedTs, setPinnedTs] = useState(false);

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
        <div
          key={item.href}
          className="relative"
          onMouseEnter={(e) => {
            if (item.href === "/timesheets") {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setPanelTop(Math.round(rect.top));
              openTs();
            }
          }}
          onMouseLeave={() => {
            if (item.href === "/timesheets") {
              setTimeout(() => closeTs(), 80);
            }
          }}
        >
          <Link
            href={item.href}
            className={cn(
              baseButtonClass,
              "flex items-center gap-3 px-3 py-2.5",
              "hover:translate-x-0.5",
              isActive && activeClass
            )}
          >
            <item.icon
              className={cn(
                "h-5 w-5 drop-shadow-[0_0_10px_rgba(0,212,255,0.35)] shrink-0",
                isActive ? "text-primary" : "text-foreground"
              )}
            />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
          {/* Hover slide-out for Timesheets */}
          {item.href === "/timesheets" && (
            <div
              onMouseEnter={openTs}
              onMouseLeave={closeTs}
              className={cn(
                "fixed z-40 w-[280px] md:w-[320px]",
                "transition-all duration-200",
                showTsPanel
                  ? "opacity-100 translate-x-0 pointer-events-auto"
                  : "opacity-0 translate-x-2 pointer-events-none"
              )}
              style={{
                left: "calc(256px + 12px)",
                top: panelTop,
              }}
            >
              <div className="relative rounded-2xl border border-white/10 bg-background/90 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.45)] p-2">
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
                        : "hover:bg-primary/10 border-white/10"
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
        </div>
      );
    });

  return (
    <nav className="flex flex-col h-full space-y-6">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
          Dashboard
        </div>
        <div className="space-y-1">{renderNavItems(navCore)}</div>
      </div>
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
          Planning
        </div>
        <div className="space-y-1">{renderNavItems(navPlanning)}</div>
      </div>
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
          Insights
        </div>
        <div className="space-y-1">{renderNavItems(navInsights)}</div>
      </div>
      <div className="mt-auto space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
          Support
        </div>
        <div className="space-y-1">{renderNavItems(navSupport)}</div>
      </div>
    </nav>
  );
}
