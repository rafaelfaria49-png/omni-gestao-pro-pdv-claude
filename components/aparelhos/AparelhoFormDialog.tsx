"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Camera, Loader2, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APARELHO_CONDICOES, APARELHO_CONDICAO_LABEL } from "@/lib/aparelhos/lifecycle"
import { ACESSORIOS_ITENS, type Acessorios, type Checklist } from "@/lib/aparelhos/checklist"
import { validateImei } from "@/lib/aparelhos/imei"
import { rotuloPrazo } from "@/lib/aparelhos/warranty"
import { listFornecedores } from "@/app/actions/cadastros"
import { ApiError, apiAparelhos, reduzirFoto, type AparelhoDTO, type AparelhoPermissions, type PoliticaAparelhos } from "./api"
import { ChecklistEditor, FieldLabel, ImeiInput, brl, inputCls } from "./parts"

type Mode = { kind: "novo"; origem?: "cadastro_manual" | "fornecedor" | "lote" } | { kind: "editar"; aparelho: AparelhoDTO }

type Fornecedor = { id: string; name: string }

export type AparelhoDraft = {
  marca: string; modelo: string; variante: string; armazenamento: string; memoriaRam: string; cor: string; condicao: string
  imei1: string; imei2: string; serial: string; ean: string
  custoAquisicao: string; despesas: string; precoSugerido: string; precoVenda: string; garantiaContratualDias: number
  acessorios: Acessorios; estadoFisico: string; checklist: Checklist; bateriaSaude: string; bateriaFonte: string; observacoes: string
  fotos: Array<{ dataUrl: string; legenda: string }>
}

export function draftVazio(politica?: PoliticaAparelhos): AparelhoDraft {
  return {
    marca: "", modelo: "", variante: "", armazenamento: "", memoriaRam: "", cor: "", condicao: "seminovo",
    imei1: "", imei2: "", serial: "", ean: "", custoAquisicao: "", despesas: "", precoSugerido: "", precoVenda: "",
    garantiaContratualDias: politica?.contratualPadraoDias ?? 0, acessorios: {}, estadoFisico: "", checklist: {},
    bateriaSaude: "", bateriaFonte: "", observacoes: "", fotos: [],
  }
}

export function draftParaPayload(d: AparelhoDraft) {
  const n = (s: string) => (s.trim() ? Number(s.replace(/\./g, "").replace(",", ".")) : 0)
  return {
    marca: d.marca, modelo: d.modelo, variante: d.variante, armazenamento: d.armazenamento, memoriaRam: d.memoriaRam, cor: d.cor,
    condicao: d.condicao, imei1: d.imei1, imei2: d.imei2, serial: d.serial, ean: d.ean,
    custoAquisicao: n(d.custoAquisicao), despesas: n(d.despesas), precoSugerido: d.precoSugerido.trim() ? n(d.precoSugerido) : null, precoVenda: n(d.precoVenda),
    garantiaContratualDias: d.garantiaContratualDias, acessorios: d.acessorios, estadoFisico: d.estadoFisico, checklist: d.checklist,
    bateriaSaude: d.bateriaSaude.trim() ? Number(d.bateriaSaude) : null, bateriaFonte: d.bateriaFonte, observacoes: d.observacoes, fotos: d.fotos,
  }
}

const ARMAZENAMENTOS = ["32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"]

/** Campos do aparelho (reusados no cadastro e na compra de cliente). */
export function AparelhoCampos({ d, set, perms, politica, mostrarCusto = true, idPrefix = "apa" }: {
  d: AparelhoDraft; set: (p: Partial<AparelhoDraft>) => void; perms: AparelhoPermissions; politica: PoliticaAparelhos; mostrarCusto?: boolean; idPrefix?: string
}) {
  const id = (k: string) => `${idPrefix}-${k}`
  const custoTotal = useMemo(() => {
    const n = (s: string) => Number(s.replace(",", ".")) || 0
    return n(d.custoAquisicao) + n(d.despesas)
  }, [d.custoAquisicao, d.despesas])

  async function addFotos(files: FileList | null) {
    if (!files) return
    const espaco = 6 - d.fotos.length
    const novas: AparelhoDraft["fotos"] = []
    for (const f of Array.from(files).slice(0, espaco)) {
      try { novas.push({ dataUrl: await reduzirFoto(f), legenda: "" }) } catch (e) { toast.error((e as Error).message) }
    }
    set({ fotos: [...d.fotos, ...novas] })
  }

  return (
    <div className="min-w-0 space-y-6">
      <section aria-labelledby={id("s-ident")} className="min-w-0 space-y-3">
        <h3 id={id("s-ident")} className="text-sm font-semibold text-foreground">Identificação</h3>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("marca")} required>Marca</FieldLabel><input id={id("marca")} className={inputCls} value={d.marca} onChange={(e) => set({ marca: e.target.value })} placeholder="Apple, Samsung, Motorola…" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("modelo")} required>Modelo</FieldLabel><input id={id("modelo")} className={inputCls} value={d.modelo} onChange={(e) => set({ modelo: e.target.value })} placeholder="iPhone 14, Galaxy S22…" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("variante")}>Variante</FieldLabel><input id={id("variante")} className={inputCls} value={d.variante} onChange={(e) => set({ variante: e.target.value })} placeholder="Pro, Plus, 5G…" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("arm")}>Armazenamento</FieldLabel>
            <input id={id("arm")} list={id("arm-list")} className={inputCls} value={d.armazenamento} onChange={(e) => set({ armazenamento: e.target.value })} placeholder="128 GB" />
            <datalist id={id("arm-list")}>{ARMAZENAMENTOS.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("ram")}>Memória RAM</FieldLabel><input id={id("ram")} className={inputCls} value={d.memoriaRam} onChange={(e) => set({ memoriaRam: e.target.value })} placeholder="8 GB" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("cor")}>Cor</FieldLabel><input id={id("cor")} className={inputCls} value={d.cor} onChange={(e) => set({ cor: e.target.value })} placeholder="Preto" /></div>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-medium text-foreground">Condição <span className="text-primary">*</span></legend>
          <div className="flex flex-wrap gap-1.5">
            {APARELHO_CONDICOES.map((c) => (
              <button key={c} type="button" aria-pressed={d.condicao === c} onClick={() => set({ condicao: c })}
                className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring", d.condicao === c ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted")}>
                {APARELHO_CONDICAO_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ImeiInput id={id("imei1")} label="IMEI 1" value={d.imei1} onChange={(v) => set({ imei1: v })} required={!d.serial.trim()} />
          <ImeiInput id={id("imei2")} label="IMEI 2 (dual chip)" value={d.imei2} onChange={(v) => set({ imei2: v })} />
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("serial")}>Número de série</FieldLabel><input id={id("serial")} className={cn(inputCls, "font-mono uppercase")} value={d.serial} onChange={(e) => set({ serial: e.target.value })} placeholder="Obrigatório sem IMEI" /></div>
        </div>
      </section>

      <section aria-labelledby={id("s-valores")} className="min-w-0 space-y-3">
        <h3 id={id("s-valores")} className="text-sm font-semibold text-foreground">Valores e garantia</h3>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mostrarCusto && perms.definirCusto && (
            <>
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("custo")}>Custo de aquisição</FieldLabel><input id={id("custo")} inputMode="decimal" className={inputCls} value={d.custoAquisicao} onChange={(e) => set({ custoAquisicao: e.target.value })} placeholder="0,00" /></div>
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("despesas")}>Despesas (reparo, frete)</FieldLabel><input id={id("despesas")} inputMode="decimal" className={inputCls} value={d.despesas} onChange={(e) => set({ despesas: e.target.value })} placeholder="0,00" /></div>
            </>
          )}
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("sugerido")}>Preço sugerido</FieldLabel><input id={id("sugerido")} inputMode="decimal" className={inputCls} value={d.precoSugerido} onChange={(e) => set({ precoSugerido: e.target.value })} placeholder="0,00" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("preco")} required>Preço de venda</FieldLabel><input id={id("preco")} inputMode="decimal" className={inputCls} value={d.precoVenda} onChange={(e) => set({ precoVenda: e.target.value })} placeholder="0,00" /></div>
        </div>
        {mostrarCusto && perms.definirCusto && <p className="text-xs text-muted-foreground">Custo total da unidade: <b className="text-foreground">{brl(custoTotal)}</b></p>}
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-medium text-foreground">Garantia contratual sugerida na venda <span className="font-normal text-muted-foreground">(além dos 90 dias legais)</span></legend>
          <div className="flex flex-wrap gap-1.5">
            {politica.presetsContratuaisDias.map((dias) => (
              <button key={dias} type="button" aria-pressed={d.garantiaContratualDias === dias} onClick={() => set({ garantiaContratualDias: dias })}
                className={cn("h-9 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", d.garantiaContratualDias === dias ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground hover:bg-muted")}>
                {dias === 0 ? "Sem adicional" : `+ ${rotuloPrazo(dias)}`}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby={id("s-check")} className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <h3 id={id("s-check")} className="text-sm font-semibold text-foreground">Conferência</h3>
          <p className="text-xs text-muted-foreground">Item sem marcação fica como “não testado” — nunca como aprovado.</p>
        </div>
        <ChecklistEditor value={d.checklist} onChange={(c) => set({ checklist: c })} />
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("bat")}>Saúde da bateria (%)</FieldLabel><input id={id("bat")} inputMode="numeric" className={inputCls} value={d.bateriaSaude} onChange={(e) => set({ bateriaSaude: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Ex.: 87" /></div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2"><FieldLabel htmlFor={id("batf")} required={!!d.bateriaSaude}>Origem da informação</FieldLabel><input id={id("batf")} className={inputCls} value={d.bateriaFonte} onChange={(e) => set({ bateriaFonte: e.target.value })} placeholder="Ajustes do iOS, ferramenta de diagnóstico…" disabled={!d.bateriaSaude} /></div>
        </div>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-medium text-foreground">Acessórios inclusos</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ACESSORIOS_ITENS.map((a) => (
              <label key={a.key} className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!d.acessorios[a.key]} onChange={(e) => set({ acessorios: { ...d.acessorios, [a.key]: e.target.checked } })} />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("estado")}>Estado físico</FieldLabel><textarea id={id("estado")} rows={2} maxLength={300} className={cn(inputCls, "h-auto py-2")} value={d.estadoFisico} onChange={(e) => set({ estadoFisico: e.target.value })} placeholder="Marcas leves na lateral, tela sem riscos…" /></div>
          <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor={id("obs")}>Observações</FieldLabel><textarea id={id("obs")} rows={2} maxLength={1000} className={cn(inputCls, "h-auto py-2")} value={d.observacoes} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Obrigatório descrever itens com falha" /></div>
        </div>
      </section>

      <section aria-labelledby={id("s-fotos")} className="min-w-0 space-y-2">
        <h3 id={id("s-fotos")} className="text-sm font-semibold text-foreground">Fotos <span className="font-normal text-muted-foreground">({d.fotos.length}/6)</span></h3>
        <div className="flex flex-wrap gap-2">
          {d.fotos.map((f, i) => (
            <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUrl} alt={`Foto ${i + 1} do aparelho`} className="h-full w-full object-cover" />
              <button type="button" aria-label={`Remover foto ${i + 1}`} onClick={() => set({ fotos: d.fotos.filter((_, k) => k !== i) })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-background/90 text-foreground">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {d.fotos.length < 6 && (
            <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
              <Camera className="h-5 w-5" aria-hidden />
              <span className="sr-only">Adicionar fotos</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void addFotos(e.target.files); e.target.value = "" }} />
            </label>
          )}
        </div>
      </section>
    </div>
  )
}

/** Valida no cliente o que o servidor também valida — feedback antes do envio. */
export function validarDraft(d: AparelhoDraft): string | null {
  if (!d.marca.trim()) return "Informe a marca."
  if (!d.modelo.trim()) return "Informe o modelo."
  if (!d.imei1.trim() && !d.serial.trim()) return "Informe o IMEI ou o número de série."
  if (d.imei1.trim()) { const c = validateImei(d.imei1); if (!c.ok) return `IMEI 1: ${c.message}` }
  if (d.imei2.trim()) { const c = validateImei(d.imei2); if (!c.ok) return `IMEI 2: ${c.message}` }
  if (d.bateriaSaude && !d.bateriaFonte.trim()) return "Informe a origem da saúde da bateria."
  return null
}

export function AparelhoFormDialog({ open, onOpenChange, mode, storeId, perms, politica, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; mode: Mode; storeId: string; perms: AparelhoPermissions; politica: PoliticaAparelhos; onSaved: (id: string) => void
}) {
  const [d, setD] = useState<AparelhoDraft>(() => draftVazio(politica))
  const [fornecedorId, setFornecedorId] = useState("")
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [liberar, setLiberar] = useState(false)
  const [conferenciaFonte, setConferenciaFonte] = useState("")
  const [saving, setSaving] = useState(false)
  const editing = mode.kind === "editar"
  const origem = mode.kind === "novo" ? mode.origem ?? "cadastro_manual" : undefined

  useEffect(() => {
    if (!open) return
    setLiberar(false); setConferenciaFonte(""); setFornecedorId("")
    if (mode.kind === "editar") {
      const a = mode.aparelho
      const s = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? "" : String(n).replace(".", ","))
      setD({
        marca: a.marca, modelo: a.modelo, variante: a.variante, armazenamento: a.armazenamento, memoriaRam: a.memoriaRam, cor: a.cor, condicao: a.condicao,
        imei1: a.identificadoresMascarados ? "" : a.imei1 ?? "", imei2: a.identificadoresMascarados ? "" : a.imei2 ?? "", serial: a.identificadoresMascarados ? "" : a.serial ?? "", ean: a.ean ?? "",
        custoAquisicao: s(a.custoAquisicao), despesas: s(a.despesas), precoSugerido: s(a.precoSugerido), precoVenda: s(a.precoVenda),
        garantiaContratualDias: a.garantiaContratualDias, acessorios: (a.acessorios ?? {}) as Acessorios, estadoFisico: a.estadoFisico,
        checklist: (a.checklist ?? {}) as Checklist, bateriaSaude: a.bateriaSaude === null ? "" : String(a.bateriaSaude), bateriaFonte: a.bateriaFonte ?? "", observacoes: a.observacoes, fotos: [],
      })
    } else {
      setD(draftVazio(politica))
    }
    if (origem === "fornecedor" || origem === "lote") {
      listFornecedores(storeId).then((l) => setFornecedores(l.map((f) => ({ id: f.id, name: f.nome })))).catch(() => setFornecedores([]))
    }
  }, [open, mode, politica, storeId, origem])

  const set = (p: Partial<AparelhoDraft>) => setD((cur) => ({ ...cur, ...p }))

  async function salvar() {
    const erro = editing && mode.aparelho.identificadoresMascarados && !d.imei1 && !d.serial ? null : validarDraft(d)
    if (erro) { toast.error(erro); return }
    if (liberar && d.condicao !== "novo_lacrado" && politica.liberacaoExigeConferencia && !conferenciaFonte.trim()) {
      toast.error("Para liberar agora, registre onde a restrição do IMEI foi conferida."); return
    }
    setSaving(true)
    try {
      const payload = draftParaPayload(d)
      if (mode.kind === "editar") {
        const body: Record<string, unknown> = { ...payload, version: mode.aparelho.version }
        if (mode.aparelho.identificadoresMascarados) { delete body.imei1; delete body.imei2; delete body.serial }
        if (!perms.definirCusto) { delete body.custoAquisicao; delete body.despesas }
        delete body.fotos
        await apiAparelhos(storeId, `/${mode.aparelho.id}`, { method: "PATCH", body })
        if (d.fotos.length) await apiAparelhos(storeId, `/${mode.aparelho.id}/acao`, { method: "POST", body: { acao: "fotos", fotos: d.fotos } })
        toast.success("Aparelho atualizado.")
        onSaved(mode.aparelho.id)
      } else {
        const r = await apiAparelhos<{ aparelho: { id: string; codigoInterno: string } }>(storeId, "", { method: "POST", body: { ...payload, origem, fornecedorId: fornecedorId || undefined } })
        let liberado = false
        if (liberar) {
          try {
            if (d.condicao !== "novo_lacrado" || politica.liberacaoExigeConferencia === false) {
              if (conferenciaFonte.trim()) await apiAparelhos(storeId, `/${r.aparelho.id}/acao`, { method: "POST", body: { acao: "conferencia", resultado: "sem_restricao", fonte: conferenciaFonte } })
            }
            await apiAparelhos(storeId, `/${r.aparelho.id}/acao`, { method: "POST", body: { acao: "liberar" } })
            liberado = true
          } catch (e) {
            toast.warning(`Aparelho ${r.aparelho.codigoInterno} cadastrado, mas não liberado: ${(e as Error).message}`)
          }
        }
        toast.success(liberado ? `Aparelho ${r.aparelho.codigoInterno} cadastrado e disponível para venda.` : `Aparelho ${r.aparelho.codigoInterno} cadastrado. Libere para venda após a conferência.`)
        onSaved(r.aparelho.id)
      }
      onOpenChange(false)
    } catch (e) {
      const err = e as ApiError
      toast.error(err.message)
      if (err.field) document.getElementById(`apa-${err.field === "imei1" ? "imei1" : err.field === "imei2" ? "imei2" : err.field}`)?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0! p-0! sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>{editing ? `Editar ${mode.aparelho.codigoInterno}` : origem === "fornecedor" || origem === "lote" ? "Entrada por fornecedor / lote" : "Cadastrar aparelho"}</DialogTitle>
          <DialogDescription>{editing ? "Alterações ficam registradas no histórico do aparelho." : "Uma unidade física, identificada pelo IMEI ou número de série."}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {(origem === "fornecedor" || origem === "lote") && (
            <div className="mb-5 min-w-0 space-y-1.5">
              <FieldLabel htmlFor="apa-fornecedor">Fornecedor</FieldLabel>
              <select id="apa-fornecedor" className={inputCls} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">{fornecedores.length ? "Selecione (opcional)" : "Nenhum fornecedor cadastrado"}</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          {editing && mode.aparelho.identificadoresMascarados && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">IMEI e série ficam ocultos para o seu perfil e não serão alterados.</p>}
          <AparelhoCampos d={d} set={set} perms={perms} politica={politica} />
          {!editing && !perms.alterarStatus && (
            <p className="mt-6 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">O aparelho fica aguardando conferência. A liberação para venda é feita por um gerente ou pelo proprietário.</p>
          )}
          {!editing && perms.alterarStatus && (
            <section className="mt-6 min-w-0 space-y-3 rounded-xl border border-border p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={liberar} onChange={(e) => setLiberar(e.target.checked)} />
                <span className="min-w-0 text-sm"><span className="font-medium text-foreground">Liberar para venda agora</span>
                  <span className="block text-xs text-muted-foreground">Entra no estoque da loja pelo livro-razão. Sem esta opção, o aparelho fica aguardando conferência.</span></span>
              </label>
              {liberar && d.condicao !== "novo_lacrado" && politica.liberacaoExigeConferencia && (
                <div className="min-w-0 space-y-1.5">
                  <FieldLabel htmlFor="apa-conf" required>Conferência de restrição do IMEI — onde foi consultado</FieldLabel>
                  <input id="apa-conf" className={inputCls} value={conferenciaFonte} onChange={(e) => setConferenciaFonte(e.target.value)} placeholder="Ex.: consulta manual no portal oficial de IMEI em 12/11" />
                  <p className="text-xs text-muted-foreground">Registro manual com data e operador. O sistema não afirma que o aparelho está “limpo” sem uma consulta feita.</p>
                </div>
              )}
            </section>
          )}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar alterações" : "Cadastrar aparelho"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
