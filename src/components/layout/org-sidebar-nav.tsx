"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Settings,
  ListChecks,
  Gauge,
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
import { useCallback, useEffect, useState } from "react";

type OrgNavItem = {
  href: string;
  label: string;
  icon: any;
  submenu?: Array<{ href: string; label: string }>;
};

const orgNavMain: OrgNavItem[] = [
  { href: "/org/overview", label: "Org Overview", icon: Gauge },
  { href: "/org/dashboard", label: "Org Dashboard", icon: LayoutDashboard },
  { href: "/org/analytics", label: "Org Analytics", icon: BarChart3 },
  { href: "/org/tasks", label: "Org Tasks", icon: ListChecks },
  { href: "/org/settings", label: "Org Settings", icon: Settings },
];

export function OrgSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedOverItem, setDraggedOverItem] = useState<string | null>(null);
  const [mostRecent, setMostRecent] = useState<string | null>(null);
  const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set());
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  useEffect(() => {
    const allItems = [...orgNavMain];
    const pinned = new Set<string>();
    const expanded = new Set<string>();
    allItems.forEach((item) => {
      if (isItemPinned(item.href)) {
        pinned.add(item.href);
      }
      if (isMenuExpanded(item.href)) {
        expanded.add(item.href);
      }
    });
    setPinnedItems(pinned);
    setExpandedMenus(expanded);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    trackRecentItem(pathname);
    setMostRecent(getMostRecentItem());

    const allItems = [...orgNavMain];
    for (const item of allItems) {
      if (!item.submenu) continue;
      const isInSubmenu = item.submenu.some(
        (sub) => pathname === sub.href || pathname.startsWith(sub.href + "/")
      );
      if (isInSubmenu && !expandedMenus.has(item.href)) {
        setExpandedMenus((prev) => {
          const next = new Set(prev);
          next.add(item.href);
          return next;
        });
      }
    }
  }, [pathname, expandedMenus]);

  const handleItemClick = useCallback(
    (href: string) => {
      trackRecentItem(href);
      setMostRecent(getMostRecentItem());
      router.push(href);
    },
    [router]
  );

  const handlePinToggle = (href: string) => {
    toggleItemPinned(href);
    setPinnedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  const handleMenuToggle = (href: string) => {
    toggleMenuExpanded(href);
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
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

  const renderNavItem = (item: OrgNavItem, index: number) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/org/dashboard" && pathname.startsWith(item.href));
    const isRecent = mostRecent === item.href;
    const isExpanded = expandedMenus.has(item.href);
    const isPinned = pinnedItems.has(item.href);
    const submenuItems = item.submenu ?? [];
    const hasSubmenu = submenuItems.length > 0;

    return (
      <div
        key={item.href}
        className={cn(
          "relative group transition-all",
          draggedItem === item.href && "opacity-50",
          draggedOverItem === item.href && "ring-2 ring-primary/50 rounded-lg"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (draggedItem && draggedItem !== item.href) {
            setDraggedOverItem(item.href);
          }
        }}
        onDragLeave={() => {
          setDraggedOverItem(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedHref = e.dataTransfer.getData("text/plain");
          if (draggedHref && draggedHref !== item.href) {
            console.log(`Would reorder ${draggedHref} to position of ${item.href}`);
          }
          setDraggedItem(null);
          setDraggedOverItem(null);
        }}
      >
        <div className="flex items-center gap-1">
          <div className="flex-1">
            <Link
              href={item.href}
              onClick={() => handleItemClick(item.href)}
              className={cn(
                baseButtonClass,
                "flex items-center gap-3 px-3 py-2.5",
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
                    handleMenuToggle(item.href);
                  }}
                  className="p-1 hover:bg-white/10 rounded"
                  type="button"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
            </Link>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePinToggle(item.href);
            }}
            className={cn(
              "p-1.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
              isPinned && "opacity-100"
            )}
            title={isPinned ? "Unpin" : "Pin"}
            type="button"
          >
            {isPinned ? (
              <Pin className="h-3.5 w-3.5 text-primary" />
            ) : (
              <PinOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <div
            draggable
            onDragStart={(e) => {
              setDraggedItem(item.href);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", item.href);
              e.stopPropagation();
            }}
            onDragEnd={() => {
              setDraggedItem(null);
              setDraggedOverItem(null);
            }}
            className="p-1 cursor-move opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {hasSubmenu && isExpanded && (
          <div className="ml-8 mt-1 space-y-1 border-l border-white/10 pl-3">
            {submenuItems.map((subItem) => {
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
    );
  };

  return (
    <nav className="flex flex-col h-full space-y-6">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
          Organization
        </div>
        <div className="space-y-1">
          {orgNavMain.map((item, index) => renderNavItem(item, index))}
        </div>
      </div>
    </nav>
  );
}
