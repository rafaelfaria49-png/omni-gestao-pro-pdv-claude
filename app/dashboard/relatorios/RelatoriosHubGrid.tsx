"use client"

import Link from "next/link"
import { ArrowRight,ArrowUpDown,ClipboardList,LayoutDashboard,MessageCircle,Package,ReceiptText,Smartphone,TrendingUp,Users,Wallet,Wrench,type LucideIcon } from "lucide-react"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { canAccessPage } from "@/lib/auth/page-access"
import { EnterpriseAccessDenied } from "@/components/enterprise/EnterpriseAccessDenied"
import { FINANCEIRO_HUB_PATH } from "@/lib/navigation/legacy-routes"
import { canReadReport,type ReportKind } from "@/lib/relatorios/contracts"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

type Card={title:string;description:string;href:string;icon:LucideIcon;kind?:ReportKind;visible?:(p:EnterprisePermissions)=>boolean}
const reports:Card[]=[
  {title:"Relatório Geral da Loja",description:"Vendas por tipo, à vista e a prazo, recebimentos (inclusive parcelas antigas), despesas, contas a receber/pagar, fluxo e conferência de divergências, com rastreio até a origem.",href:"/dashboard/relatorios/geral",icon:LayoutDashboard,kind:"geral"},
  {title:"Histórico de Caixa",description:"Aberturas, fechamentos e movimentos de caixa da unidade.",href:"/dashboard/caixa/historico",icon:Wallet,visible:p=>p.hubs.caixaHistorico},
  {title:"Histórico de Vendas",description:"Vendas registradas, clientes e cupons da loja autorizada.",href:"/dashboard/vendas-arquivo-geral",icon:ReceiptText,visible:p=>p.hubs.vendas},
  {title:"Financeiro",description:"Contas a receber, contas a pagar e carteiras financeiras.",href:FINANCEIRO_HUB_PATH,icon:Wallet,visible:p=>p.hubs.financeiro&&p.financeiro.view},
  {title:"Produtos Mais Vendidos",description:"Quantidade, receita das linhas, devoluções, preço médio e curva ABC. Margem indisponível sem custo histórico.",href:"/dashboard/relatorios/produtos",icon:Package,kind:"produtos"},
  {title:"Fluxo de Caixa",description:"Ledger realizado, saldos e títulos previstos separados. Filtros por carteira e período.",href:"/dashboard/relatorios/fluxo-caixa",icon:ArrowUpDown,kind:"fluxo-caixa"},
  {title:"DRE Gerencial Parcial",description:"Recebimentos e pagamentos em regime de caixa. CMV, competência e resultados sem cobertura ficam indisponíveis.",href:"/dashboard/relatorios/dre",icon:TrendingUp,kind:"dre"},
  {title:"Clientes",description:"Compras identificadas, recorrência, ticket, última compra e histórico por cadastro. Sem correspondências inventadas.",href:"/dashboard/relatorios/clientes",icon:Users,kind:"clientes"},
  {title:"Ordens de Serviço",description:"OS únicas das Operações V3/V4, status, prazos comprovados e garantias registradas.",href:"/dashboard/relatorios/os",icon:ClipboardList,kind:"os"},
  {title:"Técnicos",description:"Atribuições e conclusões reais. Tempos e prazos com cobertura explícita; sem metas ou satisfação simuladas.",href:"/dashboard/relatorios/tecnicos",icon:Wrench,kind:"tecnicos"},
  {title:"Aparelhos e Custos Comerciais",description:"Aparelhos adquiridos, em preparação e vendidos, capital imobilizado, estoque parado e margem histórica só com custo congelado completo. Custo desconhecido nunca vira zero.",href:"/dashboard/relatorios/comercial",icon:Smartphone,kind:"comercial"},
  {title:"WhatsApp",description:"Registros com ID wamid e intervalo de resposta. Aceite externo e automações sem telemetria ficam indisponíveis.",href:"/dashboard/relatorios/whatsapp",icon:MessageCircle,kind:"whatsapp"},
]

export function RelatoriosHubGrid() {
  const permissions=useEnterprisePermissions()
  if(!permissions)return <p role="status" className="p-6 text-sm text-muted-foreground">Validando relatórios autorizados…</p>
  if(!permissions.hubs.relatorios)return <EnterpriseAccessDenied title="Relatórios indisponíveis" description="Seu perfil não inclui acesso à central de relatórios."/>
  const visible=reports.filter(r=>canAccessPage(permissions,r.href)&&(r.kind?canReadReport(permissions,r.kind):r.visible?.(permissions)))
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(r=>{
    const Icon=r.icon
    return <Link key={r.href+r.title} href={r.href} className="group flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
      <div className="flex min-w-0 items-start justify-between gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5"/></span><span className="text-[10px] font-medium text-muted-foreground">{r.kind?"Fontes e cobertura no relatório":"Consulta existente"}</span></div>
      <div className="min-w-0 flex-1"><h2 className="font-semibold text-foreground">{r.title}</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p></div>
      <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-primary">Consultar dados<ArrowRight className="h-3.5 w-3.5"/></span>
    </Link>
  })}{visible.length===0&&<p className="min-w-0 p-6 text-sm text-muted-foreground">Nenhum relatório corresponde ao seu perfil nesta loja.</p>}</div>
}
