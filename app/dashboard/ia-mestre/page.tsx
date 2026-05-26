"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Bot,
  FolderKanban,
  MessageCircle,
  PackageSearch,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { RightPanel } from "@/components/ia-mestre/RightPanel";
import {
  DEFAULT_IA_MESTRE_MODEL,
  ModelSelect,
  type ModelId,
} from "@/components/ia-mestre/ModelSelect";
import {
  IA_MESTRE_IMAGE_CREDITS_NOTE,
  IA_MESTRE_IMAGE_SUCCESS_NOTE,
} from "@/components/ia-mestre/ia-mestre-honesty";
import { useIaMestreChat } from "@/components/ia-mestre/IaMestreChatContext";
import { iaMestreStoreHeaders } from "@/lib/ia-mestre/client-fetch";
import { IA_MESTRE_UI_MODEL_IDS } from "@/components/ia-mestre/ModelSelect";
import { IdentitySwitch } from "@/components/ia-mestre/IdentitySwitch";
import { ChatMessage, type ChatMsg } from "@/components/ia-mestre/ChatMessage";
import { ChatInput } from "@/components/ia-mestre/ChatInput";
import { TypingIndicator } from "@/components/ia-mestre/TypingIndicator";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { interpretAiApiError } from "@/lib/handleAiApiError";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY_STATE_SUGGESTIONS = [
  "Monte um relatório de vendas da semana com passos práticos",
  "Crie uma mensagem de WhatsApp para reativar clientes inativos",
  "Sugira promoção para produtos com estoque parado na loja",
  "Escreva um roteiro curto de atendimento para assistência técnica",
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
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  );
}

function toBackendModel(m: ModelId): string {
  return m;
}

function isUiModelId(value: string): value is ModelId {
  return (IA_MESTRE_UI_MODEL_IDS as readonly string[]).includes(value);
}

function Shell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const {
    lojaAtivaId,
    storeRequiredError,
    activeConversationId,
    setActiveConversationId,
    notifyConversationsRefresh,
  } = useIaMestreChat();
  const [model, setModel] = useState<ModelId>(DEFAULT_IA_MESTRE_MODEL);
  const [identityOn, setIdentityOn] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadConversationError, setLoadConversationError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingImageRequest, setPendingImageRequest] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [projectBanner, setProjectBanner] = useState<string | null>(null);
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

  useEffect(() => {
    const onOpen = () => setTemplatesOpen(true);
    window.addEventListener("ia-mestre-open-templates", onOpen);
    return () => window.removeEventListener("ia-mestre-open-templates", onOpen);
  }, []);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const headers = iaMestreStoreHeaders(lojaAtivaId);
      if (!headers) {
        setLoadConversationError(storeRequiredError || "Selecione uma unidade ativa.");
        return;
      }
      setLoadingConversation(true);
      setLoadConversationError(null);
      try {
        const res = await fetch(`/api/ia-mestre/conversations/${encodeURIComponent(conversationId)}`, {
          method: "GET",
          headers,
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          conversation?: { model?: string; brandVoiceEnabled?: boolean }
          messages?: ChatMsg[]
        };
        if (!res.ok) {
          throw new Error(String(data.error || `HTTP ${res.status}`));
        }
        const storedModel = String(data.conversation?.model || "").trim();
        if (storedModel && isUiModelId(storedModel)) {
          setModel(storedModel);
        }
        if (typeof data.conversation?.brandVoiceEnabled === "boolean") {
          setIdentityOn(data.conversation.brandVoiceEnabled);
        }
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setActiveConversationId(conversationId);
        setProjectBanner(null);
        setDocTitle("");
        setDocContent("");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao carregar conversa";
        setLoadConversationError(msg);
        setMessages([]);
        toast({ title: "Não foi possível abrir a conversa", description: msg, variant: "destructive" });
      } finally {
        setLoadingConversation(false);
      }
    },
    [lojaAtivaId, setActiveConversationId, storeRequiredError, toast],
  );

  useEffect(() => {
    const openTemplates = searchParams.get("templates") === "1";
    const projeto = searchParams.get("projeto");
    const conversationParam = searchParams.get("c");
    if (openTemplates) setTemplatesOpen(true);
    if (projeto) {
      try {
        setProjectBanner(decodeURIComponent(projeto));
        toast({
          title: "Rótulo de projeto (local)",
          description: `Referência visual: ${decodeURIComponent(projeto)}. Mensagens não são carregadas do projeto — só rascunho no navegador.`,
        });
      } catch {
        setProjectBanner(projeto);
      }
    }
    if (conversationParam?.trim()) {
      void loadConversation(conversationParam.trim());
    }
    if (openTemplates || projeto || conversationParam) {
      router.replace("/dashboard/ia-mestre", { scroll: false });
    }
  }, [searchParams, router, toast, loadConversation]);

  useEffect(() => {
    const onOpenConversation = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id?.trim()) void loadConversation(id.trim());
    };
    window.addEventListener("ia-mestre-open-conversation", onOpenConversation);
    return () => window.removeEventListener("ia-mestre-open-conversation", onOpenConversation);
  }, [loadConversation]);

  const sendToApi = async (text: string) => {
    const headers = iaMestreStoreHeaders(lojaAtivaId);
    if (!headers) {
      toast({
        title: "Unidade não selecionada",
        description: storeRequiredError || "Selecione uma loja ativa no painel antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const userMsg: ChatMsg = { id: clientMessageId, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setTyping(true);
    try {
      const prefix = identityOn
        ? "Use o Brand Voice da empresa (tom premium, claro e direto). Entregue um resultado pronto para colar.\n\n"
        : "";
      const command = `${prefix}${text}`;
      const res = await fetch("/api/ai/orchestrate", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          command,
          userMessage: text,
          model: toBackendModel(model),
          brandVoice: identityOn,
          conversationId: activeConversationId,
          clientMessageId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        type?: "text" | "image"
        data?: { message?: string; imageUrl?: string }
        message?: string
        error?: string
        tool?: { type?: string; url?: string }
        persistence?: {
          conversationId?: string
          userMessageId?: string
          assistantMessageId?: string
          clientMessageId?: string
        }
      };
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
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
      const persistence = data.persistence;
      const userId = persistence?.userMessageId || clientMessageId;
      const assistantId = persistence?.assistantMessageId || crypto.randomUUID();
      if (persistence?.conversationId) {
        setActiveConversationId(persistence.conversationId);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === clientMessageId ? { ...m, id: userId } : m)),
      );

      const isImage = data.type === "image" || data.tool?.type === "image";
      const imageUrl = String(data?.data?.imageUrl || data?.tool?.url || "").trim();
      const reply: ChatMsg = {
        id: assistantId,
        role: "ai",
        content: isImage
          ? "Imagem gerada com sucesso."
          : String(data?.data?.message || data.message || "").trim() || "Ok.",
        type: isImage ? "image" : "text",
        imageUrl: isImage ? imageUrl : undefined,
        ...(isImage && imageUrl ? { image: { url: imageUrl, tool: "API de imagem (servidor)" } } : {}),
      };
      setMessages((prev) => [...prev, reply]);
      if (!isImage && shouldAutoPopulateDocument(reply.content)) {
        setDocTitle(inferDocumentTitle(reply.content));
        setDocContent(reply.content);
      }
      if (isImage) {
        toast({
          title: "Imagem gerada",
          description: IA_MESTRE_IMAGE_SUCCESS_NOTE,
        });
      }
      notifyConversationsRefresh();
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
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

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setDraft("");
    setPendingImageRequest(null);
    setProjectBanner(null);
    setDocTitle("");
    setDocContent("");
    setLoadConversationError(null);
  };

  const showEmptyState = messages.length === 0 && !typing && !loadingConversation;

  return (
    <>
      <div className="flex min-w-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <ModelSelect value={model} onChange={setModel} />
            <IdentitySwitch checked={identityOn} onCheckedChange={setIdentityOn} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
              onClick={startNewConversation}
            >
              <Plus className="h-3.5 w-3.5" /> Nova conversa
            </button>
          </div>
        </header>

        {projectBanner ? (
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-2 text-[12px] backdrop-blur-md">
            <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium text-foreground">
              Rótulo local: {projectBanner}
              <span className="ml-1 font-normal text-muted-foreground">(sem thread persistida)</span>
            </span>
            <button
              type="button"
              className="ml-auto rounded-lg border border-border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
              onClick={() => setProjectBanner(null)}
            >
              Fechar
            </button>
          </div>
        ) : null}

        <div className="flex flex-none items-center gap-2 border-b border-border/40 bg-surface/30 px-5 py-2 text-[11px] text-muted-foreground backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>
            {activeConversationId
              ? `Conversa salva · tom da loja ${identityOn ? "ligado" : "desligado"}`
              : `Nova conversa · tom da loja ${identityOn ? "ligado" : "desligado"}`}
            {storeRequiredError ? ` · ${storeRequiredError}` : ""}
          </span>
          <span
            className="ml-auto inline-flex max-w-[45%] items-center gap-1 truncate rounded-full border border-border bg-background/60 px-2 py-[3px] text-[11px] font-medium text-muted-foreground"
            title={model}
          >
            {model === DEFAULT_IA_MESTRE_MODEL ? (
              <>
                <span aria-hidden>⚡</span>
                <span className="truncate">modelo auto</span>
              </>
            ) : (
              <>
                <Bot className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{model.split("/").slice(1).join("/") || model}</span>
              </>
            )}
          </span>
        </div>

        <main className="scroll-elegant flex-1 overflow-y-auto overflow-x-hidden px-8 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {showEmptyState ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-6 py-14 text-center">
                <MessageCircle className="mb-4 h-10 w-10 text-muted-foreground" />
                <h2 className="font-display text-lg font-semibold text-foreground">Nenhuma conversa ainda</h2>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  Envie uma mensagem abaixo ou escolha uma sugestão. As conversas são salvas por unidade
                  (loja ativa) no servidor.
                </p>
                <div className="mt-6 flex w-full max-w-lg flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sugestões para começar
                  </p>
                  {EMPTY_STATE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDraft(s)}
                      className="rounded-xl border border-border bg-background/60 px-4 py-3 text-left text-[13px] text-foreground transition hover:border-primary/40 hover:bg-muted/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {loadingConversation ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <p className="text-[13px] font-medium">Carregando conversa…</p>
              </div>
            ) : null}
            {loadConversationError && !loadingConversation ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
                {loadConversationError}
              </div>
            ) : null}
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
                <div className="mt-2 text-xs text-muted-foreground">{IA_MESTRE_IMAGE_CREDITS_NOTE}</div>
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
              <div className="mb-2 text-xs text-muted-foreground">{IA_MESTRE_IMAGE_CREDITS_NOTE}</div>
            ) : null}
            <ChatInput
              onSend={handleSend}
              disabled={typing || !!pendingImageRequest || loadingConversation || !!storeRequiredError}
              value={draft}
              onValueChange={setDraft}
            />
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
      </div>

      <MagicTemplatesSheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelectTemplate={(prompt) => {
          setDraft(prompt);
          setTemplatesOpen(false);
        }}
      />
    </>
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

