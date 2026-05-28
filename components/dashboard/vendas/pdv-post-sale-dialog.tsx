"use client"

import { useState } from "react"
import { Receipt, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { printPdvSaleReceipt, type PrintJobResult } from "@/lib/pdv-print-runtime"
import type { PdvReceiptInput } from "@/lib/escpos"
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config"

export interface PdvPostSaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  printInput: PdvReceiptInput | null
  impressaoConfig: PdvImpressaoConfig
  logoUrl?: string
  onAfterClose?: () => void
}

export function PdvPostSaleDialog({
  open,
  onOpenChange,
  printInput,
  impressaoConfig,
  logoUrl,
  onAfterClose,
}: PdvPostSaleDialogProps) {
  const { toast } = useToast()
  const [printing, setPrinting] = useState(false)

  function close() {
    onOpenChange(false)
    onAfterClose?.()
  }

  async function handlePrint() {
    if (!printInput) { close(); return }
    setPrinting(true)
    let result: PrintJobResult
    try {
      result = await printPdvSaleReceipt({
        config: impressaoConfig,
        receiptFooter: printInput.receiptFooter ?? undefined,
        logoUrl: logoUrl ?? null,
        input: printInput,
      })
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      setPrinting(false)
    }

    if (result.ok) {
      const viaMsg =
        result.via === "proxy"
          ? `${impressaoConfig.impressoraHost.trim() || "Impressora"} · ${impressaoConfig.viasCupom} via(s).`
          : impressaoConfig.impressoraHost.trim()
            ? "Falha na térmica — abrindo impressão A4."
            : "Impressão do navegador aberta."
      toast({ title: "Comprovante enviado", description: viaMsg })
    } else {
      const errMsg =
        impressaoConfig.impressoraHost.trim()
          ? `Impressora ${impressaoConfig.impressoraHost.trim()} inacessível. Verifique a conexão ou configure A4 em Configurações → PDV.`
          : result.error || "Não foi possível imprimir."
      toast({ title: "Falha na impressão", description: errMsg, variant: "destructive" })
    }
    close()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !printing) close()
      }}
    >
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Receipt className="h-5 w-5 text-primary" />
            Imprimir comprovante?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Venda registrada com sucesso. Deseja imprimir o comprovante não fiscal?
        </p>
        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            className="flex-1 h-11 gap-2 bg-[hsl(var(--pos-action))] font-semibold text-[hsl(var(--pos-action-foreground))] hover:bg-[hsl(var(--pos-action))]/90 disabled:opacity-60"
            disabled={printing}
            onClick={() => void handlePrint()}
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
            {printing ? "Imprimindo…" : "Sim, imprimir"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 border-border"
            disabled={printing}
            onClick={close}
          >
            Não, obrigado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
