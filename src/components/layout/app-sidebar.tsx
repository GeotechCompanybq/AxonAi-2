"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";
import { LogoImg } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AppSidebar() {
  const { user, logout } = useAuth();

  const initials =
    (user?.displayName?.trim()?.[0] || user?.email?.trim()?.[0] || "A").toUpperCase();

  return (
    <div className="flex flex-col h-screen w-full border-r border-sidebar-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_20px_80px_rgba(0,0,0,0.4)]">
      {/* Header with Logo */}
      <div className="p-4 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center">
          <LogoImg className="h-12 w-auto" />
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto p-4">
        <SidebarNav />
      </div>

      {/* User Footer */}
      {user && (
        <div className="p-4 border-t border-white/5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-9 w-9 ring-1 ring-white/10 shadow-[0_0_24px_rgba(0,212,255,0.15)]">
                <AvatarImage
                  src={user.photoURL || "https://placehold.co/64x64.png"}
                  alt={user.displayName || user.email || "User"}
                />
                <AvatarFallback className="bg-white/10 text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {user.displayName || "Axon User"}
                </div>
                {user.email && (
                  <div className="truncate text-xs text-muted-foreground/90">
                    {user.email}
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start rounded-xl hover:bg-white/10"
              onClick={logout}
            >
              <LogOut className="mr-2 h-5 w-5" />
              <span>Log out</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
