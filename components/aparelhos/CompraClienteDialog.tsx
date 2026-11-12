"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Printer } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { resumoChecklist } from "@/lib/aparelhos/checklist"
import { APARELHO_CONDICAO_LABEL, type AparelhoCondicao } from "@/lib/aparelhos/lifecycle"
import { formatImei } from "@/lib/aparelhos/imei"
import { abrirDocumento, apiAparelhos, type AparelhoPermissions, type PoliticaAparelhos } from "./api"
import { AparelhoCampos, draftParaPayload, draftVazio, validarDraft, type AparelhoDraft } from "./AparelhoFormDialog"
import { FieldLabel, brl, inputCls } from "./parts"

const PASSOS = ["Vendedor", "Aparelho", "Valor e origem", "Revisão"] as const
const FORMAS = [["pix", "Pix"], ["dinheiro", "Dinheiro"], ["transferencia", "Transferência"], ["credito_loja", "Crédito na loja"], ["abatimento_venda", "Abatimento em venda"], ["outro", "Outro"]] as const
const DOCS = [["declaracao_procedencia", "Declaração de procedência (assinada no protocolo)"], ["nota_fiscal", "Nota fiscal de compra original"], ["recibo", "Recibo"], ["outro", "Outro documento"]] as const

function cpfValido(doc: string): boolean {
  const d = doc.replace(/\D/g, "")
  if (d.length === 14) return true
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function CompraClienteDialog({ open, onOpenChange, storeId, perms, politica, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; storeId: string; perms: AparelhoPermissions; politica: PoliticaAparelhos; onDone: () => void
}) {
  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState("")
  const [doc, setDoc] = useState("")
  const [telefone, setTelefone] = useState("")
  const [d, setD] = useState<AparelhoDraft>(() => draftVazio(politica))
  const [valor, setValor] = useState("")
  const [forma, setForma] = useState("pix")
  const [pago, setPago] = useState(false)
  const [docTipo, setDocTipo] = useState("declaracao_procedencia")
  const [docNumero, setDocNumero] = useState("")
  const [obs, setObs] = useState("")
  const [saving, setSaving] = useState(false)
  const [feito, setFeito] = useState<{ id: string; protocolo: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setPasso(0); setNome(""); setDoc(""); setTelefone(""); setD(draftVazio(politica)); setValor(""); setForma("pix"); setPago(false)
    setDocTipo("declaracao_procedencia"); setDocNumero(""); setObs(""); setFeito(null)
  }, [open, politica])

  const valorNum = Number(valor.replace(/\./g, "").replace(",", ".")) || 0

  function validarPasso(p: number): string | null {
    if (p === 0) {
      if (!nome.trim()) return "Informe o nome de quem está vendendo."
      if (!cpfValido(doc)) return "CPF inválido. Confira os dígitos."
    }
    if (p === 1) return validarDraft(d)
    if (p === 2) {
      if (!(valorNum > 0)) return "Informe o valor da compra."
      if (docTipo !== "declaracao_procedencia" && !docNumero.trim()) return "Informe o número do documento de origem."
    }
    return null
  }

  function avancar() {
    const e = validarPasso(passo)
    if (e) { toast.error(e); return }
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
  }

  async function confirmar() {
    for (let p = 0; p < 3; p++) { const e = validarPasso(p); if (e) { setPasso(p); toast.error(e); return } }
    setSaving(true)
    try {
      const payload = { ...draftParaPayload(d), custoAquisicao: 0, despesas: 0 }
      const r = await apiAparelhos<{ aquisicao: { id: string; protocolo: string } }>(storeId, "/aquisicoes", {
        method: "POST",
        body: {
          tipo: "compra_cliente", vendedorNome: nome, vendedorDocumento: doc, documentoOrigemTipo: docTipo, documentoOrigemNumero: docNumero,
          formaPagamento: forma, pagamentoStatus: pago ? "pago" : "pendente", valorTotal: valorNum,
          observacoes: [obs, telefone && `Telefone do vendedor: ${telefone}`].filter(Boolean).join("\n"), aparelhos: [payload],
        },
      })
      setFeito(r.aquisicao)
      toast.success(`Compra registrada: protocolo ${r.aquisicao.protocolo}. Aguarda aprovação de um gerente.`)
      onDone()
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }

  const r = resumoChecklist(d.checklist)

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>Comprar aparelho de cliente</DialogTitle>
          <DialogDescription>O aparelho só entra no estoque depois da aprovação e da liberação para venda.</DialogDescription>
          {!feito && (
            <ol className="mt-3 flex min-w-0 flex-wrap gap-1.5" aria-label="Etapas">
              {PASSOS.map((p, i) => (
                <li key={p} aria-current={i === passo ? "step" : undefined}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", i === passo ? "border-primary bg-primary/10 font-semibold text-primary" : i < passo ? "border-border text-foreground" : "border-border text-muted-foreground")}>
                  <span className="tabular-nums">{i + 1}</span>{p}
                </li>
              ))}
            </ol>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {feito ? (
            <div className="space-y-3 text-sm">
              <p className="text-base font-semibold text-foreground">Protocolo {feito.protocolo} registrado</p>
              <p className="text-muted-foreground">Imprima o protocolo para o vendedor assinar a declaração de procedência. Um gerente (que não seja você) precisa aprovar a compra; depois registre a conferência do IMEI e libere o aparelho para venda.</p>
              <Button variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "protocolo_aquisicao", formato: "a4", aquisicaoId: feito.id }).catch((e) => toast.error(e.message))}><Printer className="mr-2 h-4 w-4" />Imprimir protocolo</Button>
            </div>
          ) : passo === 0 ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-1.5 sm:col-span-3"><FieldLabel htmlFor="cc-nome" required>Nome completo de quem vende</FieldLabel><input id="cc-nome" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" /></div>
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="cc-doc" required>CPF</FieldLabel><input id="cc-doc" inputMode="numeric" className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value.replace(/[^\d.\-/]/g, "").slice(0, 18))} autoComplete="off" /></div>
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="cc-tel">Telefone</FieldLabel><input id="cc-tel" inputMode="tel" className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="off" /></div>
              <p className="text-xs text-muted-foreground sm:col-span-3">O CPF completo não fica gravado na compra: guardamos só a versão mascarada e um código de conferência.</p>
            </div>
          ) : passo === 1 ? (
            <AparelhoCampos d={d} set={(p) => setD((c) => ({ ...c, ...p }))} perms={perms} politica={politica} mostrarCusto={false} idPrefix="cc" />
          ) : passo === 2 ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="cc-valor" required>Valor pago ao cliente</FieldLabel><input id="cc-valor" inputMode="decimal" className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
              <div className="min-w-0 space-y-1.5"><FieldLabel htmlFor="cc-forma" required>Forma de pagamento</FieldLabel><select id="cc-forma" className={inputCls} value={forma} onChange={(e) => setForma(e.target.value)}>{FORMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={pago} onChange={(e) => setPago(e.target.checked)} />Pagamento já realizado</label>
              <p className="text-xs text-muted-foreground sm:col-span-2">Este registro não lança pagamento no Financeiro nem no caixa. Faça a saída pelo fluxo financeiro da loja.</p>
              <div className="min-w-0 space-y-1.5 sm:col-span-2"><FieldLabel htmlFor="cc-doc-tipo" required>Documento de origem</FieldLabel><select id="cc-doc-tipo" className={inputCls} value={docTipo} onChange={(e) => setDocTipo(e.target.value)}>{DOCS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              {docTipo !== "declaracao_procedencia" && <div className="min-w-0 space-y-1.5 sm:col-span-2"><FieldLabel htmlFor="cc-doc-num" required>Número do documento</FieldLabel><input id="cc-doc-num" className={inputCls} value={docNumero} onChange={(e) => setDocNumero(e.target.value)} /></div>}
              <div className="min-w-0 space-y-1.5 sm:col-span-2"><FieldLabel htmlFor="cc-obs">Observações</FieldLabel><textarea id="cc-obs" rows={2} className={cn(inputCls, "h-auto py-2")} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            </div>
          ) : (
            <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Vendedor</dt><dd>{nome} · CPF final {doc.replace(/\D/g, "").slice(-4)}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Aparelho</dt><dd>{[d.marca, d.modelo, d.armazenamento, d.cor].filter(Boolean).join(" ")} · {APARELHO_CONDICAO_LABEL[d.condicao as AparelhoCondicao]}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">IMEI</dt><dd className="font-mono">{d.imei1 ? formatImei(d.imei1) : d.serial}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Conferência</dt><dd>{r.aprovados} aprovados · {r.falhas} com falha · {r.naoTestados} não testados</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Valor</dt><dd className="font-semibold">{brl(valorNum)} · {FORMAS.find((f) => f[0] === forma)?.[1]} · {pago ? "pago" : "pendente"}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Origem</dt><dd>{DOCS.find((x) => x[0] === docTipo)?.[1]}{docNumero && ` nº ${docNumero}`}</dd></div>
            </dl>
          )}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          {feito ? <Button onClick={() => onOpenChange(false)}>Concluir</Button> : (
            <>
              <Button variant="outline" onClick={() => (passo === 0 ? onOpenChange(false) : setPasso(passo - 1))} disabled={saving}>{passo === 0 ? "Cancelar" : "Voltar"}</Button>
              {passo < PASSOS.length - 1 ? <Button onClick={avancar}>Continuar</Button> : <Button onClick={() => void confirmar()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar compra</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
