"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 border-r bg-card">
      <div className="px-6 py-5 border-b">
        <h1 className="text-xl font-bold text-primary">Obras FG</h1>
        <p className="text-xs text-muted-foreground">FG Construcoes & Reformas</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Principal
        </div>
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <div className="px-2 mt-6 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Em breve
        </div>
        {SECONDARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/70 cursor-not-allowed"
              title="Em breve"
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1">{item.label}</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                em breve
              </span>
            </div>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
