"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Copy, Download, History, ImageIcon, Pin, RefreshCw, Send, Sparkles } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { IaMestreSubPageShell } from "@/components/ia-mestre/IaMestreSubPageShell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const LS_CONFIG = "ia-mestre-config-v1"
const LS_HISTORY = "ia-mestre-gerador-historico-v1"

type Aspect = "1:1" | "16:9" | "9:16" | "3:1"
type StyleOpt = "Realista" | "Cartoon" | "Minimalista" | "Fotográfico" | "Logo" | "Ilustração"
type Tone = "Profissional" | "Criativo" | "Elegante" | "Vibrante"

type GenItem = {
  id: string
  prompt: string
  aspect: Aspect
  style: StyleOpt
  tone: Tone
  createdAt: string
  dataUrl: string
}

const SUGGESTIONS = [
  "Logo moderna para loja de celular",
  "Banner promoção Black Friday",
  "Post Instagram produto tecnologia",
  "Foto produto smartphone premium",
]

function aspectToSize(aspect: Aspect): { w: number; h: number } {
  switch (aspect) {
    case "16:9":
      return { w: 640, h: 360 }
    case "9:16":
      return { w: 360, h: 640 }
    case "3:1":
      return { w: 720, h: 240 }
    default:
      return { w: 400, h: 400 }
  }
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function buildPlaceholderDataUrl(prompt: string, aspect: Aspect, style: StyleOpt, tone: Tone): string {
  const { w, h } = aspectToSize(aspect)
  const short = (prompt || "Pré-visualização").slice(0, 80)
  const hue =
    tone === "Vibrante"
      ? "280"
      : tone === "Elegante"
        ? "210"
        : tone === "Criativo"
          ? "25"
          : "145"
  const c2 = style === "Cartoon" ? "ff9ecd" : style === "Minimalista" ? "e2e8f0" : "38bdf8"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 70% 35%)"/>
    <stop offset="1" stop-color="#${c2}"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="16" y="16" width="${w - 32}" height="${h - 32}" fill="rgba(0,0,0,0.22)" rx="14"/>
  <text x="50%" y="${h / 2 - 12}" text-anchor="middle" fill="rgba(255,255,255,0.95)" font-family="system-ui,sans-serif" font-size="${Math.max(12, Math.min(18, w / 28))}">IA Mestre • Mock</text>
  <text x="50%" y="${h / 2 + 16}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif" font-size="${Math.max(10, Math.min(14, w / 35))}">${escapeXml(short)}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function GeradorImagensView() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState<StyleOpt>("Logo")
  const [aspect, setAspect] = useState<Aspect>("1:1")
  const [tone, setTone] = useState<Tone>("Profissional")
  const [generating, setGenerating] = useState(false)
  const [current, setCurrent] = useState<GenItem | null>(null)
  const [history, setHistory] = useState<GenItem[]>([])
  const [credits, setCredits] = useState(2595)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_CONFIG)
      if (raw) {
        const p = JSON.parse(raw) as { creditsUsed?: number; creditsTotal?: number }
        const used = typeof p.creditsUsed === "number" ? p.creditsUsed : 2405
        const total = typeof p.creditsTotal === "number" ? p.creditsTotal : 5000
        setCredits(Math.max(0, total - used))
      }
      const h = localStorage.getItem(LS_HISTORY)
      if (h) {
        const p = JSON.parse(h) as GenItem[]
        if (Array.isArray(p)) setHistory(p.slice(0, 8))
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(history))
    } catch {
      /* ignore */
    }
  }, [history])

  const pushHistory = useCallback((item: GenItem) => {
    setHistory((prev) => {
      const next = [item, ...prev.filter((x) => x.id !== item.id)].slice(0, 8)
      return next
    })
  }, [])

  const runGenerate = useCallback(
    (basePrompt: string, variation?: boolean) => {
      const text = (variation ? `${basePrompt} (variação)` : basePrompt).trim()
      if (!text) {
        toast({ title: "Descreva a imagem", variant: "destructive" })
        return
      }
      if (credits < 1) {
        toast({
          title: "Créditos insuficientes",
          description: "Adquira mais créditos em Configurações.",
          variant: "destructive",
        })
        return
      }
      setGenerating(true)
      setCurrent(null)
      window.setTimeout(() => {
        const dataUrl = buildPlaceholderDataUrl(text, aspect, style, tone)
        const item: GenItem = {
          id: crypto.randomUUID(),
          prompt: text,
          aspect,
          style,
          tone,
          createdAt: new Date().toISOString(),
          dataUrl,
        }
        setCurrent(item)
        pushHistory(item)
        setCredits((c) => {
          const newC = Math.max(0, c - 1)
          try {
            const raw = localStorage.getItem(LS_CONFIG)
            const cfg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
            const total = typeof cfg.creditsTotal === "number" ? cfg.creditsTotal : 5000
            const next = { ...cfg, creditsUsed: Math.max(0, total - newC) }
            const nextStr = JSON.stringify(next)
            localStorage.setItem(LS_CONFIG, nextStr)
            window.dispatchEvent(new StorageEvent("storage", { key: LS_CONFIG, newValue: nextStr }))
          } catch { /* ignore */ }
          return newC
        })
        setGenerating(false)
        toast({ title: "Imagem gerada (mock)", description: "Preview SVG para demonstração." })
      }, 2000)
    },
    [aspect, credits, pushHistory, style, tone, toast],
  )

  const handleDownload = () => {
    if (!current?.dataUrl) return
    const a = document.createElement("a")
    a.href = current.dataUrl
    a.download = "ia-mestre-imagem-mock.svg"
    a.click()
    toast({ title: "Download iniciado" })
  }

  const handleCopyUrl = async () => {
    if (!current?.dataUrl) return
    await navigator.clipboard.writeText(current.dataUrl)
    toast({ title: "URL copiada" })
  }

  const histCols = useMemo(() => history.slice(0, 8), [history])

  return (
    <IaMestreSubPageShell
      title="Gerador de Imagens"
      subtitle="Crie artes e logos com orientação da IA (mock)"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Novo
        </span>
      }
    >
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-5 shadow-elegant backdrop-blur-md">
          <div>
            <Label className="text-[11px]">Descreva a imagem</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-2 min-h-[140px] resize-y text-[13px]"
              placeholder="Ex: Logo minimalista com ícone de smartphone..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[11px]">Estilo</Label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleOpt)}
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px]"
              >
                {(["Realista", "Cartoon", "Minimalista", "Fotográfico", "Logo", "Ilustração"] as StyleOpt[]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Proporção</Label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as Aspect)}
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px]"
              >
                <option value="1:1">Quadrado (1:1)</option>
                <option value="16:9">Paisagem (16:9)</option>
                <option value="9:16">Retrato (9:16)</option>
                <option value="3:1">Banner (3:1)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Tom</Label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px]"
              >
                {(["Profissional", "Criativo", "Elegante", "Vibrante"] as Tone[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">Sugestões rápidas</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="rounded-full border border-border bg-surface/60 px-3 py-1.5 text-left text-[12px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
            <span className="text-[11px] text-muted-foreground">
              Créditos disponíveis: <span className="font-semibold text-foreground">{credits.toLocaleString("pt-BR")}</span>
            </span>
            <Button
              type="button"
              className="h-11 rounded-xl px-6 text-[13px] shadow-elegant"
              disabled={generating || !prompt.trim()}
              onClick={() => runGenerate(prompt)}
            >
              <Sparkles className="mr-2 h-4 w-4" /> Gerar imagem
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="min-h-[280px] overflow-hidden rounded-2xl border border-border bg-card/60 shadow-elegant backdrop-blur-md">
            {!current && !generating ? (
              <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-muted/30">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <p className="text-[13px] font-medium">Sua imagem aparecerá aqui</p>
                <p className="text-[11px]">Preencha o formulário e clique em Gerar imagem.</p>
              </div>
            ) : null}
            {generating ? (
              <div className="flex h-[320px] flex-col items-center justify-center gap-3">
                <div className="h-32 w-64 animate-pulse rounded-xl bg-muted" />
                <p className="text-[12px] text-muted-foreground">Gerando imagem...</p>
              </div>
            ) : null}
            {current && !generating ? (
              <div className="p-4">
                <div className="mx-auto max-w-[320px] overflow-hidden rounded-[8px] border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.dataUrl} alt={current.prompt} className="h-auto w-full max-w-full" />
                </div>
                <div className="mx-auto mt-3 flex max-w-[320px] flex-wrap gap-2">
                  <Button type="button" size="sm" className="h-8 text-[12px]" onClick={handleDownload}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Baixar
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => void handleCopyUrl()}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copiar URL
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]" asChild>
                    <Link href="/dashboard/ia-mestre">
                      <Send className="mr-1 h-3.5 w-3.5" /> Usar no Chat
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 text-[12px]"
                    onClick={() => runGenerate(current.prompt, true)}
                    disabled={generating}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Variação
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[12px]"
                    onClick={() =>
                      toast({ title: "Fixado (mock)", description: "Sua imagem foi marcada nos favoritos locais." })
                    }
                  >
                    <Pin className="mr-1 h-3.5 w-3.5" /> Fixar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-md">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Histórico (últimas 8)
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AnimatePresence>
                {histCols.map((h) => (
                  <motion.button
                    key={h.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    type="button"
                    className="group relative overflow-hidden rounded-xl border border-border bg-muted/20"
                    onClick={() => setCurrent(h)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.dataUrl} alt="" className="aspect-square w-full object-cover opacity-90 transition group-hover:opacity-100" />
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition group-hover:opacity-100">
                      <span className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground">Abrir</span>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </IaMestreSubPageShell>
  )
}
