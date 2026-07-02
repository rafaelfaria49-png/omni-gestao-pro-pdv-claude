"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Settings } from "lucide-react"
import { PreviewBadge, PreviewFootnote, previewToast } from "./whatsapp-preview-ui"

type Tab = "cloud-api" | "opt-in"

const CLOUD_API_FIELDS = [
  { label: "Status", value: "—" },
  { label: "Número conectado", value: "—" },
  { label: "Phone Number ID", value: "—" },
  { label: "WhatsApp Business Account (WABA)", value: "—" },
  { label: "Versão da Cloud API", value: "—" },
  { label: "Token de acesso", value: "Configurado no servidor (não exibido)" },
  { label: "Quality rating", value: "—" },
  { label: "Tier de envio", value: "—" },
  { label: "Webhook", value: "—" },
]

export function WhatsAppConfiguracoesPanel() {
  const [tab, setTab] = useState<Tab>("cloud-api")

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Settings className="h-5 w-5 text-primary" />
          Configurações
          <PreviewBadge />
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Conexão da Cloud API do WhatsApp, webhook e consentimentos (opt-in) da loja ativa.
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { id: "cloud-api", label: "Cloud API & número" },
            { id: "opt-in", label: "Opt-in & Consentimentos" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "cloud-api" ? (
        <div className="glass-card space-y-3 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Conexão Cloud API</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => previewToast("testar conexão")}>
                Testar conexão
              </Button>
              <Button variant="outline" size="sm" onClick={() => previewToast("reconectar")}>
                Reconectar
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLOUD_API_FIELDS.map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium text-foreground">{f.value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => previewToast("copiar URL do webhook")}>
              Copiar URL
            </Button>
            <Button variant="outline" size="sm" onClick={() => previewToast("reenviar verificação de webhook")}>
              Reenviar
            </Button>
          </div>
          <PreviewFootnote>
            Estes campos ainda não têm uma leitura ao vivo neste painel visual. A credencial real
            (token, phone number id, WABA) fica somente no servidor, por loja — nunca é exibida aqui.
          </PreviewFootnote>
        </div>
      ) : (
        <div className="glass-card space-y-4 rounded-xl p-5">
          <p className="text-xs text-muted-foreground">
            Só é possível enviar mensagens ativas a contatos com opt-in. Consentimentos seguem a LGPD.
          </p>
          <Button variant="outline" size="sm" onClick={() => previewToast("solicitar opt-in em massa")}>
            Solicitar opt-in em massa
          </Button>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {[
              { label: "Consentidos", value: "—" },
              { label: "Pendentes", value: "—" },
              { label: "Recusados", value: "—" },
              { label: "Taxa de opt-in", value: "—" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{k.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground/80">Mensagem de opt-in</p>
            <Textarea
              rows={3}
              defaultValue="Olá! 👋 Podemos te enviar atualizações da sua OS e novidades por aqui? Responda SIM para autorizar ou NÃO para recusar. Você pode cancelar quando quiser."
              className="text-sm"
            />
            <Button variant="outline" size="sm" className="mt-2" onClick={() => previewToast("editar mensagem de opt-in")}>
              Editar mensagem
            </Button>
          </div>
          <PreviewFootnote>
            🔐 Consentimento deve ser registrado conforme a LGPD, com opção de cancelamento a qualquer
            momento. Este painel ainda não lê/grava consentimentos reais — é uma prévia visual.
          </PreviewFootnote>
        </div>
      )}
    </div>
  )
}
