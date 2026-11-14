"use client"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — "Cadastrar novo modelo" (compartilhado).
 *
 * Usado na ficha do produto, no PDV (configurar acessório) e no Catálogo de Aparelhos.
 * Grava no servidor (modelo manual DA LOJA ATIVA). A marca é sempre informada pelo
 * operador — nada é presumido. Em duplicidade, oferece usar o modelo já existente.
 * Sem permissão, explica o caminho operacional (pedir a quem administra a loja).
 */

import { useEffect, useId, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LOJA_MODELO_LIMITS, lojaModeloCanonicalName, type LojaModelo } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { criarModeloLoja, type CatalogoClientError } from "@/lib/catalogo-aparelhos/loja-catalogo-client"
import { HierarquiaFields, type HierarquiaValue } from "./hierarquia-fields"

/** Modelo pronto para uso (seleção no PDV / vínculo no produto). */
export type ModeloAparelhoEscolhido = {
  modelKey: string
  brand: string
  canonicalName: string
}

export function modeloEscolhidoFromLoja(m: LojaModelo): ModeloAparelhoEscolhido {
  return { modelKey: m.modelKey, brand: m.brand, canonicalName: lojaModeloCanonicalName(m) }
}

export function CadastrarModeloAparelhoDialog({
  open,
  onOpenChange,
  lojaHeader,
  initialName = "",
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lojaHeader: string | null | undefined
  /** Texto pesquisado (pré-preenche o nome; a marca nunca é presumida). */
  initialName?: string
  onCreated: (modelo: ModeloAparelhoEscolhido, created: LojaModelo | null) => void
}) {
  const uid = useId()
  const [hier, setHier] = useState<HierarquiaValue>({ manufacturer: "", brand: "", line: "", name: "" })
  const { brand, name } = hier
  const [aliases, setAliases] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<CatalogoClientError | null>(null)
  // Resposta que chega depois de o diálogo fechar (ex.: PDV trocou de produto) é ignorada.
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    setHier({ manufacturer: "", brand: "", line: "", name: initialName.trim().slice(0, LOJA_MODELO_LIMITS.name) })
    setAliases("")
    setNotes("")
    setFailure(null)
    setBusy(false)
  }, [open, initialName])

  const canSave = !busy && brand.trim().length > 0 && name.trim().length >= 2

  const handleSave = async () => {
    if (!canSave) return
    setBusy(true)
    setFailure(null)
    const res = await criarModeloLoja(lojaHeader, {
      brand,
      name,
      manufacturer: hier.manufacturer,
      line: hier.line,
      aliases: aliases
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean),
      notes,
    })
    setBusy(false)
    if (!openRef.current) return
    if (res.ok) {
      onCreated(modeloEscolhidoFromLoja(res.modelo), res.modelo)
      onOpenChange(false)
      return
    }
    setFailure(res)
  }

  const existing = failure?.code === "DUPLICATE" ? failure.existing : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cadastrar novo modelo</DialogTitle>
          <DialogDescription>
            Fica disponível só para esta loja, na hora, no cadastro de produtos e no PDV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-w-0">
          <HierarquiaFields
            value={hier}
            onChange={setHier}
            lojaHeader={lojaHeader}
            errors={failure?.errors}
            autoFocus
          />

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-alias`}>Apelidos (opcional)</Label>
            <Input
              id={`${uid}-alias`}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Separe por vírgula. Ex.: Moto G47, XT0000"
              autoComplete="off"
            />
            {failure?.errors?.aliases && <p className="text-xs text-destructive">{failure.errors.aliases}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-obs`}>Observação (opcional)</Label>
            <Textarea
              id={`${uid}-obs`}
              value={notes}
              maxLength={LOJA_MODELO_LIMITS.notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[56px]"
              placeholder="Ex.: lançamento de novembro, conferido na caixa."
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Origem: cadastro manual da loja. Cadastrar o modelo não confirma compatibilidade de película ou capinha.
          </p>

          {failure && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <p>{failure.error}</p>
              {existing && existing.active && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onCreated(
                      { modelKey: existing.modelKey, brand: existing.brand, canonicalName: existing.canonicalName },
                      null,
                    )
                    onOpenChange(false)
                  }}
                >
                  Usar “{existing.canonicalName}”
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {busy ? "Salvando…" : "Cadastrar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
