"use client"

import Link from "next/link"
import { ClipboardCheck, Database } from "lucide-react"
import { ThemeProvider } from "@/components/cadastros/lovable/components/theme-provider"
import { Toaster } from "@/components/cadastros/lovable/components/ui/sonner"
import { ProdutosPanel } from "@/components/cadastros/lovable/components/cadastros/CadastrosHub"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { canAccessPage } from "@/lib/auth/page-access"

/**
 * Estoque na experiência do cliente: a mesma lista, ficha (`ProductAIModal`) e
 * movimentação do Cadastros, sem segundo formulário. A tela histórica
 * `GestaoProdutos` continua sendo a do proprietário e das contas internas.
 */
export function EstoqueCliente() {
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = (lojaAtivaId ?? "").trim()
  const permissions = useEnterprisePermissions()
  const links = [
    { href: "/dashboard/estoque/inventario", label: "Inventário", icon: ClipboardCheck },
    { href: "/dashboard/cadastros-v2?aba=categorias", label: "Categorias e marcas", icon: Database },
  ].filter((l) => canAccessPage(permissions, l.href.split("?")[0]))

  return (
    <div className="w-full min-w-0 max-w-full">
      <ThemeProvider>
        <header className="mb-5 flex min-w-0 flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Estoque</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Consulte produtos, saldo e unidade. Novo produto e edição usam a mesma ficha de Cadastros.
            </p>
          </div>
          {links.length > 0 && (
            <nav aria-label="Outras funções de estoque" className="flex min-w-0 flex-wrap gap-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
            </nav>
          )}
        </header>
        {storeId ? (
          <ProdutosPanel key={storeId} storeId={storeId} variant="estoque" />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">Selecione uma unidade para consultar o estoque.</p>
        )}
        <Toaster position="top-center" />
      </ThemeProvider>
    </div>
  )
}
