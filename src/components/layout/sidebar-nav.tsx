"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
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
  ChevronRight,
  ChevronDown,
  GripVertical,
  Pin,
  PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  trackRecentItem,
  toggleMenuExpanded,
  isMenuExpanded,
  toggleItemPinned,
  isItemPinned,
  getMostRecentItem,
} from "@/lib/sidebar-storage";

type NavItem = {
  href: string;
  label: string;
  icon: any;
  submenu?: Array<{ href: string; label: string }>;
};

const navCore: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
];

const navPlanning: NavItem[] = [
  { href: "/schedule/create", label: "Create Schedule", icon: CalendarPlus },
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

const navInsights: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  {
    href: "/timesheets",
    label: "Timesheets",
    icon: Clock4,
    submenu: [
      { href: "/timesheets", label: "Timesheets" },
      { href: "/timesheets/drafts", label: "Timesheet Drafts" },
      { href: "/timesheets/settings", label: "Timesheet Settings" },
      { href: "/timesheets/grayquarter", label: "Grayquarter Timesheets" },
    ],
  },
  { href: "/weekly-summary", label: "Weekly Summary", icon: BarChart3 },
];

const navSupport: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: LifeBuoy },
  { href: "/talk-to-founder", label: "Talk to Founder", icon: MessagesSquare },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [mostRecent, setMostRecent] = useState<string | null>(null);

  // Track current page as recent and expand parent menu if needed
  useEffect(() => {
    if (pathname) {
      trackRecentItem(pathname);
      setMostRecent(getMostRecentItem());
      
      // Auto-expand parent menu if current path is in a submenu
      const allItems = [...navCore, ...navPlanning, ...navInsights, ...navSupport];
      for (const item of allItems) {
        if (item.submenu) {
          const isInSubmenu = item.submenu.some((sub) => pathname === sub.href || pathname.startsWith(sub.href + "/"));
          if (isInSubmenu && !isMenuExpanded(item.href)) {
            toggleMenuExpanded(item.href);
          }
        }
      }
    }
  }, [pathname]);

  const handleItemClick = (href: string) => {
    trackRecentItem(href);
    setMostRecent(getMostRecentItem());
    router.push(href);
  };

  const baseButtonClass =
    "w-full justify-start rounded-xl relative overflow-hidden " +
    "transition-all duration-300 ease-out " +
    "bg-transparent/10 backdrop-blur md:hover:bg-white/10 " +
    "hover:shadow-[0_0_0_1px_hsl(var(--ring)/0.18),0_14px_40px_rgba(0,0,0,0.35)] " +
    "hover:-translate-y-[1px]";

  const activeClass =
    "bg-primary/15 text-primary border border-primary/20 " +
    "shadow-[0_0_0_1px_hsl(var(--ring)/0.25),0_0_28px_hsl(var(--ring)/0.25)]";

  const recentClass = "ring-1 ring-primary/30";

  const renderNavItem = (item: NavItem, index: number) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));
    const isRecent = mostRecent === item.href;
    const isExpanded = isMenuExpanded(item.href);
    const isPinned = isItemPinned(item.href);
    const hasSubmenu = item.submenu && item.submenu.length > 0;

    return (
      <div key={item.href} className="relative group">
        <div
          draggable
          onDragStart={(e) => {
            setDraggedItem(item.href);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            // Drag and drop reordering could be implemented here
            setDraggedItem(null);
          }}
          onDragEnd={() => setDraggedItem(null)}
          className={cn(
            "flex items-center gap-1",
            draggedItem === item.href && "opacity-50"
          )}
        >
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <Link
                href={item.href}
                onClick={() => handleItemClick(item.href)}
                className={cn(
                  baseButtonClass,
                  "flex items-center gap-3 px-3 py-2.5 flex-1",
                  "hover:translate-x-0.5",
                  isActive && activeClass,
                  isRecent && !isActive && recentClass
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 drop-shadow-[0_0_10px_rgba(0,212,255,0.35)] shrink-0",
                    isActive ? "text-primary" : "text-foreground"
                  )}
                />
                <span className="text-sm font-medium flex-1">{item.label}</span>
                {hasSubmenu && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleMenuExpanded(item.href);
                    }}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
              </Link>
              <button
                onClick={() => toggleItemPinned(item.href)}
                className={cn(
                  "p-1.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity",
                  isPinned && "opacity-100"
                )}
                title={isPinned ? "Unpin" : "Pin"}
              >
                {isPinned ? (
                  <Pin className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <PinOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
              <div className="p-1 cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Submenu */}
            {hasSubmenu && isExpanded && (
              <div className="ml-8 mt-1 space-y-1 border-l border-white/10 pl-3">
                {item.submenu.map((subItem) => {
                  const isSubActive = pathname === subItem.href;
                  const isSubRecent = mostRecent === subItem.href;
                  return (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      onClick={() => handleItemClick(subItem.href)}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm transition-colors",
                        isSubActive
                          ? "bg-primary/15 text-primary border border-primary/20"
                          : "hover:bg-primary/10 text-foreground",
                        isSubRecent && !isSubActive && recentClass
                      )}
                    >
                      {subItem.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderNavSection = (
    items: NavItem[],
    sectionLabel: string
  ) => (
    <div className="space-y-1">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
        {sectionLabel}
      </div>
      <div className="space-y-1">
        {items.map((item, index) => renderNavItem(item, index))}
      </div>
    </div>
  );

  return (
    <nav className="flex flex-col h-full space-y-6">
      {renderNavSection(navCore, "Dashboard")}
      {renderNavSection(navPlanning, "Planning")}
      {renderNavSection(navInsights, "Insights")}
      <div className="mt-auto">
        {renderNavSection(navSupport, "Support")}
      </div>
    </nav>
  );
}
