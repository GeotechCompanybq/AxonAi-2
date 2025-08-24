"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarPlus,
  ListChecks,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabItem = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const tabs: TabItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule/create", label: "Schedule", icon: CalendarPlus },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed inset-x-0 z-40 mx-auto w-[92%] max-w-lg",
        "md:hidden"
      )}
      style={{ bottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))" }}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-1 rounded-2xl border border-white/10",
          "bg-background/30 backdrop-blur-xl px-2 py-1.5",
          "shadow-[0_10px_40px_rgba(0,0,0,0.45),0_0_0_1px_hsl(var(--ring)/0.2)_inset]"
        )}
      >
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              className={cn(
                "group flex flex-1 items-center justify-center rounded-xl px-0 py-2",
                isActive && "bg-primary/10"
              )}
            >
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-xl border border-white/10",
                  "bg-background/40 shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
                  "transition-all duration-300",
                  isActive
                    ? "text-primary drop-shadow-[0_0_12px_hsla(190,100%,50%,0.65)]"
                    : "text-foreground/80"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="sr-only">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
