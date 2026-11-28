"use client"

/**
 * Prontuário comercial da unidade (VC-03/VC-04/VC-12 · ADR-0025): identificação, preparação para
 * revenda, custos aplicados (composição honesta), conferências de segurança, indicadores de preço
 * e histórico. O servidor é a autoridade de permissão e de valores; aqui nada é calculado como verdade.
 */
import { useCallback, useRef, useState } from "react"
import { ClipboardList, Loader2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useStoreBusiness } from "@/lib/use-store-business"
import type { AparelhoPermissions } from "../api"
import { useReiniciarAoAbrir } from "../use-reiniciar-ao-abrir"
import { ApiError, apiComercial, type Prontuario } from "./api"
import { HistoricoTab, IdentificacaoTab, PrecificacaoTab, PreparacaoTab, SegurancaTab } from "./abas"
import { CustosTab } from "./CustosTab"
import { etapaLabel, parsePercent } from "./labels"

type Aba = "identificacao" | "preparacao" | "custos" | "seguranca" | "precificacao" | "historico"
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: "identificacao", label: "Identificação" },
  { id: "preparacao", label: "Preparação" },
  { id: "custos", label: "Custos" },
  { id: "seguranca", label: "Segurança" },
  { id: "precificacao", label: "Precificação" },
  { id: "historico", label: "Histórico" },
]

export function ProntuarioComercialDialog({ open, onOpenChange, aparelhoId, storeId, perms, onChanged }: {
  open: boolean; onOpenChange: (v: boolean) => void; aparelhoId: string | null; storeId: string; perms: AparelhoPermissions; onChanged?: () => void
}) {
  const [data, setData] = useState<Prontuario | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<{ message: string; code?: string } | null>(null)
  const [aba, setAba] = useState<Aba>("identificacao")
  const [taxa, setTaxa] = useState("")
  const [margem, setMargem] = useState("")
  const seq = useRef(0)

  const load = useCallback(async (filtros: { taxa: string; margem: string }) => {
    if (!aparelhoId) return
    const meu = ++seq.current
    setLoading(true)
    const q = new URLSearchParams()
    const t = parsePercent(filtros.taxa), m = parsePercent(filtros.margem)
    if (t !== undefined) q.set("taxa", String(t))
    if (m !== undefined) q.set("margem", String(m))
    const qs = q.toString()
    try {
      const r = await apiComercial<Prontuario>(storeId, `/aparelhos/${aparelhoId}/prontuario${qs ? `?${qs}` : ""}`)
      if (meu !== seq.current) return
      setData(r); setErro(null)
    } catch (e) {
      if (meu !== seq.current) return
      setErro({ message: (e as Error).message, code: e instanceof ApiError ? e.code : undefined })
    } finally {
      if (meu === seq.current) setLoading(false)
    }
  }, [aparelhoId, storeId])

  useReiniciarAoAbrir(open, () => {
    setData(null); setErro(null); setAba("identificacao"); setTaxa(""); setMargem("")
    void load({ taxa: "", margem: "" })
  }, aparelhoId ?? undefined)

  const recarregar = useCallback(() => { void load({ taxa, margem }) }, [load, taxa, margem])
  const mudou = useCallback(() => { recarregar(); onChanged?.() }, [recarregar, onChanged])

  const a = data?.aparelho
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0! p-0! sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
            <ClipboardList aria-hidden className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">Prontuário comercial</span>
            {a && <span className="min-w-0 truncate font-mono text-sm font-normal text-muted-foreground">{a.codigoInterno}</span>}
          </DialogTitle>
          <DialogDescription className="min-w-0">
            {a ? `${[a.marca, a.modelo, a.variante].filter(Boolean).join(" ")} · ${etapaLabel(data?.perfil.etapaPreparacao ?? "nenhuma")}` : erro ? "Não foi possível carregar." : "Carregando prontuário…"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!data && loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
          {erro && (
            <div role="alert" className="min-w-0 space-y-2 rounded-xl border border-border p-4 text-sm">
              <p className="font-medium text-foreground">
                {erro.code === "RECURSO_DESATIVADO" ? "Recurso desligado nesta unidade" : erro.code === "COMERCIAL_NAO_INSTALADO" ? "Recurso ainda não instalado" : "Não foi possível carregar o prontuário"}
              </p>
              <p className="text-muted-foreground">{erro.message}</p>
              {erro.code !== "RECURSO_DESATIVADO" && erro.code !== "COMERCIAL_NAO_INSTALADO" && (
                <Button size="sm" variant="outline" disabled={loading} onClick={recarregar}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Tentar novamente</Button>
              )}
            </div>
          )}
          {data && (
            <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="min-w-0">
              <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto">
                {ABAS.map((t) => <TabsTrigger key={t.id} value={t.id} className="shrink-0 flex-none">{t.label}</TabsTrigger>)}
              </TabsList>
              {/* forceMount: formulários sobrevivem à troca de aba (inclusive a chave da operação em curso). */}
              <TabsContent forceMount value="identificacao" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <IdentificacaoTab key={`id-${data.perfil.version}`} storeId={storeId} data={data} perms={perms} onChanged={mudou} />
              </TabsContent>
              <TabsContent forceMount value="preparacao" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <PreparacaoTab storeId={storeId} data={data} perms={perms} onChanged={mudou} />
              </TabsContent>
              <TabsContent forceMount value="custos" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <CustosTab storeId={storeId} data={data} perms={perms} onChanged={mudou} />
              </TabsContent>
              <TabsContent forceMount value="seguranca" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <SegurancaTab key={`seg-${data.perfil.version}`} storeId={storeId} data={data} perms={perms} onChanged={mudou} />
              </TabsContent>
              <TabsContent forceMount value="precificacao" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <PrecificacaoTab data={data} taxa={taxa} margem={margem} onTaxa={setTaxa} onMargem={setMargem} onRecalcular={recarregar} recalculando={loading} />
              </TabsContent>
              <TabsContent forceMount value="historico" className="min-w-0 pt-2 data-[state=inactive]:hidden">
                <HistoricoTab data={data} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Botão + diálogo, exibido só quando o recurso `commercial.refurbishment` está operacional na loja. */
export function ProntuarioComercialBotao({ aparelhoId, storeId, perms, onChanged }: {
  aparelhoId: string; storeId: string; perms: AparelhoPermissions; onChanged?: () => void
}) {
  const operacional = useStoreBusiness().resource("commercial.refurbishment").operational
  const [open, setOpen] = useState(false)
  if (!operacional || !(perms.editar || perms.verCusto)) return null
  return (
    <>
      <Button variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
        <ClipboardList className="mr-2 h-4 w-4" />Prontuário comercial
      </Button>
      <ProntuarioComercialDialog open={open} onOpenChange={setOpen} aparelhoId={aparelhoId} storeId={storeId} perms={perms} onChanged={onChanged} />
    </>
  )
}
