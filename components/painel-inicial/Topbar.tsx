"use client";

import Link from "next/link";
import { Bell, Search, Plus, ShoppingCart, Wrench, UserPlus, Package } from "lucide-react";
import { ThemeSwitcher } from "@/components/ia-mestre/ThemeSwitcher";
import { useUserCredits } from "@/hooks/useUserCredits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Topbar() {
  const { credits, loading, error } = useUserCredits();

  const creditsValue = typeof credits === "number" ? credits : null;
  const showLow = !loading && !error && creditsValue !== null && creditsValue <= 100;
  const showNone = !loading && !error && creditsValue !== null && creditsValue <= 0;

  const creditsLabel = loading
    ? "Créditos..."
    : error
      ? null
      : `Créditos: ${new Intl.NumberFormat("pt-BR").format(credits ?? 0)}`;

  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full flex items-center gap-2 px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="hidden md:flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span className="hover:text-foreground cursor-pointer">Matriz</span>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium">Painel</span>
        </nav>

        <div className="flex-1" />

        {/* Search */}
        <div className="hidden sm:block w-72">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar clientes, produtos, OS..."
              className="w-full h-8 pl-8 pr-12 rounded-md bg-muted/60 border border-transparent focus:border-ring focus:bg-panel outline-none text-[12.5px] transition-colors placeholder:text-muted-foreground"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-background/60 text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Theme switcher */}
        <ThemeSwitcher />

        {/* Credits */}
        {creditsLabel ? (
          <div className="hidden sm:inline-flex items-center rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
            {creditsLabel}
          </div>
        ) : null}

        {(showNone || showLow) && (
          <Link
            href="/dashboard/creditos"
            className={[
              "hidden sm:inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition",
              showNone
                ? "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "border-yellow-500/25 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/15 dark:text-yellow-300",
            ].join(" ")}
          >
            <span>{showNone ? "Sem créditos" : "Créditos baixos"}</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
              Comprar
            </span>
          </Link>
        )}

        <Link
          href="/dashboard/creditos"
          className="hidden sm:inline-flex h-8 items-center rounded-full border border-border bg-background/60 px-3 text-[12px] font-medium text-foreground/80 transition hover:bg-muted/50 hover:text-foreground"
        >
          Comprar créditos
        </Link>

        {/* Notifications */}
        <button className="relative h-8 w-8 rounded-md border border-border bg-panel hover:bg-muted/60 transition-colors grid place-items-center">
          <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background" />
        </button>

        {/* New button — dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="hidden sm:inline-flex h-8 px-3 items-center gap-1.5 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:opacity-90 transition-opacity">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Novo
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Criar novo
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer text-[12.5px]">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">Nova Venda</span>
              <kbd className="font-mono text-[9.5px] text-muted-foreground">N V</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer text-[12.5px]">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">Nova OS</span>
              <kbd className="font-mono text-[9.5px] text-muted-foreground">N O</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer text-[12.5px]">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">Novo Cliente</span>
              <kbd className="font-mono text-[9.5px] text-muted-foreground">N C</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer text-[12.5px]">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">Novo Produto</span>
              <kbd className="font-mono text-[9.5px] text-muted-foreground">N P</kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-muted text-foreground text-[11px] font-semibold">
              AD
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:block leading-tight">
            <div className="text-[12px] font-medium">Administrador</div>
            <div className="text-[10.5px] text-muted-foreground">admin@omni.pro</div>
          </div>
        </div>
      </div>
    </header>
  );
}
