"use client"

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Bot,
  MessageCircle,
  PackageSearch,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  User,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { ThemeProvider } from "@/components/ia-mestre/ThemeProvider";
import { ThemeSwitcher } from "@/components/ia-mestre/ThemeSwitcher";
import { Sidebar } from "@/components/ia-mestre/Sidebar";
import { RightPanel } from "@/components/ia-mestre/RightPanel";
import { ModelSelect, type ModelId } from "@/components/ia-mestre/ModelSelect";
import { IdentitySwitch } from "@/components/ia-mestre/IdentitySwitch";
import { ChatMessage, type ChatMsg } from "@/components/ia-mestre/ChatMessage";
import { ChatInput } from "@/components/ia-mestre/ChatInput";
import { TypingIndicator } from "@/components/ia-mestre/TypingIndicator";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { interpretAiApiError } from "@/lib/handleAiApiError";
import { notifyCreditBalanceUpdated } from "@/lib/creditsEvents";
import { getCreditCost } from "@/src/lib/ai/credit-costs";
import { useUserCredits } from "@/hooks/useUserCredits";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INITIAL_MESSAGES: ChatMsg[] = [
  {
    id: "1",
    role: "ai",
    content:
      "Olá, Rafael! 👋 As vendas da RafaCell subiram 18% essa semana. Quer que eu monte uma campanha de WhatsApp pra fechar o mês com chave de ouro?",
  },
  {
    id: "2",
    role: "user",
    content: "Cria uma logo nova pra minha assistência, algo moderno e tecnológico.",
  },
  {
    id: "3",
    role: "ai",
    content:
      "Aqui está a logo moderna que você pediu para a RafaCell! Curtiu o conceito? Posso gerar variações em outras cores.",
    image: {
      url: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=800&auto=format&fit=crop",
      tool: "Gerado com DALL·E 3",
    },
  },
];

type TemplateCategoryId = "vendas" | "estoque" | "financeiro";

type MagicTemplate = {
  title: string;
  prompt: string;
  icon: LucideIcon;
};

function extractLogoText(message: string) {
  const patterns: RegExp[] = [
    /logo (?:para|da|do|de)\s+["“”']?([^"“”'\n]+)["“”']?/i,
    /logotipo (?:para|da|do|de)\s+["“”']?([^"“”'\n]+)["“”']?/i,
    /marca (?:para|da|do|de)\s+["“”']?([^"“”'\n]+)["“”']?/i,
    /com o nome\s+["“”']?([^"“”'\n]+)["“”']?/i,
    /nome\s+["“”']([^"“”']+)["“”']/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}

function shouldAutoPopulateDocument(text: string): boolean {
  const t = (text || "").trim();
  if (t.length > 300) return true;
  const tl = t.toLowerCase();
  return (
    tl.includes("relatório") ||
    tl.includes("contrato") ||
    tl.includes("roteiro") ||
    tl.includes("campanha") ||
    tl.includes("proposta") ||
    tl.includes("planejamento")
  );
}

function inferDocumentTitle(text: string): string {
  const tl = (text || "").toLowerCase();
  if (tl.includes("relatório")) return "Relatório";
  if (tl.includes("contrato")) return "Contrato";
  if (tl.includes("roteiro")) return "Roteiro";
  if (tl.includes("campanha")) return "Campanha";
  if (tl.includes("proposta")) return "Proposta";
  return "Documento gerado";
}

const MAGIC_TEMPLATE_CATEGORIES: Array<{
  id: TemplateCategoryId;
  label: string;
  templates: MagicTemplate[];
}> = [
  {
    id: "vendas",
    label: "Vendas & Marketing",
    templates: [
      {
        title: "Reativar clientes inativos",
        prompt: "Crie uma mensagem de WhatsApp para reativar clientes que não compram há 3 meses. Use tom consultivo, oferta clara e CTA para responder no WhatsApp.",
        icon: MessageCircle,
      },
      {
        title: "Script de vendas por produto",
        prompt: "Crie um script de vendas para o produto [NOME DO PRODUTO]. Destaque benefícios, objeções comuns, argumentos de valor e uma chamada final para fechar a venda.",
        icon: ShoppingBag,
      },
      {
        title: "Campanha rápida de promoção",
        prompt: "Monte uma campanha de marketing para vender [PRODUTO/SERVIÇO] em 7 dias, com mensagem para WhatsApp, legenda para Instagram e uma oferta irresistível.",
        icon: Sparkles,
      },
    ],
  },
  {
    id: "estoque",
    label: "Estoque & Compras",
    templates: [
      {
        title: "Giro de estoque e promoção",
        prompt: "Analise o giro de estoque de [PRODUTO] e sugira uma promoção para queimar o saldo sem prejudicar a margem. Inclua preço, canal e argumento de venda.",
        icon: PackageSearch,
      },
      {
        title: "Negociação com fornecedor",
        prompt: "Como negociar descontos com o fornecedor [NOME]? Crie uma abordagem profissional com argumentos de volume, recorrência e formas de pagamento.",
        icon: ShoppingBag,
      },
      {
        title: "Compras inteligentes",
        prompt: "Crie uma checklist para decidir se devo comprar mais unidades de [PRODUTO], considerando giro, margem, capital parado, sazonalidade e risco de encalhe.",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    templates: [
      {
        title: "Lucro real da loja",
        prompt: "Quais métricas devo olhar para saber se minha loja deu lucro real este mês? Explique de forma prática e crie uma lista de indicadores para acompanhar.",
        icon: WalletCards,
      },
      {
        title: "Reduzir inadimplência",
        prompt: "Sugira uma estratégia para reduzir a inadimplência da minha loja, incluindo cobrança por WhatsApp, prevenção na venda e política de parcelamento.",
        icon: TrendingDown,
      },
      {
        title: "Diagnóstico financeiro mensal",
        prompt: "Monte um diagnóstico financeiro mensal para minha empresa com perguntas sobre faturamento, margem, custos fixos, estoque parado, contas a receber e caixa.",
        icon: BarChart3,
      },
    ],
  },
];

export default function IaMestrePage() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function toBackendModel(m: ModelId): string {
  return m;
}

function Shell() {
  const { toast } = useToast();
  const { credits } = useUserCredits();
  const [model, setModel] = useState<ModelId>("openai/gpt-5.5-pro");
  const [identityOn, setIdentityOn] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>(INITIAL_MESSAGES);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingImageRequest, setPendingImageRequest] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [docTitle, setDocTitle] = useState<string>("");
  const [docContent, setDocContent] = useState<string>("");

  const isImageIntent = useCallback((text: string) => {
    const t = (text || "").toLowerCase();
    if (!t.trim()) return false;
    return (
      t.includes("logo") ||
      t.includes("logotipo") ||
      t.includes("marca") ||
      t.includes("identidade visual") ||
      t.includes("imagem") ||
      t.includes("arte") ||
      t.includes("banner") ||
      t.includes("post") ||
      t.includes("anúncio") ||
      t.includes("anuncio") ||
      t.includes("flyer") ||
      t.includes("criar arte") ||
      t.includes("foto")
    );
  }, []);

  const isImageIntentDraft = useMemo(() => {
    return isImageIntent(draft);
  }, [draft, isImageIntent]);

  const sendToApi = async (text: string) => {
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);
    try {
      const prefix = identityOn
        ? "Use o Brand Voice da empresa (tom premium, claro e direto). Entregue um resultado pronto para colar.\n\n"
        : "";
      const command = `${prefix}${text}`;
      const snapshot = [...messages, userMsg].map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));
      const res = await fetch("/api/ai/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, model: toBackendModel(model), brandVoice: identityOn, messages: snapshot }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        type?: "text" | "image"
        data?: { message?: string; imageUrl?: string }
        message?: string
        error?: string
        tool?: { type?: string; url?: string }
      };
      if (!res.ok) {
        const info = interpretAiApiError({
          status: res.status,
          message: String(data.error || data.message || "").trim(),
        });
        toast({
          title: info.title,
          description: info.description,
          variant: "destructive",
          duration: 8000,
          action:
            info.kind === "credits" ? (
              <ToastAction
                altText="Comprar créditos"
                onClick={() =>
                  toast({
                    title: "Comprar créditos",
                    description: "Compra de créditos em breve",
                  })
                }
              >
                Comprar créditos
              </ToastAction>
            ) : undefined,
        });
        return;
      }
      const isImage = data.type === "image" || data.tool?.type === "image";
      const imageUrl = String(data?.data?.imageUrl || data?.tool?.url || "").trim();
      const reply: ChatMsg = {
        id: crypto.randomUUID(),
        role: "ai",
        content: isImage
          ? "Imagem gerada com sucesso."
          : String(data?.data?.message || data.message || "").trim() || "Ok.",
        type: isImage ? "image" : "text",
        imageUrl: isImage ? imageUrl : undefined,
        ...(isImage && imageUrl ? { image: { url: imageUrl, tool: "Gerado com DALL·E 3" } } : {}),
      };
      setMessages((prev) => [...prev, reply]);
      if (!isImage && shouldAutoPopulateDocument(reply.content)) {
        setDocTitle(inferDocumentTitle(reply.content));
        setDocContent(reply.content);
      }
      if (isImage) {
        const cost = getCreditCost("image");
        const next =
          typeof credits === "number" && Number.isFinite(credits)
            ? Math.max(0, credits - cost)
            : null;
        toast({
          title: "Imagem gerada com sucesso",
          description: `${cost} créditos foram consumidos${next !== null ? ` • Saldo atual: ${next.toLocaleString("pt-BR")}` : ""}.`,
        });
        notifyCreditBalanceUpdated();
      }
    } catch (e) {
      toast({
        title: "Falha ao enviar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setTyping(false);
    }
  };

  const handleSend = async (text: string) => {
    if (isImageIntent(text)) {
      setPendingImageRequest(text);
      setDraft("");
      return;
    }
    await sendToApi(text);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-primary opacity-[0.12] blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl" style={{ background: "var(--color-primary-glow)" }} />
      </div>

      <Sidebar onTemplatesClick={() => setTemplatesOpen(true)} />

      <section className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <ModelSelect value={model} onChange={setModel} />
            <IdentitySwitch checked={identityOn} onCheckedChange={setIdentityOn} />
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> Nova conversa
            </button>
            <ThemeSwitcher />
          </div>
        </header>

        <div className="flex flex-none items-center gap-2 border-b border-border/40 bg-surface/30 px-5 py-2 text-[11px] text-muted-foreground backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Conversa #2487 · Contexto da loja {identityOn ? "ATIVO" : "desligado"}</span>
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium"
            style={{
              border: "0.5px solid",
              borderColor:
                model !== "openai/gpt-5.5-pro"
                  ? "color-mix(in oklab, var(--color-primary) 45%, transparent)"
                  : identityOn
                    ? "color-mix(in oklab, var(--color-primary) 55%, transparent)"
                    : "color-mix(in oklab, var(--color-primary) 55%, transparent)",
              color:
                model !== "openai/gpt-5.5-pro"
                  ? "var(--color-primary)"
                  : identityOn
                    ? "color-mix(in oklab, var(--color-primary) 85%, var(--color-foreground))"
                    : "color-mix(in oklab, var(--color-primary) 85%, var(--color-foreground))",
              background: "color-mix(in oklab, var(--color-background) 60%, transparent)",
            }}
            title={model}
          >
            {model !== "openai/gpt-5.5-pro" ? (
              <>
                <Bot className="h-3.5 w-3.5" />
                <span>{model.split("/")[1] || model}</span>
              </>
            ) : identityOn ? (
              <>
                <span aria-hidden>⚡</span>
                <span>auto-mestre</span>
              </>
            ) : (
              <>
                <User className="h-3.5 w-3.5" />
                <span>manual</span>
              </>
            )}
          </span>
        </div>

        <main className="scroll-elegant flex-1 overflow-y-auto overflow-x-hidden px-8 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <ChatMessage key={m.id} msg={m} index={i} />
              ))}
              {typing && <TypingIndicator key="typing" />}
            </AnimatePresence>
          </div>
        </main>

        <footer className="flex-none border-t border-border bg-background/70 px-8 py-4 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-6xl">
            {pendingImageRequest ? (
              <div className="mb-3 rounded-xl border border-border bg-background/60 p-3">
                {(() => {
                  const extracted = extractLogoText(pendingImageRequest)
                  if (!extracted) return null
                  return (
                    <div className="mb-3 rounded-xl border border-border bg-muted/20 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Texto que será usado no logo
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{extracted}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Confira se o nome está exatamente correto antes de confirmar.
                      </div>
                    </div>
                  )
                })()}
                <div className="text-sm font-semibold text-foreground">Confirmação de geração de imagem</div>
                <div className="mt-1 text-xs text-muted-foreground">Você quer gerar uma imagem com o seguinte pedido:</div>
                <div className="mt-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
                  {pendingImageRequest}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Essa ação vai consumir {getCreditCost("image")} créditos
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="h-9 rounded-lg"
                    disabled={typing}
                    onClick={() => {
                      const v = pendingImageRequest;
                      setPendingImageRequest(null);
                      void sendToApi(v);
                    }}
                  >
                    Confirmar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg"
                    disabled={typing}
                    onClick={() => setPendingImageRequest(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : isImageIntentDraft ? (
              <div className="mb-2 text-xs text-muted-foreground">
                Essa ação vai consumir {getCreditCost("image")} créditos
              </div>
            ) : null}
            <ChatInput onSend={handleSend} disabled={typing || !!pendingImageRequest} value={draft} onValueChange={setDraft} />
            <p className="mt-2 text-center text-[12px] text-muted-foreground/80">
              IA Mestre pode cometer erros. Sempre confirme dados financeiros importantes.
            </p>
          </div>
        </footer>
      </section>

      <div className="hidden lg:block">
        <RightPanel
          title={docTitle}
          content={docContent}
          onClear={() => {
            setDocTitle("");
            setDocContent("");
          }}
        />
      </div>

      <MagicTemplatesSheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelectTemplate={(prompt) => {
          setDraft(prompt);
          setTemplatesOpen(false);
        }}
      />
    </div>
  );
}

function MagicTemplatesSheet({
  open,
  onOpenChange,
  onSelectTemplate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (prompt: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-card text-foreground sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </span>
            <div>
              <SheetTitle className="font-display text-xl">
                Biblioteca de Inteligência (Templates Mágicos)
              </SheetTitle>
              <SheetDescription>
                Escolha um prompt pronto para preencher o chat e editar os campos entre colchetes antes de enviar.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="vendas" className="min-h-0 flex-1 px-6 pb-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-muted/60 p-1 sm:grid-cols-3">
            {MAGIC_TEMPLATE_CATEGORIES.map((category) => (
              <TabsTrigger key={category.id} value={category.id} className="h-10 rounded-xl text-xs sm:text-sm">
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {MAGIC_TEMPLATE_CATEGORIES.map((category) => (
            <TabsContent
              key={category.id}
              value={category.id}
              className="scroll-elegant mt-4 min-h-0 overflow-y-auto pr-1"
            >
              <div className="grid gap-3">
                {category.templates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.title}
                      type="button"
                      onClick={() => onSelectTemplate(template.prompt)}
                      className="group flex w-full gap-4 rounded-xl border border-border bg-background/60 p-4 text-left shadow-sm transition hover:border-primary/35 hover:bg-accent hover:text-accent-foreground hover:shadow-elegant"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-muted text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground group-hover:text-accent-foreground">
                          {template.title}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground group-hover:text-accent-foreground/80">
                          {template.prompt}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

