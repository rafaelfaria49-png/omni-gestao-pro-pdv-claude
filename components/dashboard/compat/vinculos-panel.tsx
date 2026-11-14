"use client"

/**
 * COMPAT-PROFISSIONAL-001 — vínculos de compatibilidade de UM modelo principal.
 *
 * Uma categoria por painel (película OU capinha) — nunca se misturam. Vincular vários modelos
 * de uma vez, mudar status, remover. "Confirmada" exige marcar que o encaixe foi testado
 * fisicamente (registrado com quem/quando). Nada é inferido de nome ou anúncio.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Link2, Loader2, ShieldCheck, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { LojaCompatCategoria, LojaCompatStatus } from "@/lib/catalogo-aparelhos/loja-catalogo"
import {
  carregarVinculos,
  gravarVinculos,
  type ModeloCompatDTO,
  type VinculoDTO,
} from "@/lib/compat/compat-client"
import { CompatStatusBadge, COMPAT_STATUS_UI, STATUS_EDITAVEIS } from "./compat-status"
import { ModeloPicker, type ModeloEscolhido } from "./modelo-picker"

const TEXTO: Record<LojaCompatCategoria, { titulo: string; peca: string }> = {
  pelicula_tela: { titulo: "Vínculos de película", peca: "película" },
  capinha: { titulo: "Vínculos de capinha", peca: "capinha" },
}

export function VinculosPanel({
  categoria,
  lojaHeader,
  modeloInicial,
}: {
  categoria: LojaCompatCategoria
  lojaHeader: string | null
  modeloInicial?: ModeloEscolhido | null
}) {
  const uid = useId()
  const t = TEXTO[categoria]
  const [principal, setPrincipal] = useState<ModeloEscolhido | null>(modeloInicial ?? null)
  const [modelo, setModelo] = useState<ModeloCompatDTO | null>(null)
  const [vinculos, setVinculos] = useState<VinculoDTO[]>([])
  const [globais, setGlobais] = useState<{ modelKey: string; canonicalName: string; brand: string; groupName: string; status: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState("")
  const [aviso, setAviso] = useState("")

  // Formulário de novo vínculo
  const [novos, setNovos] = useState<ModeloEscolhido[]>([])
  const [status, setStatus] = useState<LojaCompatStatus>("precisa_testar")
  const [origem, setOrigem] = useState("")
  const [testado, setTestado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmarPara, setConfirmarPara] = useState<VinculoDTO | null>(null)

  useEffect(() => {
    if (modeloInicial) setPrincipal(modeloInicial)
  }, [modeloInicial])

  // Só a resposta da consulta MAIS RECENTE (do modelo/categoria atuais) pode preencher a tela:
  // resposta atrasada de outro modelo faria a edição gravar no par errado.
  const reqRef = useRef(0)
  // Modelo selecionado AGORA: recarga disparada por uma gravação antiga não pode trazer outro par.
  const atualRef = useRef(principal)
  useEffect(() => {
    atualRef.current = principal
  }, [principal])
  const load = useCallback(async () => {
    const meu = ++reqRef.current
    if (!principal) return
    setLoading(true)
    const r = await carregarVinculos(lojaHeader, categoria, principal.modelKey)
    if (meu !== reqRef.current || atualRef.current?.modelKey !== principal.modelKey) return
    setLoading(false)
    if (r.ok && r.modelo.modelKey !== principal.modelKey) return
    if (!r.ok) {
      setErro(r.error)
      return
    }
    setErro("")
    setModelo(r.modelo)
    setVinculos(r.vinculos)
    setGlobais(r.globais)
  }, [principal, lojaHeader, categoria])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    setVinculos([])
    setGlobais([])
    setModelo(null)
    setNovos([])
    void load()
  }, [load])

  // Trocar o principal invalida qualquer resposta em voo.
  useEffect(() => {
    if (!principal) {
      reqRef.current++
      setLoading(false)
    }
  }, [principal])

  const gravar = async (
    input: { otherModelKeys: string[]; decisao: "adicionar" | "suprimir" | "restaurar"; status?: LojaCompatStatus; origem?: string; confirmacaoFisica?: boolean },
  ) => {
    if (!principal) return false
    setSalvando(true)
    const r = await gravarVinculos(lojaHeader, { categoria, modelKey: principal.modelKey, ...input })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.error)
      return false
    }
    setErro("")
    setAviso(r.falhas > 0 ? `${r.gravados} gravado(s); ${r.falhas} não puderam ser gravados.` : "")
    // Recarrega a seleção ATUAL (se o operador trocou de modelo durante a gravação, não a antiga).
    await loadRef.current()
    return true
  }

  const vincular = async () => {
    if (novos.length === 0) return
    const ok = await gravar({
      otherModelKeys: novos.map((n) => n.modelKey),
      decisao: "adicionar",
      status,
      origem,
      ...(status === "confirmado_loja" ? { confirmacaoFisica: testado } : {}),
    })
    if (ok) {
      setNovos([])
      setTestado(false)
    }
  }

  const ativos = vinculos.filter((v) => v.acao === "adicionar")
  const suprimidos = vinculos.filter((v) => v.acao === "suprimir")
  const suprimidosKeys = new Set(suprimidos.map((s) => s.modelKey))
  const excluir = [principal?.modelKey ?? "", ...vinculos.map((v) => v.modelKey), ...novos.map((n) => n.modelKey)]

  if (!lojaHeader) {
    return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Selecione uma loja.</p>
  }

  return (
    <section aria-label={t.titulo} className="min-w-0 space-y-4">
      <div className="space-y-1.5 min-w-0">
        <Label>Modelo principal</Label>
        {principal ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{principal.canonicalName}</p>
              {modelo && (
                <p className="truncate text-xs text-muted-foreground">
                  {[modelo.hierarquia.fabricante, modelo.hierarquia.marca, modelo.hierarquia.linha].filter(Boolean).join(" › ")}
                  {modelo.source === "loja" ? " · cadastro da loja" : ""}
                </p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPrincipal(null)}>
              Trocar modelo
            </Button>
          </div>
        ) : (
          <ModeloPicker lojaHeader={lojaHeader} label="Modelo principal" onSelect={setPrincipal} autoFocus />
        )}
      </div>

      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {aviso && <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">{aviso}</p>}

      {principal && (
        <>
          {/* Vincular */}
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Vincular modelos que usam a mesma {t.peca}</h3>
            </div>
            <ModeloPicker
              lojaHeader={lojaHeader}
              label={`Modelo compatível (${t.peca})`}
              placeholder="Adicione um ou mais modelos…"
              excluir={excluir}
              onSelect={(m) => setNovos((arr) => (arr.some((x) => x.modelKey === m.modelKey) ? arr : [...arr, m]))}
            />
            {novos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {novos.map((n) => (
                  <Badge key={n.modelKey} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                    <span className="max-w-[14rem] truncate">{n.canonicalName}</span>
                    <button
                      type="button"
                      aria-label={`Remover ${n.canonicalName} da lista`}
                      className="rounded-sm px-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setNovos((arr) => arr.filter((x) => x.modelKey !== n.modelKey))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor={`${uid}-status`}>Status</Label>
                <select
                  id={`${uid}-status`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as LojaCompatStatus)
                    setTestado(false)
                  }}
                >
                  {STATUS_EDITAVEIS.map((s) => (
                    <option key={s} value={s}>
                      {COMPAT_STATUS_UI[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor={`${uid}-origem`}>Origem (opcional)</Label>
                <Input
                  id={`${uid}-origem`}
                  value={origem}
                  maxLength={120}
                  onChange={(e) => setOrigem(e.target.value)}
                  placeholder="Ex.: tabela do fornecedor, teste no balcão"
                />
              </div>
            </div>
            {status === "confirmado_loja" && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
                <Checkbox checked={testado} onCheckedChange={(v) => setTestado(v === true)} className="mt-0.5" />
                <span>
                  Testei fisicamente: a {t.peca} encaixa nos modelos selecionados.
                  <span className="block text-xs text-muted-foreground">Fica registrado quem confirmou e quando.</span>
                </span>
              </label>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void vincular()}
                disabled={salvando || novos.length === 0 || (status === "confirmado_loja" && !testado)}
              >
                {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Vincular {novos.length > 0 ? `${novos.length} modelo(s)` : ""}
              </Button>
            </div>
          </div>

          {/* Lista */}
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Vínculos da loja {loading && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" />}
            </h3>
            {!loading && ativos.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum vínculo de {t.peca} cadastrado pela loja para este modelo.
              </p>
            )}
            <ul className="min-w-0 divide-y divide-border rounded-lg border border-border bg-card">
              {ativos.map((v) => (
                <li key={v.modelKey} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{v.canonicalName}</span>
                      <CompatStatusBadge status={v.status} curto />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        v.origem && `origem: ${v.origem}`,
                        v.status === "confirmado_loja" && v.confirmedAt
                          ? `confirmada em ${new Date(v.confirmedAt).toLocaleDateString("pt-BR")}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Informada pela loja"}
                    </p>
                  </div>
                  <select
                    aria-label={`Status de ${v.canonicalName}`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={v.status}
                    disabled={salvando || loading}
                    onChange={(e) => {
                      const novo = e.target.value as LojaCompatStatus
                      if (novo === "confirmado_loja") setConfirmarPara(v)
                      else void gravar({ otherModelKeys: [v.modelKey], decisao: "adicionar", status: novo })
                    }}
                  >
                    {STATUS_EDITAVEIS.map((s) => (
                      <option key={s} value={s}>
                        {COMPAT_STATUS_UI[s].curto}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={salvando || loading}
                    aria-label={`Remover vínculo com ${v.canonicalName}`}
                    onClick={() => void gravar({ otherModelKeys: [v.modelKey], decisao: "restaurar" })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {/* Catálogo global de película (somente película) */}
          {categoria === "pelicula_tela" && (globais.length > 0 || suprimidos.length > 0) && (
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Catálogo padrão de película</h3>
              <p className="text-xs text-muted-foreground">
                Relações do catálogo base. Se uma não serve na sua loja, esconda-a só aqui (o catálogo base não muda).
              </p>
              <ul className="min-w-0 divide-y divide-border rounded-lg border border-border bg-card">
                {globais.map((g) => {
                  const escondido = suprimidosKeys.has(g.modelKey)
                  return (
                    <li key={`${g.groupName}-${g.modelKey}`} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className={escondido ? "truncate text-sm text-muted-foreground line-through" : "truncate text-sm text-foreground"}>
                            {g.canonicalName}
                          </span>
                          <CompatStatusBadge status={g.status} curto />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{g.groupName}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={salvando || loading}
                        onClick={() =>
                          void gravar({ otherModelKeys: [g.modelKey], decisao: escondido ? "restaurar" : "suprimir" })
                        }
                      >
                        {escondido ? "Mostrar de novo" : "Esconder nesta loja"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirmarPara !== null} onOpenChange={(o) => !o && setConfirmarPara(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" /> Confirmar compatibilidade física
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você testou e a {t.peca} de {principal?.canonicalName} encaixa em {confirmarPara?.canonicalName}? A confirmação
              fica registrada em seu nome e passa a ser exibida como “Confirmada pela loja”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não testei</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const v = confirmarPara
                setConfirmarPara(null)
                if (v) {
                  void gravar({ otherModelKeys: [v.modelKey], decisao: "adicionar", status: "confirmado_loja", confirmacaoFisica: true })
                }
              }}
            >
              Sim, testei e encaixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
