"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, HardHat, DollarSign, Menu, Plus, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SECONDARY_NAV } from "./nav-items";

const BOTTOM_PRIMARY = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/obras", label: "Obras", icon: HardHat },
];

const BOTTOM_RIGHT = [
  { href: "/salarios", label: "Salarios", icon: DollarSign },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t pb-safe">
      <div className="grid grid-cols-5 items-end">
        {BOTTOM_PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-2 text-xs gap-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        {/* Botao central destacado: Adicionar Dia */}
        <Link
          href="/dias/novo"
          className="flex flex-col items-center justify-end pb-1 -mt-6"
        >
          <span className="bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg ring-4 ring-background">
            <Plus className="h-7 w-7" />
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">
            Dia
          </span>
        </Link>

        {BOTTOM_RIGHT.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-2 text-xs gap-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center py-2 text-xs gap-1 text-muted-foreground">
              <Menu className="h-5 w-5" />
              Menu
            </button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {SECONDARY_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-2 rounded-md text-sm text-muted-foreground/70"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      em breve
                    </span>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 mt-4"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
                Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
