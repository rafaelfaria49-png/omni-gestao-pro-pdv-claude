"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, Search, Plus, ShoppingCart, Wrench, UserPlus, Package, PanelLeftOpen } from "lucide-react";
import { ThemeSwitcher } from "@/components/ia-mestre/ThemeSwitcher";
import { LegibilityToggle } from "@/components/theme/LegibilityToggle";
import { MobileNavSheet } from "@/components/painel-inicial/MobileNavSheet";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { canAccessPage } from "@/lib/auth/page-access";
import { interceptRouteExit } from "@/lib/navigation/route-exit-guard";
import { administrationNavItems, hubsNavItems, workspaceNavItems } from "@/lib/navigation/dashboard-nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";

type NovoItem = {
  label: string;
  href: string;
  icon: typeof ShoppingCart;
  kbd: string;
  visible?: (p: EnterprisePermissions) => boolean;
};

const novoItems: NovoItem[] = [
  {
    label: "Nova Venda",
    href: "/dashboard/vendas",
    icon: ShoppingCart,
    kbd: "N V",
    visible: (p) => p.hubs.vendas,
  },
  {
    label: "Nova OS",
    href: "/dashboard/operacoes-v3",
    icon: Wrench,
    kbd: "N O",
    visible: (p) => p.hubs.operacoes,
  },
  {
    label: "Novo Cliente",
    href: "/dashboard/cadastros-v2?aba=clientes&novo=1",
    icon: UserPlus,
    kbd: "N C",
    visible: (p) => p.hubs.cadastros,
  },
  {
    label: "Novo Produto",
    href: "/dashboard/cadastros-v2?aba=produtos&novo=1",
    icon: Package,
    kbd: "N P",
    visible: (p) => p.hubs.cadastros,
  },
];

export function Topbar({ focusMode = false }: { focusMode?: boolean }) {
  const perms = useEnterprisePermissions();
  const { credits, loading, error } = useUserCredits(perms?.workspace.iaMestre === true);
  const { data: session } = useSession();
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebarCollapsed();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Uma correção modal (livre ou salvando) mantém o teclado na janela ativa.
        if (document.querySelector("[data-og-v4-corrigir-datas]")) return;
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const pathname = usePathname();
  const isPDV = useMemo(() => {
    return pathname?.includes("/vendas") || pathname?.includes("/pdv-next");
  }, [pathname]);

  const breadcrumbLabel = useMemo(() => {
    if (!pathname) return "Painel";
    if (pathname.includes("/whatsapp")) return "WhatsApp HUB";
    if (pathname.includes("/operacoes")) return "Central de Operações";
    if (pathname.includes("/cadastros")) return "Cadastros HUB";
    if (pathname.includes("/financeiro")) return "Financeiro HUB";
    if (pathname.includes("/vendas") || pathname.includes("/pdv-next")) return "Vendas & Caixa";
    if (pathname.includes("/configuracoes")) return "Configurações";
    if (pathname.includes("/relatorios")) return "Relatórios";
    if (pathname.includes("/ia-mestre")) return "IA Mestre";
    if (pathname.includes("/marketplace")) return "Marketplace";
    return "Painel";
  }, [pathname]);

  const novoFiltered = useMemo(() => {
    if (!perms) return [];
    // O atalho só aparece quando o destino também é permitido (permissão + módulo).
    return novoItems.filter((i) => (i.visible ? i.visible(perms) : true) && canAccessPage(perms, i.href.split("?")[0]));
  }, [perms]);

  const creditsValue = typeof credits === "number" ? credits : null;
  const showLow = !loading && !error && creditsValue !== null && creditsValue <= 100;
  const showNone = !loading && !error && creditsValue !== null && creditsValue <= 0;

  const creditsLabel = loading
    ? "Créditos…"
    : error
      ? "Comprar créditos"
      : showNone
        ? "Sem créditos"
      : `Créditos: ${new Intl.NumberFormat("pt-BR").format(credits ?? 0)}`;

  const initials = useMemo(() => {
    const name = session?.user?.name?.trim() || session?.user?.email?.trim() || "";
    if (!name) return "OG";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  }, [session?.user?.name, session?.user?.email]);

  const displayName = session?.user?.name?.trim() || session?.user?.email?.split("@")[0] || "Usuário";
  const displayEmail = session?.user?.email || "";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/90 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full flex items-center gap-2 px-4 sm:px-5">
        <MobileNavSheet />
        {sidebarCollapsed && !focusMode ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Mostrar menu lateral"
            title="Mostrar menu"
            className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/85 bg-panel/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <nav aria-label="Navegação estrutural" className="hidden md:flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Link href="/dashboard" className="shrink-0 transition-colors hover:text-foreground">
            Início
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55" aria-hidden="true" />
          <span className="truncate text-foreground font-semibold tracking-[-0.01em]">{breadcrumbLabel}</span>
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar atividades e páginas"
          title="Pesquisa rápida (⌘K / Ctrl+K)"
          className="group hidden xl:flex xl:w-56 2xl:w-72 h-8 shrink-0 items-center gap-2 rounded-lg bg-panel/85 border border-border/90 px-2.5 text-[12.5px] text-muted-foreground/85 cursor-pointer hover:bg-muted/45 hover:text-foreground hover:border-border-hover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
          <span className="flex-1 truncate text-left">Buscar atividades e páginas...</span>
          <kbd className="shrink-0 font-mono text-[9.5px] font-medium px-1.5 py-0.5 rounded-md border border-border/80 bg-background/90 text-muted-foreground select-none pointer-events-none">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar atividades e páginas"
          title="Pesquisa rápida (⌘K / Ctrl+K)"
          className="inline-flex xl:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/85 bg-panel/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.85} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1.5">
          <ThemeSwitcher compact />
          <LegibilityToggle />
        </div>

        {!isPDV && perms?.workspace.iaMestre ? (
          <Link
            href="/dashboard/creditos"
            className={[
              "hidden sm:inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              showNone
                ? "border-border/90 bg-panel/85 text-muted-foreground hover:border-border-hover hover:bg-muted/50 hover:text-foreground"
                : showLow
                  ? "border-warning/35 bg-warning/10 text-foreground hover:bg-warning/15"
                  : "border-border/85 bg-panel/75 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            ].join(" ")}
            aria-label={`${creditsLabel}. Abrir consulta e compra de créditos`}
            title="Consultar saldo e comprar créditos"
          >
            {showNone ? (
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            ) : null}
            <span>{creditsLabel}</span>
            {showNone || showLow ? (
              <span className="border-l border-border pl-2 text-[11.5px] font-semibold text-foreground">
                Comprar
              </span>
            ) : null}
          </Link>
        ) : null}

        <button
          type="button"
          aria-label="Notificações"
          title="Notificações"
          className="relative h-8 w-8 shrink-0 rounded-lg border border-border/85 bg-panel/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border-hover transition-colors grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-3.5 w-3.5" strokeWidth={1.85} aria-hidden="true" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background" />
        </button>

        {novoFiltered.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden sm:inline-flex h-8 shrink-0 whitespace-nowrap px-3 items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold shadow-xs hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
              Novo
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl border-border/90 p-1.5 shadow-lg">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Criar novo
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {novoFiltered.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild className="gap-2 cursor-pointer rounded-lg text-[12.5px]">
                    <Link href={item.href} className="flex w-full items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <kbd className="pointer-events-none font-mono text-[9.5px] text-muted-foreground">{item.kbd}</kbd>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Link
          href="/conta/seguranca"
          className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Minha conta
        </Link>
        <div className="flex shrink-0 items-center gap-2 pl-2.5 ml-0.5 border-l border-border/80">
          <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
            <AvatarFallback className="bg-primary/12 text-foreground text-[11px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden lg:block leading-tight min-w-0 max-w-[168px]">
            <div className="text-[12px] font-semibold tracking-[-0.01em] truncate">{displayName}</div>
            <div className="text-[10.5px] text-muted-foreground truncate">{displayEmail || "—"}</div>
          </div>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="Buscar Rota ou Ação" description="Digite um comando de navegação para executar rápido.">
        <CommandInput placeholder="Digite para buscar rotas, cadastros e atalhos..." />
        <CommandList>
          <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
          <CommandGroup heading="Rotas e ações disponíveis">
            {[
              ...novoFiltered.map((i) => ({ label: i.label, href: i.href, icon: i.icon, kbd: i.kbd })),
              // Destino permitido e visibilidade do item (a mesma da sidebar).
              ...[...workspaceNavItems, ...hubsNavItems, ...administrationNavItems]
                .filter((i) => !i.visible || (perms !== null && i.visible(perms)))
                .map((i) => ({ label: i.label, href: i.to, icon: i.icon, kbd: "" })),
            ].filter((i) => canAccessPage(perms, i.href.split("?")[0])).map((item) => (
              <CommandItem key={item.label} onSelect={() => { setSearchOpen(false); if (!interceptRouteExit(item.href, item.label)) router.push(item.href); }} className="cursor-pointer">
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>{item.kbd && <CommandShortcut>{item.kbd}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
