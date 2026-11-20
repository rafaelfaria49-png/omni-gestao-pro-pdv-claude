"use client"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PilotProvisioning, type ProvisioningPrefill } from "@/components/platform/PilotProvisioning"
import { RAMOS_SOLICITACAO, PLANOS_GESTAO_LOJAS } from "@/lib/comercial/gestao-lojas-oferta"
import { linkWhatsappInteressado } from "@/lib/comercial/atendimento"

type Solicitacao = {
  id: string; protocolo: string; nome: string; nomeLoja: string; email: string; whatsapp: string
  ramo: string; planoInteresse: string | null; mensagem: string | null; status: string; createdAt: string
}

const STATUS_LABEL: Record<string, string> = { recebida: "Nova", em_contato: "Em contato", provisionada: "Acesso liberado", descartada: "Descartada" }

/**
 * Painel da plataforma: solicitações vindas de `/gestao-lojas` + o provisionamento
 * assistido existente. "Usar no provisionamento" só copia os dados para o formulário;
 * a conta só existe depois que a plataforma clica em "Provisionar cliente".
 */
export function PlataformaComercial() {
  const [prefill, setPrefill] = useState<ProvisioningPrefill | null>(null)
  const [versao, setVersao] = useState(0)
  return <div className="space-y-10">
    <SolicitacoesTeste versao={versao} onUsar={(s) => {
      setPrefill({ key: s.id + Date.now(), storeName: s.nomeLoja, name: s.nome, email: s.email, branch: s.ramo, solicitacaoId: s.id, protocolo: s.protocolo })
      document.getElementById("provisionar-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }} />
    <PilotProvisioning prefill={prefill} onProvisionado={() => setVersao((v) => v + 1)} />
  </div>
}

function SolicitacoesTeste({ onUsar, versao }: { onUsar: (s: Solicitacao) => void; versao: number }) {
  const [lista, setLista] = useState<Solicitacao[] | null>(null)
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState("")
  const carregar = useCallback(async () => {
    const r = await fetch("/api/platform/solicitacoes-teste", { cache: "no-store" })
    if (!r.ok) throw new Error()
    setLista((await r.json()).solicitacoes)
  }, [])
  useEffect(() => { void carregar().catch(() => setErro("Não foi possível consultar as solicitações.")) }, [carregar, versao])

  async function mudarStatus(id: string, status: string) {
    setOcupado(id); setErro("")
    try {
      const r = await fetch("/api/platform/solicitacoes-teste", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.ok) throw new Error(data.erro || data.error || "Não foi possível atualizar.")
      await carregar()
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível atualizar.") } finally { setOcupado("") }
  }

  const abertas = lista?.filter((s) => s.status === "recebida" || s.status === "em_contato") ?? []
  return <section aria-labelledby="solicitacoes-titulo" className="mx-auto w-full max-w-4xl space-y-4">
    <header>
      <h2 id="solicitacoes-titulo" className="text-xl font-semibold">Solicitações de teste</h2>
      <p className="mt-1 text-sm text-muted-foreground">Pedidos feitos na página Vendas e Estoque. Registrar o pedido não cria conta: o acesso só existe depois do provisionamento abaixo.</p>
    </header>
    {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    {lista === null && !erro && <p className="text-sm text-muted-foreground">Carregando solicitações…</p>}
    {lista !== null && abertas.length === 0 && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Nenhuma solicitação aberta.</p>}
    <ul className="space-y-3">
      {abertas.map((s) => <li key={s.id} className="rounded-lg border border-border bg-card p-4" data-protocolo={s.protocolo}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="min-w-0 font-semibold">{s.nomeLoja} <span className="font-normal text-muted-foreground">· {s.nome}</span></p>
          <p className="text-xs text-muted-foreground">{s.protocolo} · {STATUS_LABEL[s.status] ?? s.status} · {new Date(s.createdAt).toLocaleString("pt-BR")}</p>
        </div>
        <p className="mt-1 break-all text-sm">{s.email} · WhatsApp {s.whatsapp}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {linkWhatsappInteressado(s.whatsapp) && <a className="text-primary underline-offset-4 hover:underline" href={linkWhatsappInteressado(s.whatsapp)!} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>}
          <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${s.email}?subject=${encodeURIComponent(`Pedido de teste ${s.protocolo} — OmniGestão Pro`)}`}>Responder por email</a>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{RAMOS_SOLICITACAO[s.ramo as keyof typeof RAMOS_SOLICITACAO] ?? s.ramo}{s.planoInteresse ? ` · interesse: ${PLANOS_GESTAO_LOJAS.find((p) => p.id === s.planoInteresse)?.nome ?? s.planoInteresse}` : ""}</p>
        {s.mensagem && <p className="mt-2 whitespace-pre-wrap text-sm">{s.mensagem}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onUsar(s)}>Usar no provisionamento</Button>
          {s.status === "recebida" && <Button size="sm" variant="outline" disabled={ocupado === s.id} onClick={() => void mudarStatus(s.id, "em_contato")}>Marcar em contato</Button>}
          <Button size="sm" variant="outline" disabled={ocupado === s.id} onClick={() => void mudarStatus(s.id, "provisionada")}>Marcar acesso liberado</Button>
          <Button size="sm" variant="ghost" disabled={ocupado === s.id} onClick={() => void mudarStatus(s.id, "descartada")}>Descartar</Button>
        </div>
      </li>)}
    </ul>
  </section>
}
