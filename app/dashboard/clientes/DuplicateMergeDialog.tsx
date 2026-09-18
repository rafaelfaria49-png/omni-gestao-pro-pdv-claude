"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

/**
 * CAD-R2-018-B — Revisão de duplicidades + merge no Cadastros HUB.
 *
 * Fluxo: lista de candidatos → comparação lado a lado → escolha explícita
 * do survivor → resolução dos campos → plano/fingerprint → confirmação
 * destrutiva explícita → merge. Sem merge em massa. O sistema nunca escolhe
 * o sobrevivente sozinho.
 */

type GroupMember = {
  id: string
  name: string
  kind: string
  document: string
  phone: string | null
  email: string | null
  city: string
  tags?: unknown
  active: boolean
  updatedAt: string
}

type PairRef = {
  aId: string
  bId: string
  outcome: string
  reasons: string[]
  reviewable: boolean
}

type DuplicateGroup = {
  key: string
  kind: string
  outcome: string
  reasons: string[]
  reviewable: boolean
  truncated: boolean
  memberIds: string[]
  members: GroupMember[]
  pairs: PairRef[]
}

type MergePlan = {
  storeId: string
  survivorId: string
  loserId: string
  pairOutcome: string
  pairReasons: string[]
  eligibility: string
  reviewable: boolean
  survivor: GroupMember & { tags?: unknown; links: Record<string, number> }
  loser: GroupMember & { tags?: unknown; links: Record<string, number> }
  resolvedFields: { changedFields: string[] }
  reassigned: Record<string, number>
  fingerprint: string
}

const OUTCOME_LABEL: Record<string, string> = {
  EXACT_DOCUMENT_MATCH: "Documento idêntico",
  POSSIBLE_CONTACT_MATCH: "Contato em comum",
  AMBIGUOUS: "Ambíguo (resolver)",
  IDENTITY_CONFLICT: "Conflito (bloqueado)",
  NO_MATCH: "Sem vínculo",
}

const LINK_LABEL: Record<string, string> = {
  ordensServico: "OS",
  vendas: "Vendas",
  whatsappConversations: "WhatsApp",
  clienteCreditos: "Créditos",
  omniAgentMemories: "Memórias",
  financialTransactions: "Financeiro",
}

function linksTotal(links: Record<string, number> | undefined): number {
  if (!links) return 0
  return Object.values(links).reduce((acc, n) => acc + (typeof n === "number" ? n : 0), 0)
}

function fmtLinks(links: Record<string, number> | undefined): string {
  if (!links) return "—"
  const parts = Object.entries(links)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${LINK_LABEL[k] ?? k}: ${n}`)
  return parts.length > 0 ? parts.join(" · ") : "sem vínculos"
}

type Draft = {
  nome: string
  kind: string
  documento: string
  telefone: string
  email: string
  cidade: string
  active: boolean
}

function draftFromMember(m: GroupMember): Draft {
  return {
    nome: m.name ?? "",
    kind: m.kind === "PJ" ? "PJ" : "PF",
    documento: m.document ?? "",
    telefone: m.phone ?? "",
    email: m.email ?? "",
    cidade: m.city ?? "",
    active: m.active,
  }
}

export function DuplicateMergeDialog(props: {
  open: boolean
  lojaId: string
  onClose: () => void
  onMerged: () => void
}) {
  const { open, lojaId, onClose, onMerged } = props
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [scanned, setScanned] = useState(0)
  const [truncatedScan, setTruncatedScan] = useState(false)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pair, setPair] = useState<{ aId: string; bId: string } | null>(null)
  const [survivorId, setSurvivorId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const headers = useMemo(() => ({ [ASSISTEC_LOJA_HEADER]: lojaId }), [lojaId])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    setError(null)
    try {
      const r = await fetch("/api/clientes/duplicates?scan=1", {
        cache: "no-store",
        credentials: "include",
        headers,
      })
      const data = (await r.json().catch(() => ({}))) as {
        groups?: DuplicateGroup[]
        scanned?: number
        truncated?: boolean
        error?: string
      }
      if (!r.ok) throw new Error(data.error ?? "Falha ao listar duplicidades")
      setGroups(Array.isArray(data.groups) ? data.groups : [])
      setScanned(typeof data.scanned === "number" ? data.scanned : 0)
      setTruncatedScan(Boolean(data.truncated))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar duplicidades")
    } finally {
      setLoadingGroups(false)
    }
  }, [headers])

  useEffect(() => {
    if (open) {
      setPair(null)
      setSurvivorId(null)
      setDraft(null)
      setPlan(null)
      setPlanKey(null)
      setConfirmed(false)
      setResult(null)
      setError(null)
      void loadGroups()
    }
  }, [open, loadGroups])

  const activeGroup = useMemo(() => {
    if (!pair) return null
    return groups.find((g) => g.memberIds.includes(pair.aId) && g.memberIds.includes(pair.bId)) ?? null
  }, [groups, pair])

  const memberA = activeGroup?.members.find((m) => m.id === pair?.aId) ?? null
  const memberB = activeGroup?.members.find((m) => m.id === pair?.bId) ?? null
  const survivor = survivorId === memberA?.id ? memberA : survivorId === memberB?.id ? memberB : null
  const loser = survivorId === memberA?.id ? memberB : survivorId === memberB?.id ? memberA : null

  const pickSurvivor = (id: string) => {
    setSurvivorId(id)
    setPlan(null)
    setPlanKey(null)
    setConfirmed(false)
    setResult(null)
    const m = id === memberA?.id ? memberA : id === memberB?.id ? memberB : null
    if (m) setDraft(draftFromMember(m))
  }

  const draftKey = draft ? JSON.stringify(draft) : null
  const dirty = plan !== null && draftKey !== null && draftKey !== planKey

  const requestPlan = async () => {
    if (!pair || !survivor || !loser || !draft) return
    setPlanning(true)
    setError(null)
    setResult(null)
    try {
      const r = await fetch("/api/clientes/merge/plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          survivorId: survivor.id,
          loserId: loser.id,
          resolution: {
            nome: draft.nome,
            kind: draft.kind,
            documento: draft.documento,
            telefone: draft.telefone === "" ? null : draft.telefone,
            email: draft.email === "" ? null : draft.email,
            cidade: draft.cidade,
            active: draft.active,
          },
        }),
      })
      const data = (await r.json().catch(() => ({}))) as { plan?: MergePlan; error?: string; code?: string }
      if (!r.ok || !data.plan) throw new Error(data.error ?? "Plano bloqueado")
      setPlan(data.plan)
      setPlanKey(draftKey)
      setConfirmed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar plano")
    } finally {
      setPlanning(false)
    }
  }

  const execute = async () => {
    if (!pair || !survivor || !loser || !plan || !draft) return
    setExecuting(true)
    setError(null)
    try {
      const r = await fetch("/api/clientes/merge/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          survivorId: survivor.id,
          loserId: loser.id,
          resolution: {
            nome: draft.nome,
            kind: draft.kind,
            documento: draft.documento,
            telefone: draft.telefone === "" ? null : draft.telefone,
            email: draft.email === "" ? null : draft.email,
            cidade: draft.cidade,
            active: draft.active,
          },
          fingerprint: plan.fingerprint,
          confirmation: { survivorId: survivor.id, loserId: loser.id },
        }),
      })
      const data = (await r.json().catch(() => ({}))) as {
        merge?: { reassigned?: Record<string, number> }
        error?: string
        code?: string
      }
      if (!r.ok) {
        const stale = r.status === 410 || data.code === "STALE_PLAN"
        throw new Error(`${data.error ?? "Merge bloqueado"}${stale ? " Gere um novo plano." : ""}`)
      }
      setResult({ ok: true, message: `Consolidação concluída (${linksTotal(data.merge?.reassigned)} vínculos transferidos).` })
      onMerged()
      void loadGroups()
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Falha ao executar merge" })
    } finally {
      setExecuting(false)
    }
  }

  if (!open) return null

  const startReview = (aId: string, bId: string) => {
    setPair({ aId, bId })
    setSurvivorId(null)
    setDraft(null)
    setPlan(null)
    setPlanKey(null)
    setConfirmed(false)
    setResult(null)
    setError(null)
  }

  const backToList = () => {
    setPair(null)
    setSurvivorId(null)
    setDraft(null)
    setPlan(null)
    setPlanKey(null)
    setConfirmed(false)
    setResult(null)
    setError(null)
    void loadGroups()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Revisar duplicidades</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pair ? "Compare, escolha o sobrevivente e resolva os campos finais." : `Varredura da loja (${scanned} clientes${truncatedScan ? ", limitada" : ""}). Nome sozinho nunca gera candidato.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            Fechar
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</div>
        ) : null}
        {result ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"}`}>
            {result.message}
          </div>
        ) : null}

        {!pair ? (
          <div className="mt-4">
            {loadingGroups ? (
              <p className="text-sm text-muted-foreground">Carregando candidatos…</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma duplicidade potencial encontrada nesta varredura.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <div key={g.key} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${g.outcome === "IDENTITY_CONFLICT" ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : g.outcome === "AMBIGUOUS" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"}`}>
                        {OUTCOME_LABEL[g.outcome] ?? g.outcome}
                      </span>
                      <span className="text-xs text-muted-foreground">{g.kind === "EXACT_DOCUMENT" ? "documento" : "contato"} · {g.members.length} cadastros{g.truncated ? " (parcial)" : ""}</span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {g.pairs.filter((p) => p.reviewable).slice(0, 5).map((p) => {
                        const a = g.members.find((m) => m.id === p.aId)
                        const b = g.members.find((m) => m.id === p.bId)
                        return (
                          <div key={`${p.aId}-${p.bId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                            <span className="text-foreground">{a?.name ?? p.aId} <span className="text-muted-foreground">⇄</span> {b?.name ?? p.bId}</span>
                            <button
                              type="button"
                              onClick={() => startReview(p.aId, p.bId)}
                              className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground hover:bg-muted border border-border"
                            >
                              Revisar par
                            </button>
                          </div>
                        )
                      })}
                      {g.pairs.filter((p) => p.reviewable).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Pares deste grupo estão bloqueados ({OUTCOME_LABEL[g.outcome] ?? g.outcome}).</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : memberA && memberB ? (
          <div className="mt-4 flex flex-col gap-4">
            <button type="button" onClick={backToList} className="self-start text-xs font-semibold text-muted-foreground hover:text-foreground">
              ← Voltar à lista
            </button>

            <div className="grid gap-3 md:grid-cols-2">
              {[memberA, memberB].map((m) => (
                <div key={m.id} className={`rounded-lg border p-3 ${survivorId === m.id ? "border-emerald-500/60" : "border-border"}`}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                    <input type="radio" name="survivor" checked={survivorId === m.id} onChange={() => pickSurvivor(m.id)} />
                    Manter este (sobrevivente)
                  </label>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Nome</dt><dd className="text-foreground">{m.name}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Documento</dt><dd className="text-foreground">{m.document || "—"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Telefone</dt><dd className="text-foreground">{m.phone || "—"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="text-foreground">{m.email || "—"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Tags</dt><dd className="text-foreground break-all">{m.tags == null || m.tags === "" ? "—" : typeof m.tags === "string" ? m.tags : JSON.stringify(m.tags)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Vínculos</dt><dd className="text-foreground">{plan ? fmtLinks(survivorId === m.id ? plan.survivor.links : plan.loser.links) : "—"}</dd></div>
                  </dl>
                </div>
              ))}
            </div>

            {survivor && loser && draft ? (
              <div className="rounded-lg border border-border p-3">
                <h3 className="text-sm font-bold text-foreground">Campos finais do sobrevivente</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-muted-foreground">Nome<input value={draft.nome} onChange={(e) => { setDraft({ ...draft, nome: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
                  <label className="text-xs text-muted-foreground">Tipo<select value={draft.kind} onChange={(e) => { setDraft({ ...draft, kind: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"><option value="PF">Pessoa Física</option><option value="PJ">Pessoa Jurídica</option></select></label>
                  <label className="text-xs text-muted-foreground">Documento<input value={draft.documento} onChange={(e) => { setDraft({ ...draft, documento: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
                  <label className="text-xs text-muted-foreground">Telefone<input value={draft.telefone} onChange={(e) => { setDraft({ ...draft, telefone: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
                  <label className="text-xs text-muted-foreground">E-mail<input value={draft.email} onChange={(e) => { setDraft({ ...draft, email: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
                  <label className="text-xs text-muted-foreground">Cidade<input value={draft.cidade} onChange={(e) => { setDraft({ ...draft, cidade: e.target.value }); setPlan(null); setPlanKey(null); setConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={draft.active} onChange={(e) => { setDraft({ ...draft, active: e.target.checked }); setPlan(null); setPlanKey(null); setConfirmed(false) }} />
                  Cadastro ativo
                </label>
                <p className="mt-1 text-[11px] text-muted-foreground">Total gasto não é editável aqui: os vínculos reais (vendas/OS) transferidos continuam sendo a fonte operacional.</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void requestPlan()}
                    disabled={planning}
                    className="h-9 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground border border-border hover:bg-muted disabled:opacity-50"
                  >
                    {planning ? "Gerando…" : plan && !dirty ? "Atualizar plano" : "Gerar plano"}
                  </button>
                  {plan ? (
                    <span className="text-xs text-muted-foreground">
                      {OUTCOME_LABEL[plan.pairOutcome] ?? plan.pairOutcome} · transfere {linksTotal(plan.reassigned)} vínculos · plano {plan.fingerprint.slice(0, 12)}{dirty ? " · MODIFICADO — gere novo plano" : ""}
                    </span>
                  ) : null}
                </div>

                {plan && !dirty ? (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                      <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                      <span>Entendo que <strong>{loser.name}</strong> será <strong>removido permanentemente</strong> após transferir {linksTotal(plan.reassigned)} vínculo(s) para <strong>{survivor.name}</strong>. Histórico de vendas, OS e documentos fiscais não será reescrito.</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void execute()}
                      disabled={!confirmed || executing}
                      className="mt-2 h-9 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {executing ? "Consolidando…" : "Consolidar (remover duplicado)"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Escolha explicitamente qual cadastro sobrevive. O sistema nunca escolhe sozinho.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
