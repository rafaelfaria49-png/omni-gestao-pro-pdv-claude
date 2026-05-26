"use client"

import { GraduationCap, Plus, Save, Sparkles, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { IaMestreSubPageShell } from "@/components/ia-mestre/IaMestreSubPageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const LS_KEY = "ia-mestre-treinar-v1"

type Segment = "Assistência Técnica" | "Variedades" | "Supermercado"
type Voice = "Formal" | "Consultivo" | "Amigável" | "Descontraído"

type CannedKey =
  | "saudacao"
  | "orcamento_nao_aprovado"
  | "cliente_insatisfeito"
  | "sem_estoque"
  | "prazo_entrega"

const CANNED_LABELS: Record<CannedKey, string> = {
  saudacao: "Saudação inicial",
  orcamento_nao_aprovado: "Orçamento não aprovado",
  cliente_insatisfeito: "Cliente insatisfeito",
  sem_estoque: "Produto sem estoque",
  prazo_entrega: "Prazo de entrega",
}

type TrainingState = {
  storeName: string
  segment: Segment
  voice: Voice
  description: string
  differentials: string
  products: string[]
  services: string[]
  priceRange: string
  canned: Record<CannedKey, string>
}

const DEFAULT_STATE: TrainingState = {
  storeName: "RafaCell",
  segment: "Assistência Técnica",
  voice: "Consultivo",
  description: "Assistência técnica especializada em smartphones e notebooks.",
  differentials: "Garantia estendida, peças originais e atendimento rápido.",
  products: ["Smartphones", "Películas", "Capas", "Carregadores"],
  services: ["Troca de tela", "Reparo de placa", "Backup"],
  priceRange: "R$ 80 — R$ 1.200",
  canned: {
    saudacao: "Olá! Sou da RafaCell. Como posso ajudar com seu aparelho hoje?",
    orcamento_nao_aprovado: "Sem problemas! Quer revisar o orçamento ou tentar uma alternativa?",
    cliente_insatisfeito: "Sinto muito pela experiência. Vamos resolver: me conte o que aconteceu.",
    sem_estoque: "Este item está em reposição. Posso reservar ou sugerir um similar?",
    prazo_entrega: "O prazo estimado é de 3 a 5 dias úteis, conforme a análise técnica.",
  },
}

function simulateReply(question: string, s: TrainingState): string {
  const q = (question || "").trim() || "uma dúvida geral"
  const lower = q.toLowerCase()
  let extra = ""
  if (/(estoque|sem estoque|acabou)/i.test(lower)) extra = `\n\nTrecho padrão (estoque):\n${s.canned.sem_estoque}`
  else if (/(orçamento|não aprov|nao aprov|recus)/i.test(lower)) extra = `\n\nTrecho padrão (orçamento):\n${s.canned.orcamento_nao_aprovado}`
  else if (/(insatisfeito|reclama|problema|ruim)/i.test(lower)) extra = `\n\nTrecho padrão (insatisfação):\n${s.canned.cliente_insatisfeito}`
  else if (/(prazo|entrega|quando fica)/i.test(lower)) extra = `\n\nTrecho padrão (prazo):\n${s.canned.prazo_entrega}`

  return [
    `[Simulação — ${s.storeName} | ${s.segment} | tom ${s.voice}]`,
    "",
    `Pergunta: “${q}”`,
    "",
    "Resposta sugerida:",
    "",
    `${s.canned.saudacao} A ${s.storeName} oferece ${s.services.slice(0, 4).join(", ")} (entre outros), com faixa típica ${s.priceRange}.`,
    `Ref.: ${s.differentials}`,
    extra,
    "",
    s.description,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

export function TreinarIaView() {
  const { toast } = useToast()
  const [state, setState] = useState<TrainingState>(DEFAULT_STATE)
  const [productInput, setProductInput] = useState("")
  const [serviceInput, setServiceInput] = useState("")
  const [simQ, setSimQ] = useState("")
  const [simOut, setSimOut] = useState("")

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as TrainingState
        if (p && typeof p === "object") setState({ ...DEFAULT_STATE, ...p, canned: { ...DEFAULT_STATE.canned, ...p.canned } })
      }
    } catch {
      /* ignore */
    }
  }, [])

  const save = useCallback(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
      toast({ title: "Rascunho salvo neste navegador", description: "Não afeta respostas do LLM no servidor." })
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" })
    }
  }, [state, toast])

  const addProduct = () => {
    const v = productInput.trim()
    if (!v) return
    setState((s) => ({ ...s, products: [...s.products, v] }))
    setProductInput("")
  }
  const addService = () => {
    const v = serviceInput.trim()
    if (!v) return
    setState((s) => ({ ...s, services: [...s.services, v] }))
    setServiceInput("")
  }

  const runSim = () => {
    setSimOut(simulateReply(simQ, state))
  }

  return (
    <IaMestreSubPageShell
      title="Treinar IA"
      subtitle="Rascunho local — não altera o modelo nem o prompt do servidor"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <GraduationCap className="h-3 w-3" /> Só neste navegador
        </span>
      }
      actions={
        <Button type="button" className="h-9 gap-1.5 rounded-xl" onClick={save}>
          <Save className="h-4 w-4" /> Salvar treinamento
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
          Os dados salvos aqui ficam em <strong className="font-medium text-foreground">localStorage</strong> e não são
          enviados ao chat (/api/ai/orchestrate). O interruptor &quot;Identidade da
          Loja&quot; no chat aplica apenas um prefixo de tom — não este formulário. Treinamento real da loja virá em uma
          próxima fase.
        </p>
        <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <h2 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Identidade da loja
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[11px]">Nome da loja</Label>
              <Input
                value={state.storeName}
                onChange={(e) => setState((s) => ({ ...s, storeName: e.target.value }))}
                className="mt-1 h-9 text-[13px]"
              />
            </div>
            <div>
              <Label className="text-[11px]">Segmento</Label>
              <select
                value={state.segment}
                onChange={(e) => setState((s) => ({ ...s, segment: e.target.value as Segment }))}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
              >
                <option value="Assistência Técnica">Assistência Técnica</option>
                <option value="Variedades">Variedades</option>
                <option value="Supermercado">Supermercado</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Tom de voz</Label>
              <select
                value={state.voice}
                onChange={(e) => setState((s) => ({ ...s, voice: e.target.value as Voice }))}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
              >
                <option value="Formal">Formal</option>
                <option value="Consultivo">Consultivo</option>
                <option value="Amigável">Amigável</option>
                <option value="Descontraído">Descontraído</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Descrição da loja</Label>
              <Textarea
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                className="mt-1 min-h-[72px] text-[13px]"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Diferenciais</Label>
              <Textarea
                value={state.differentials}
                onChange={(e) => setState((s) => ({ ...s, differentials: e.target.value }))}
                className="mt-1 min-h-[64px] text-[13px]"
                placeholder="Ex: melhor preço, garantia estendida..."
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <h2 className="mb-4 text-[13px] font-semibold">Produtos e serviços</h2>
          <div className="mb-4">
            <Label className="text-[11px]">Produtos principais (tags)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.products.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px]"
                >
                  {t}
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-destructive/15"
                    aria-label="Remover"
                    onClick={() => setState((s) => ({ ...s, products: s.products.filter((_, j) => j !== i) }))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={productInput}
                onChange={(e) => setProductInput(e.target.value)}
                placeholder="Novo produto"
                className="h-9 max-w-xs text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProduct())}
              />
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={addProduct}>
                <Plus className="h-3.5 w-3.5" /> Adicionar produto
              </Button>
            </div>
          </div>
          <div className="mb-4">
            <Label className="text-[11px]">Serviços oferecidos</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.services.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px]"
                >
                  {t}
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-destructive/15"
                    aria-label="Remover"
                    onClick={() => setState((s) => ({ ...s, services: s.services.filter((_, j) => j !== i) }))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={serviceInput}
                onChange={(e) => setServiceInput(e.target.value)}
                placeholder="Novo serviço"
                className="h-9 max-w-xs text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addService())}
              />
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={addService}>
                <Plus className="h-3.5 w-3.5" /> Adicionar serviço
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Faixa de preço média</Label>
            <Input
              value={state.priceRange}
              onChange={(e) => setState((s) => ({ ...s, priceRange: e.target.value }))}
              className="mt-1 h-9 max-w-sm text-[13px]"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <h2 className="mb-4 text-[13px] font-semibold">Respostas padrão</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(CANNED_LABELS) as CannedKey[]).map((key) => (
              <div key={key} className="rounded-xl border border-border/80 bg-background/40 p-3">
                <Label className="text-[11px] font-medium">{CANNED_LABELS[key]}</Label>
                <Textarea
                  value={state.canned[key]}
                  onChange={(e) =>
                    setState((s) => ({ ...s, canned: { ...s.canned, [key]: e.target.value } }))
                  }
                  className="mt-2 min-h-[80px] text-[13px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2 h-8 text-[12px]"
                  onClick={() =>
                    toast({
                      title: "Rascunho local",
                      description: `${CANNED_LABELS[key]} — não enviado ao servidor.`,
                    })
                  }
                >
                  Salvar
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <h2 className="mb-4 text-[13px] font-semibold">Simular resposta (local)</h2>
          <Label className="text-[11px]">Como a IA responderia a...</Label>
          <Textarea
            value={simQ}
            onChange={(e) => setSimQ(e.target.value)}
            className="mt-2 min-h-[72px] text-[13px]"
            placeholder="Ex: Cliente pergunta se consertam iPhone hoje mesmo"
          />
          <Button type="button" className="mt-3 h-9" onClick={runSim}>
            Simular resposta
          </Button>
          {simOut ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-4 text-[12px] leading-relaxed text-foreground">
              {simOut}
            </pre>
          ) : null}
        </section>
      </div>
    </IaMestreSubPageShell>
  )
}
