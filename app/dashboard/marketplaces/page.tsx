"use client"

import { useState } from "react"
import {
  ShoppingBag,
  Zap,
  Link2,
  PackageSearch,
  Camera,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ─── Types ──────────────────────────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected"

interface Marketplace {
  id: string
  name: string
  description: string
  logo: string
  color: string
}

const MARKETPLACES: Marketplace[] = [
  {
    id: "mercadolivre",
    name: "Mercado Livre",
    description: "Maior marketplace da América Latina",
    logo: "ML",
    color: "bg-yellow-400",
  },
  {
    id: "shopee",
    name: "Shopee",
    description: "Marketplace líder no Sudeste Asiático e Brasil",
    logo: "SP",
    color: "bg-orange-500",
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "E-commerce global com milhões de compradores",
    logo: "AZ",
    color: "bg-sky-600",
  },
  {
    id: "nuvemshop",
    name: "Nuvemshop",
    description: "Plataforma de e-commerce próprio e integrações",
    logo: "NS",
    color: "bg-violet-600",
  },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function MarketplaceCard({ market }: { market: Marketplace }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")

  const handleConnect = () => {
    if (status === "connected") return
    setStatus("connecting")
    setTimeout(() => setStatus("connected"), 2000)
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-card transition hover:shadow-elegant">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-12 w-12 flex-none place-items-center rounded-xl text-sm font-bold text-white ${market.color}`}
          >
            {market.logo}
          </span>
          <div>
            <p className="font-semibold text-foreground">{market.name}</p>
            <p className="text-sm text-muted-foreground">{market.description}</p>
          </div>
        </div>

        {status === "connected" ? (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">
            Conectado
          </Badge>
        ) : (
          <Badge variant="secondary">Desconectado</Badge>
        )}
      </div>

      <Button
        size="sm"
        variant={status === "connected" ? "outline" : "default"}
        className="w-full"
        onClick={handleConnect}
        disabled={status === "connecting"}
      >
        {status === "connecting" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {status === "connected" && <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />}
        {status === "disconnected" && <Link2 className="mr-2 h-4 w-4" />}
        {status === "connecting"
          ? "Conectando..."
          : status === "connected"
          ? "Gerenciar Conta"
          : "Conectar Conta"}
      </Button>
    </div>
  )
}

function ConnectionsTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {MARKETPLACES.map((m) => (
        <MarketplaceCard key={m.id} market={m} />
      ))}
    </div>
  )
}

function AdFactoryTab() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  const handleGenerate = () => {
    if (!url.trim()) return
    setLoading(true)
    setGenerated(false)
    setTimeout(() => {
      setLoading(false)
      setGenerated(true)
    }, 2200)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left – Form */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Clonador Inteligente</h2>
            <p className="text-sm text-muted-foreground">
              Cole a URL de um produto concorrente e gere um anúncio otimizado com IA.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="competitor-url">URL do Concorrente</Label>
            <Input
              id="competitor-url"
              placeholder="https://www.mercadolivre.com.br/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-base"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!url.trim() || loading}
            className="h-11 w-full text-base"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analisando com IA…
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Reescrever com IA
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right – Result placeholder */}
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        {generated ? (
          <div className="w-full space-y-3 text-left">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">Anúncio gerado</p>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Publicar
              </Button>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground leading-relaxed shadow-card">
              <p className="mb-2 font-medium">[Título otimizado com palavras-chave de alta conversão]</p>
              <p className="text-muted-foreground">
                Descrição reescrita com os diferenciais do produto destacados, gatilhos de urgência e
                linguagem adaptada ao público-alvo do marketplace selecionado.
              </p>
            </div>
          </div>
        ) : (
          <>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Zap className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Seus anúncios gerados aparecerão aqui
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function PlaceholderTab({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="grid min-h-[340px] place-items-center">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-10 text-center shadow-card">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">Em breve</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Em breve: <span className="font-medium text-foreground">{title}</span> está sendo preparado
          pela nossa equipe.
        </p>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketplacesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 lg:px-8 xl:px-10">
        {/* Header */}
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-glow">
            <ShoppingBag className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Hub de Marketplaces
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Gerencie suas integrações, crie anúncios com IA e sincronize estoques
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="conexoes" className="w-full">
          <TabsList className="mb-6 h-auto w-full rounded-2xl bg-muted/60 p-1 sm:w-auto sm:grid-cols-4 grid grid-cols-2 gap-1">
            <TabsTrigger value="conexoes" className="h-10 rounded-xl text-sm">
              <Link2 className="mr-2 h-4 w-4" />
              Conexões
            </TabsTrigger>
            <TabsTrigger value="fabrica" className="h-10 rounded-xl text-sm">
              <Zap className="mr-2 h-4 w-4" />
              Fábrica de Anúncios
            </TabsTrigger>
            <TabsTrigger value="fotos" className="h-10 rounded-xl text-sm">
              <Camera className="mr-2 h-4 w-4" />
              Estúdio de Fotos
            </TabsTrigger>
            <TabsTrigger value="estoque" className="h-10 rounded-xl text-sm">
              <PackageSearch className="mr-2 h-4 w-4" />
              Estoque
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conexoes">
            <ConnectionsTab />
          </TabsContent>

          <TabsContent value="fabrica">
            <AdFactoryTab />
          </TabsContent>

          <TabsContent value="fotos">
            <PlaceholderTab icon={Camera} title="Estúdio de Fotos" />
          </TabsContent>

          <TabsContent value="estoque">
            <PlaceholderTab icon={PackageSearch} title="Gestão de Estoque Omnicanal" />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
