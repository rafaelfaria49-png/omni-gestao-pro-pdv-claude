"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FolderKanban, Plus } from "lucide-react"
import { PreviewBadge, PreviewDrawer, PreviewFootnote, previewToast } from "./whatsapp-preview-ui"

type TemplateStatus = "Aprovado" | "Em análise" | "Pausado"

type WaTemplate = {
  id: string
  name: string
  status: TemplateStatus
  category: "UTILITY" | "MARKETING"
  language: string
  preview: string
  variables: string[]
  automation: string
}

const TEMPLATES_EXAMPLE: WaTemplate[] = [
  {
    id: "os_pronta_v2",
    name: "os_pronta_v2",
    status: "Pausado",
    category: "UTILITY",
    language: "pt_BR",
    preview: "Olá {nome}! Sua OS {os} está pronta para retirada. Valor: {valor}. Atendemos de seg a sex, das 9h às 18h. 😊",
    variables: ["nome", "os", "valor"],
    automation: "Automação · OS pronta",
  },
  {
    id: "orcamento_reparo",
    name: "orcamento_reparo",
    status: "Aprovado",
    category: "UTILITY",
    language: "pt_BR",
    preview: "Oi {nome}! O orçamento do reparo do seu {aparelho} ficou em {valor}. Deseja aprovar? Responda SIM que já agendamos. 🙂",
    variables: ["nome", "aparelho", "valor"],
    automation: "Automação · Follow-up de orçamento",
  },
  {
    id: "boas_vindas",
    name: "boas_vindas",
    status: "Aprovado",
    category: "MARKETING",
    language: "pt_BR",
    preview: "Olá {nome}! 👋 Bem-vindo(a). Como podemos ajudar? Responda com o número: 1 Assistência · 2 Orçamento · 3 Falar com atendente.",
    variables: ["nome"],
    automation: "Automação · Boas-vindas",
  },
  {
    id: "promo_acessorios",
    name: "promo_acessorios",
    status: "Em análise",
    category: "MARKETING",
    language: "pt_BR",
    preview: "{nome}, temos {oferta} com condições especiais só esta semana! Aproveite antes que acabe. Responda para saber mais.",
    variables: ["nome", "oferta"],
    automation: "Campanhas",
  },
]

function statusClass(status: TemplateStatus) {
  if (status === "Aprovado") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (status === "Em análise") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
}

export function WhatsAppTemplatesPanel() {
  const [detail, setDetail] = useState<WaTemplate | null>(null)
  const counts = {
    total: TEMPLATES_EXAMPLE.length,
    aprovados: TEMPLATES_EXAMPLE.filter((t) => t.status === "Aprovado").length,
    analise: TEMPLATES_EXAMPLE.filter((t) => t.status === "Em análise").length,
    pausados: TEMPLATES_EXAMPLE.filter((t) => t.status === "Pausado").length,
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FolderKanban className="h-5 w-5 text-primary" />
            Templates
            <PreviewBadge />
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Modelos de mensagem aprovados pela Meta (HSM) para envios ativos fora da janela de 24h.
          </p>
        </div>
        <Button size="sm" onClick={() => previewToast("novo template")}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Novo template
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Todos <b className="text-foreground">{counts.total}</b></span>
        <span>· Aprovados <b className="text-foreground">{counts.aprovados}</b></span>
        <span>· Em análise <b className="text-foreground">{counts.analise}</b></span>
        <span>· Pausados <b className="text-foreground">{counts.pausados}</b></span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TEMPLATES_EXAMPLE.map((t) => (
          <div key={t.id} className="glass-card space-y-2 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">{t.name}</span>
              <Badge variant="outline" className={statusClass(t.status)}>{t.status}</Badge>
              <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
              <span className="text-[10px] text-muted-foreground">{t.language}</span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{t.preview}</p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t.variables.length} variáveis · {t.automation}</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setDetail(t)}
              >
                Ver detalhe →
              </button>
            </div>
          </div>
        ))}
      </div>

      <PreviewFootnote>
        Templates HSM passam por aprovação da Meta. Este catálogo é ilustrativo — criar ou editar é
        uma prévia visual, nenhum envio é feito.
      </PreviewFootnote>

      {detail && (
        <PreviewDrawer title="Detalhe do template" subtitle={detail.name} onClose={() => setDetail(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => previewToast("duplicar template")}>Duplicar</Button>
              <Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button>
              <Button onClick={() => previewToast("usar em automação")}>Usar em automação</Button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClass(detail.status)}>{detail.status}</Badge>
            <Badge variant="secondary" className="text-[10px]">{detail.category}</Badge>
            <span className="text-[11px] text-muted-foreground">{detail.language}</span>
          </div>
          {detail.status === "Pausado" && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              ⚠️ Aprovação revogada pela Meta — revise o conteúdo e reenvie para reativar a automação.
            </p>
          )}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia da mensagem
            </p>
            <p className="text-sm text-foreground">{detail.preview}</p>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variáveis</p>
            <div className="flex flex-wrap gap-1.5">
              {detail.variables.map((v) => (
                <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{`{${v}}`}</code>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>Usado em: {detail.automation}</p>
          </div>
        </PreviewDrawer>
      )}
    </div>
  )
}
