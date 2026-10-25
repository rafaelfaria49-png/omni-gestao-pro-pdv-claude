import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Sparkles, Link2, Barcode, ImagePlus, Type, Check, Loader2,
  Wand2, Layers, Tag as TagIcon, Store,
  AlertCircle, Image as ImageIcon,
  Send, Plus, ChevronDown, PackagePlus, MessageSquareText, Mic, Square,
} from "lucide-react";
import { Badge, Card, Field, Input, Modal, SectionTitle, Select, Textarea } from "./ui-kit";
import { MovimentacaoEstoqueModal } from "./MovimentacaoEstoqueModal";
import {
  listCategorias,
  listCategoriasMarcasUsadasEmProduto,
  listMarcas,
  listProdutosPaginado,
  lookupProdutoPorBarcodeLocal,
  resolverCodigoBarras,
  upsertCategoria,
  upsertMarca,
  upsertProduto,
  type ResolverCodigoBarrasResult,
} from "@/app/actions/cadastros";
import { interpretarProdutoTextoLivre } from "@/app/actions/produto-texto-livre";
import type {
  CaptureSourceTextoLivre,
  NomeCampoTextoLivre,
  OrigemCampoTextoLivre,
  SugestaoTextoLivre,
} from "@/lib/cadastros/natural-text";
import { calcularAplicacaoTextoLivre } from "@/lib/cadastros/natural-text";
import {
  detectVoiceCaptureCapability,
  montarTextoCaptura,
  reduceVoiceCapture,
  startBrowserVoiceCapture,
  VOICE_CAPTURE_INITIAL,
  type VoiceBrowserSession,
  type VoiceCaptureEvent,
  type VoiceCaptureSnapshot,
} from "@/lib/cadastros/voice-capture";
// CATALOGO-APARELHOS-UI-CADASTROSV2-002 — reaproveita a seção do Catálogo de Aparelhos
// (mesma UI/guardrails do /dashboard/estoque) e o contrato de metadata já publicado.
import {
  ProdutoCompatibilidadeAparelhos,
  emptyCompatibilidade,
  type CompatibilidadeValue,
} from "@/components/dashboard/estoque/produto-compatibilidade-aparelhos";
import { ProdutoAcessoriosConfig } from "@/components/dashboard/estoque/produto-acessorios-config";
import {
  produtoAcessoriosFormFromMetadata,
  produtoAcessoriosMetadataFromForm,
  type ProdutoAcessoriosFormValue,
} from "@/lib/acessorios/form";
import {
  sanitizeCatalogoAparelhos,
  type CatalogoAparelhosMetadata,
} from "@/lib/catalogo-aparelhos/produto-metadata";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { normalizeProdutoTags } from "@/lib/cadastros/produto-upsert-metadata";
import {
  calcularCamposAplicaveis,
  construirProvenienciaBarcode,
} from "@/lib/cadastros/provider-governance";
import { validarGtin, type GtinFormato } from "@/lib/cadastros/gtin";
import { getProdutoFiscal } from "@/lib/produto-fiscal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStoreBusiness } from "@/lib/use-store-business";
import { hasInvalidProductCommercial, productCommercialFromMetadata, productSpecificApplicability, productStockMovementAvailability, type ProductCommercialV1 } from "@/lib/cadastros/product-commercial-contract";
import { manualProductNumberText, parseManualProductNumber } from "@/lib/cadastros/manual-product-input";
import { usesClientExperience } from "@/lib/navigation/client-experience";
import { NovaCategoriaDialog, type NovaCategoriaResult } from "./NovaCategoriaDialog";

/** União case-insensitive: a primeira lista tem precedência para o nome canônico. */
function mergeCatalogNames(preferred: string[], fallback: string[]): string[] {
  const seen = new Map<string, string>();
  for (const n of [...preferred, ...fallback]) {
    const key = n.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, n.trim());
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function productCategoryNames(cats: Awaited<ReturnType<typeof listCategorias>>): string[] {
  return cats.filter((c) => c.active && (c.type === "produto" || c.type === "geral")).map((c) => c.name);
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type BarcodeFeedback =
  | { tone: "error"; message: string }
  | { tone: "found"; message: string }
  | { tone: "not-found"; message: string };

type ExternalBarcodeLookup = {
  gtin: string;
  formato: GtinFormato;
  consultadoEm: string;
  // INTERNO nunca chega aqui (runExternalBarcodeLookup retorna antes) — o tipo
  // exclui esse caso para que só status da cadeia alimentem a proveniência.
  result: Exclude<Extract<ResolverCodigoBarrasResult, { ok: true }>, { status: "INTERNO" }>;
};

type BarcodeSuggestionApplication = {
  aplicadoEm: string;
  camposAplicados: string[];
};

function nomeProvedor(provedor: "cosmos" | "upcitemdb" | "openfoodfacts"): string {
  return provedor === "cosmos" ? "Cosmos" : provedor === "upcitemdb" ? "UPCitemdb" : "Open Food Facts";
}

/** União fechada vinda do servidor — nunca exibir texto livre do provedor. */
const TIPOS_ERRO_SEGUROS = new Set(["timeout", "rede", "auth", "parse", "config"]);

function resumoTentativas(tentativas: Array<{ provedor: string; status: string; tipo?: string }>): string {
  if (tentativas.length === 0) return "Sem tentativas externas registradas.";
  return tentativas
    .map((tentativa) => {
      const nome = nomeProvedor(tentativa.provedor as "cosmos" | "upcitemdb" | "openfoodfacts");
      const rotulo =
        tentativa.status === "erro" && tentativa.tipo && TIPOS_ERRO_SEGUROS.has(tentativa.tipo)
          ? `erro(${tentativa.tipo})`
          : tentativa.status;
      return `${nome}: ${rotulo}`;
    })
    .join(" · ");
}

/* ── Texto livre (CAD-R2-016): preview estruturado da sugestão temporária ── */

const TEXTO_LIVRE_CAMPOS: ReadonlyArray<{ campo: NomeCampoTextoLivre; rotulo: string }> = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "marca", rotulo: "Marca" },
  { campo: "categoria", rotulo: "Categoria" },
  { campo: "descricao", rotulo: "Descrição" },
  { campo: "preco", rotulo: "Preço venda (R$)" },
  { campo: "custo", rotulo: "Custo (R$)" },
  { campo: "estoque", rotulo: "Estoque inicial" },
  { campo: "fornecedor", rotulo: "Fornecedor" },
  { campo: "sku", rotulo: "SKU" },
  { campo: "ean", rotulo: "EAN" },
  { campo: "garantia", rotulo: "Garantia (dias)" },
  { campo: "ncm", rotulo: "NCM" },
  { campo: "cest", rotulo: "CEST" },
];

function rotuloEstadoTextoLivre(estado: OrigemCampoTextoLivre): string {
  if (estado === "extraido") return "extraído do texto";
  if (estado === "inferido") return "inferido pela IA";
  if (estado === "ambiguo") return "confirmar";
  return "ausente";
}

function toneEstadoTextoLivre(estado: OrigemCampoTextoLivre): "success" | "info" | "warning" | "default" {
  if (estado === "extraido") return "success";
  if (estado === "inferido") return "info";
  if (estado === "ambiguo") return "warning";
  return "default";
}

function formatarValorTextoLivre(campo: NomeCampoTextoLivre, valor: string | number): string {
  if (typeof valor === "number") {
    if (campo === "preco" || campo === "custo") {
      return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(valor);
  }
  return valor;
}

function nomeBackendTextoLivre(sugestao: SugestaoTextoLivre): string {
  const backend = sugestao.proveniencia.backend;
  if (backend === "openrouter") return "OpenRouter";
  if (backend === "openai") return "OpenAI";
  if (backend === "gemini") return "Gemini";
  return "extração local";
}

function rotuloCapturaTextoLivre(origem: CaptureSourceTextoLivre): string {
  return origem === "voice" ? "voz → texto livre" : "texto livre";
}

function rotuloEstadoVoz(voz: VoiceCaptureSnapshot): string {
  if (voz.status === "listening") return "Ouvindo";
  if (voz.status === "transcribing") return "Transcrevendo";
  if (voz.status === "completed") return "Concluído";
  if (voz.status === "permission-denied") return "Permissão negada";
  if (voz.status === "unavailable") return "Indisponível neste navegador";
  if (voz.status === "error") return "Erro";
  if (voz.status === "cancelled") return "Cancelado";
  return "Pronto";
}

/* ── Combobox com autocomplete + "criar novo" (Categoria/Marca) ── */
/**
 * Compatível com o legado: trabalha em cima de string (nome).
 * Não força vínculo por id — apenas grava o nome canônico em Produto.category/brand.
 *
 * Com `explicitCreate` (experiência do cliente) o campo só busca e seleciona: Enter e
 * saída do campo nunca gravam nem aceitam texto fora da lista; criar exige a janela
 * explícita aberta por `explicitCreate.onRequest`.
 */
function CategoriaMarcaCombobox({
  value,
  onChange,
  options,
  onCreate,
  placeholder,
  loading,
  inputId,
  inputLabel,
  explicitCreate,
}: {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  onCreate: (name: string) => Promise<string | null>;
  placeholder: string;
  loading?: boolean;
  inputId?: string;
  inputLabel?: string;
  explicitCreate?: {
    label: string;
    onRequest: (draft: string) => void;
    onUnmatched: (draft: string) => void;
    describedBy?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const normalized = draft.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return options.slice(0, 50);
    return options
      .filter((o) => o.toLowerCase().includes(normalized))
      .slice(0, 50);
  }, [options, normalized]);

  const hasExact = useMemo(
    () => options.some((o) => o.trim().toLowerCase() === normalized),
    [options, normalized]
  );

  const commit = (next: string) => {
    const trimmed = next.trim();
    onChange(trimmed);
    setDraft(trimmed);
    setOpen(false);
  };

  // Seleção estrita: devolve o nome canônico da lista (sem diferenciar caixa/espaços nas pontas).
  const matchOption = (candidate: string) => {
    const key = candidate.trim().toLowerCase();
    return options.find((o) => o.trim().toLowerCase() === key);
  };

  const handleCreate = async () => {
    const candidate = draft.trim();
    if (!candidate || creating) return;
    setCreating(true);
    try {
      const canonical = await onCreate(candidate);
      if (!wrapRef.current?.isConnected) return;
      if (canonical) commit(canonical);
      else commit(candidate);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          aria-label={inputLabel}
          data-omni-ui-kit="control"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (explicitCreate) {
              const trimmed = draft.trim();
              if (trimmed === value.trim()) {
                setDraft(value);
                return;
              }
              const match = trimmed ? matchOption(trimmed) : "";
              if (match !== undefined) {
                if (match !== value) onChange(match);
                setDraft(match);
              } else {
                // Texto fora da lista não vira categoria: volta ao valor selecionado.
                setDraft(value);
                explicitCreate.onUnmatched(trimmed);
              }
              return;
            }
            // Commit do nome digitado (texto livre permitido p/ manter compat com strings legadas)
            onChange(draft.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter" && explicitCreate) {
              e.preventDefault();
              const match = matchOption(draft);
              if (match !== undefined) commit(match);
              else if (filtered.length === 1) commit(filtered[0]);
              return;
            }
            if (e.key === "Enter") {
              if (!hasExact && draft.trim()) {
                e.preventDefault();
                void handleCreate();
              } else {
                e.preventDefault();
                commit(draft);
              }
            }
            if (e.key === "ArrowDown" && !open) setOpen(true);
          }}
          placeholder={placeholder}
          aria-describedby={explicitCreate?.describedBy}
          className="w-full h-10 px-3 pr-9 rounded-lg border border-input bg-background text-foreground outline-none text-sm transition-colors focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Abrir lista"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>
          ) : (
            <>
              {filtered.length === 0 && !draft.trim() ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum cadastro ainda.</div>
              ) : null}
              {explicitCreate && filtered.length === 0 && draft.trim() ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma categoria encontrada.</div>
              ) : null}
              {filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown para vencer o onBlur do input
                    e.preventDefault();
                    commit(o);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                    o.trim().toLowerCase() === normalized ? "bg-accent/60 text-accent-foreground" : "text-foreground"
                  }`}
                >
                  <span className="truncate">{o}</span>
                  {o.trim().toLowerCase() === normalized && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              ))}
              {explicitCreate && draft.trim() && !hasExact && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Só abre a janela de confirmação; nada é gravado aqui.
                    e.preventDefault();
                    const candidate = draft.trim();
                    setDraft(value);
                    setOpen(false);
                    explicitCreate.onRequest(candidate);
                  }}
                  className="flex w-full items-center gap-2 border-t border-border bg-primary/5 px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="truncate">{explicitCreate.label} &quot;{draft.trim()}&quot;…</span>
                </button>
              )}
              {!explicitCreate && draft.trim() && !hasExact && (
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleCreate();
                  }}
                  className="flex w-full items-center gap-2 border-t border-border bg-primary/5 px-3 py-2 text-left text-sm text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">Criar &quot;{draft.trim()}&quot;</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Source = "manual" | "link" | "barcode" | "image" | "texto";

const STEPS = [
  "Analisando produto…",
  "Buscando imagens…",
  "Detectando categoria…",
  "Gerando ficha técnica…",
  "Sugerindo preço…",
  "Calculando margem…",
  "Preparando anúncio…",
];

/** Model key (`samsung_galaxy_a05`) → rótulo legível (`Samsung Galaxy A05`) para o chip reidratado. */
function humanizeModelKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

type ProductAIModalProps = {
  allowAI?: boolean;
  allowMarketplace?: boolean;
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSaved?: () => void;
  initial?: Partial<{
    nome: string; sku: string; barras: string; categoria: string; marca: string;
    fornecedor: string; estoque: number; custo: number; preco: number; garantia: number;
    ncm?: string; cest?: string; metadata?: Record<string, unknown> | null;
  }>;
  productId?: string;
};

// Uma montagem por abertura/loja/produto. Respostas antigas não alcançam a ficha seguinte.
export function ProductAIModal(props: ProductAIModalProps) {
  if (!props.open) return null;
  return <ProductAIModalSession key={`${props.storeId}:${props.productId ?? "new"}`} {...props} />;
}

function ProductAIModalSession(props: ProductAIModalProps) {
  const [generation, setGeneration] = useState(0);
  const [lastSaved, setLastSaved] = useState("");
  return <ProductAIEditor key={generation} {...props}
    productId={generation ? undefined : props.productId}
    initial={generation ? undefined : props.initial}
    lastSaved={lastSaved}
    onCreateAnother={(name) => { setLastSaved(name); setGeneration((value) => value + 1); }} />;
}

function ProductAIEditor({
  allowAI = false,
  allowMarketplace = false,
  open,
  onClose,
  storeId,
  onSaved,
  initial,
  productId,
  onCreateAnother,
  lastSaved,
}: ProductAIModalProps & { onCreateAnother: (name: string) => void; lastSaved: string }) {
  const business = useStoreBusiness();
  const storeReady = business.ready && business.storeId === storeId;
  const bakery = storeReady && business.branch === "padaria";
  const invalidCommercial = hasInvalidProductCommercial(initial?.metadata);
  const allowCompatibility = storeReady && business.resource("catalog.deviceCompatibility").operational;
  const allowAccessories = storeReady && business.resource("pdv.accessoryModelColor").operational;
  const allowWeight = storeReady && !invalidCommercial && business.resource("catalog.weight").enabled;
  const allowVariants = storeReady && !invalidCommercial && business.resource("catalog.variants").enabled;
  const [applies, setApplies] = useState(() => productSpecificApplicability(initial?.metadata));
  const [applicabilityTouched, setApplicabilityTouched] = useState({ compatibilidade: false, acessorios: false });
  const [commercial, setCommercial] = useState<ProductCommercialV1>(() => productCommercialFromMetadata(initial?.metadata));
  const [commercialTouched, setCommercialTouched] = useState(false);
  const priceBasisLabel = invalidCommercial ? "R$ — base a revisar" : `R$ / ${commercial.basePreco}`;
  // Apresentação: plataforma e lojas legadas mantêm o combobox histórico; o cliente cria só pela janela explícita.
  const explicitCategoryCreation = usesClientExperience(business.permissions) !== false;
  const [novaCategoriaOpen, setNovaCategoriaOpen] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [categoriaPendente, setCategoriaPendente] = useState("");
  const categoriaPendenteRef = useRef("");
  // Ao fechar a janela o foco volta ao botão (também quando aberta pelo item da lista,
  // para não reabrir a lista do campo por cima da ficha).
  const novaCategoriaButtonRef = useRef<HTMLButtonElement | null>(null);
  const [categoriaStatus, setCategoriaStatus] = useState<string | null>(null);
  const [categoriaLoadError, setCategoriaLoadError] = useState(false);
  // Leitura da projeção comercial canônica; o writer de estoque mantém o próprio guard.
  const stockMovement = productStockMovementAvailability(initial?.metadata);
  const [estoqueAtual, setEstoqueAtual] = useState(initial?.estoque ?? 0);
  const [estoqueStatus, setEstoqueStatus] = useState<string | null>(null);
  const showCompatibility = allowCompatibility && applies.compatibilidade;
  const showAccessories = allowAccessories && applies.acessorios;
  const [source, setSource] = useState<Source>("manual");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [filled, setFilled] = useState(false);
  const [saving, startSaving] = useTransition();
  const saveLockRef = useRef(false);
  const mountedRef = useRef(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState<string | null>(null);
  const [lookingUpBarcode, startBarcodeLookup] = useTransition();
  const [lookingUpExternalBarcode, startExternalBarcodeLookup] = useTransition();
  const [interpretandoTexto, startInterpretacaoTexto] = useTransition();

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const skuRef = useRef<HTMLInputElement | null>(null);
  const barrasRef = useRef<HTMLInputElement | null>(null);
  const fornecedorRef = useRef<HTMLInputElement | null>(null);
  const estoqueRef = useRef<HTMLInputElement | null>(null);
  const custoRef = useRef<HTMLInputElement | null>(null);
  const precoRef = useRef<HTMLInputElement | null>(null);
  const garantiaRef = useRef<HTMLInputElement | null>(null);
  const barcodeScannerRef = useRef<HTMLInputElement | null>(null);
  const barcodeLookupRequestRef = useRef(0);

  // Categoria/Marca: cadastros controlados (dicionário) + texto livre p/ compat.
  const [categoria, setCategoria] = useState<string>(initial?.categoria ?? "");
  const [marca, setMarca] = useState<string>(initial?.marca ?? "");
  const [categoriaOpts, setCategoriaOpts] = useState<string[]>([]);
  const [marcaOpts, setMarcaOpts] = useState<string[]>([]);
  const [optsLoading, setOptsLoading] = useState(false);

  const [ncmDisplay, setNcmDisplay] = useState(initial?.ncm ?? "");
  const [cestDisplay, setCestDisplay] = useState(initial?.cest ?? "");
  const [modeloCompativel, setModeloCompativel] = useState("");
  const [tags, setTags] = useState("");
  const [descricao, setDescricao] = useState("");
  const [barcodeScan, setBarcodeScan] = useState("");
  const [barcodeFeedback, setBarcodeFeedback] = useState<BarcodeFeedback | null>(null);
  const [barcodeLocalNotFound, setBarcodeLocalNotFound] = useState<{ gtin: string; formato: GtinFormato } | null>(null);
  const [externalBarcodeLookup, setExternalBarcodeLookup] = useState<ExternalBarcodeLookup | null>(null);
  const [barcodeSuggestionApplication, setBarcodeSuggestionApplication] = useState<BarcodeSuggestionApplication | null>(null);
  const [cosmosFiscalApplied, setCosmosFiscalApplied] = useState<{ ncm?: string; cest?: string } | null>(null);

  // CAD-R2-016 — texto livre: descrição do operador → sugestão temporária revisável.
  // A sugestão NUNCA grava banco; "aplicar" só preenche o formulário local.
  const [textoLivre, setTextoLivre] = useState("");
  const [textoSugestao, setTextoSugestao] = useState<SugestaoTextoLivre | null>(null);
  const [textoExcluidos, setTextoExcluidos] = useState<string[]>([]);
  const [textoErro, setTextoErro] = useState<string | null>(null);
  const [textoCaptureSource, setTextoCaptureSource] = useState<CaptureSourceTextoLivre>("text");
  const [voz, setVoz] = useState<VoiceCaptureSnapshot>(VOICE_CAPTURE_INITIAL);
  const vozSessionRef = useRef<VoiceBrowserSession | null>(null);
  const textoLivreAntesVozRef = useRef("");

  // Modal de movimentação de estoque (Parte 13) — só em edição.
  const [movimentacaoAberta, setMovimentacaoAberta] = useState(false);

  // Validação fiscal na digitação: vazio é válido; senão exige a quantidade exata
  // de dígitos. Mesma regra do importador (lib/cadastros/importacao-produtos/linha.ts).
  const ncmDigitos = ncmDisplay.replace(/\D/g, "");
  const cestDigitos = cestDisplay.replace(/\D/g, "");
  const ncmInvalido = ncmDigitos.length > 0 && ncmDigitos.length !== 8;
  const cestInvalido = cestDigitos.length > 0 && cestDigitos.length !== 7;

  // CATALOGO-APARELHOS-UI-CADASTROSV2-002 — estado da seção "Compatibilidade com aparelhos".
  const [catalogoValue, setCatalogoValue] = useState<CompatibilidadeValue>(() => emptyCompatibilidade());
  const [catalogoTouched, setCatalogoTouched] = useState(false);
  const [accessoriesTouched, setAccessoriesTouched] = useState(false);
  const [acessoriosValue, setAcessoriosValue] = useState<ProdutoAcessoriosFormValue>(() =>
    produtoAcessoriosFormFromMetadata(initial?.metadata),
  );

  const requestClose = () => { if (!saveLockRef.current || uncertain) onClose(); };

  useEffect(() => {
    mountedRef.current = true;
    const previousFocus = document.activeElement;
    nomeRef.current?.focus();
    const dialog = nomeRef.current?.closest('[role="dialog"]');
    const onKey = (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex="0"]')]
        .filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0);
      const target = key.shiftKey ? controls.at(-1) : controls[0];
      if ((key.shiftKey && document.activeElement === controls[0]) || (!key.shiftKey && document.activeElement === controls.at(-1))) {
        key.preventDefault(); target?.focus();
      }
    };
    dialog?.addEventListener("keydown", onKey);
    return () => {
      mountedRef.current = false;
      barcodeLookupRequestRef.current += 1;
      dialog?.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  // Reseta quando troca de produto em edição (modal reabrindo com outro id).
  useEffect(() => {
    setCategoria(initial?.categoria ?? "");
    setMarca(initial?.marca ?? "");
    setNcmDisplay(initial?.ncm ?? "");
    setCestDisplay(initial?.cest ?? "");
    const metadata = metadataRecord(initial?.metadata);
    setApplies(productSpecificApplicability(metadata));
    setApplicabilityTouched({ compatibilidade: false, acessorios: false });
    setCommercial(productCommercialFromMetadata(metadata));
    setCommercialTouched(false);
    setAcessoriosValue(produtoAcessoriosFormFromMetadata(metadata));
    const atributos = metadataRecord(metadata?.atributos);
    setModeloCompativel(typeof atributos?.modeloCompativel === "string" ? atributos.modeloCompativel : "");
    // NCM/CEST: leitura pelo helper canônico (`metadata.fiscal` primeiro, legado
    // `metadata.ncm`/`metadata.cest` como fallback). Só cai no `initial` quando o
    // caller já mandou o valor pronto.
    const fiscalCanonico = getProdutoFiscal({ metadata });
    setNcmDisplay(fiscalCanonico.ncm || initial?.ncm || "");
    setCestDisplay(fiscalCanonico.cest || initial?.cest || "");
    // `metadata.fiscalRegime` legado é PRESERVADO no banco (o merge de dois níveis
    // não apaga chave omitida), mas deixou de ser editável aqui: regime tributário é
    // da loja, não do produto.
    setTags(Array.isArray(atributos?.tags) ? atributos.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "");
    setDescricao(typeof atributos?.descricao === "string" ? atributos.descricao : "");
    setBarcodeScan("");
    setBarcodeFeedback(null);
    setBarcodeLocalNotFound(null);
    setExternalBarcodeLookup(null);
    setBarcodeSuggestionApplication(null);
    setCosmosFiscalApplied(null);
    setTextoLivre("");
    setTextoSugestao(null);
    setTextoExcluidos([]);
    setTextoErro(null);
    setTextoCaptureSource("text");
    setVoz((prev) =>
      prev.status === "unavailable" ? prev : { ...VOICE_CAPTURE_INITIAL },
    );
    vozSessionRef.current = null;
    barcodeLookupRequestRef.current += 1;
  }, [productId, initial?.categoria, initial?.marca, initial?.ncm, initial?.cest, initial?.metadata]);

  useEffect(() => {
    if (open && source === "barcode") barcodeScannerRef.current?.focus();
  }, [open, source]);

  // CAD-R2-017 — feature detection honesta. Nunca inicia captura no mount.
  useEffect(() => {
    const cap = detectVoiceCaptureCapability(typeof window === "undefined" ? null : window);
    setVoz((prev) => reduceVoiceCapture(prev, { type: "capability", available: cap.available }));
  }, []);

  useEffect(() => {
    if (open && source === "texto") return;
    if (vozSessionRef.current) {
      vozSessionRef.current.cancel();
      vozSessionRef.current = null;
    }
  }, [open, source]);

  useEffect(() => {
    return () => {
      vozSessionRef.current?.dispose();
      vozSessionRef.current = null;
    };
  }, []);

  // CATALOGO-APARELHOS-UI-CADASTROSV2-002 — reidrata a compatibilidade ao abrir/editar.
  // Lê o endpoint read-only já publicado (GET /api/catalogo/aparelhos/produto/[id]). Sempre
  // parte de vazio; se o fetch falhar, mantém vazio e NÃO envia nada no save (a chave é
  // omitida), então o metadata salvo é preservado — nunca apaga por rede instável.
  useEffect(() => {
    if (!open || !showCompatibility) return;
    setCatalogoValue(emptyCompatibilidade());
    if (!productId) return; // criação: nada a reidratar
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/produto/${encodeURIComponent(productId)}`, {
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: storeId },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          catalogoAparelhos?: CatalogoAparelhosMetadata | null;
        } | null;
        if (cancelled) return;
        const c = data?.catalogoAparelhos;
        if (c && Array.isArray(c.deviceModelKeys) && c.deviceModelKeys.length > 0) {
          setCatalogoValue({
            models: c.deviceModelKeys.map((k) => ({ modelKey: k, canonicalName: humanizeModelKey(k), brand: "" })),
            aliases: Array.isArray(c.deviceAliases) ? c.deviceAliases : [],
            status: c.compatibilityStatus,
            types: Array.isArray(c.compatibilityTypes) ? c.compatibilityTypes : [],
            notes: typeof c.notes === "string" ? c.notes : "",
          });
        }
      } catch {
        /* rede falhou: mantém vazio (o save omite a chave e preserva o metadata) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId, storeId, showCompatibility]);

  // Carrega dicionário (CategoriaCadastro/MarcaCadastro) + valores legados em uso ao abrir.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOptsLoading(true);
    Promise.all([
      listCategorias(storeId),
      listMarcas(storeId),
      listCategoriasMarcasUsadasEmProduto(storeId),
    ])
      .then(([cats, brs, usadas]) => {
        if (cancelled) return;
        // União case-insensitive: dicionário tem precedência sobre legado para o nome canônico.
        const brandDic = brs.filter((b) => b.active).map((b) => b.name);
        setCategoriaOpts(mergeCatalogNames(productCategoryNames(cats), usadas.categorias));
        setMarcaOpts(mergeCatalogNames(brandDic, usadas.marcas));
        setCategoriaLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCategoriaOpts([]);
        setMarcaOpts([]);
        setCategoriaLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setOptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, storeId]);

  const createCategoria = async (name: string): Promise<string | null> => {
    try {
      const res = await upsertCategoria(storeId, { name, type: "produto", active: true });
      if (!mountedRef.current) return null;
      setCategoriaOpts((prev) => (prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b, "pt-BR"))));
      return res.name;
    } catch (e) {
      if (mountedRef.current) toast.error("Não foi possível criar categoria.");
      return null;
    }
  };

  /**
   * Criação explícita (experiência do cliente) pelo writer canônico `upsertCategoria`,
   * que normaliza, deduplica sem diferenciar caixa e escopa pela loja. Só seleciona o
   * nome devolvido depois da confirmação; em seguida relê a lista da loja.
   */
  const submitNovaCategoria = async (name: string): Promise<NovaCategoriaResult> => {
    let canonical: string;
    try {
      const res = await upsertCategoria(storeId, { name, type: "produto", active: true });
      if (!res || typeof res.name !== "string" || !res.name.trim()) throw new Error("Resposta sem categoria");
      canonical = res.name.trim();
    } catch {
      if (mountedRef.current) void reloadCategoriaOpts();
      return { ok: false, message: "Não foi possível confirmar a criação da categoria. Nenhuma categoria foi selecionada; confira a lista e tente novamente." };
    }
    if (!mountedRef.current) return { ok: true, name: canonical };
    setCategoriaOpts((prev) => mergeCatalogNames([canonical], prev));
    setCategoria(canonical);
    categoriaPendenteRef.current = "";
    setCategoriaPendente("");
    setCategoriaStatus(`Categoria "${canonical}" salva nesta loja e selecionada.`);
    void reloadCategoriaOpts(canonical);
    return { ok: true, name: canonical };
  };

  const reloadCategoriaOpts = async (ensure?: string) => {
    try {
      const [cats, usadas] = await Promise.all([listCategorias(storeId), listCategoriasMarcasUsadasEmProduto(storeId)]);
      if (!mountedRef.current) return;
      setCategoriaOpts(mergeCatalogNames([...(ensure ? [ensure] : []), ...productCategoryNames(cats)], usadas.categorias));
      setCategoriaLoadError(false);
    } catch {
      // Lista anterior permanece; a categoria confirmada já foi incluída acima.
    }
  };

  const openNovaCategoria = (draft: string) => {
    const known = categoriaOpts.some((o) => o.trim().toLowerCase() === draft.trim().toLowerCase());
    setNovaCategoriaNome(known ? "" : draft.trim());
    setNovaCategoriaOpen(true);
  };

  const createMarca = async (name: string): Promise<string | null> => {
    try {
      const res = await upsertMarca(storeId, { name, type: "", active: true });
      if (!mountedRef.current) return null;
      setMarcaOpts((prev) => (prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b, "pt-BR"))));
      return res.name;
    } catch (e) {
      if (mountedRef.current) toast.error("Não foi possível criar marca.");
      return null;
    }
  };

  const runAI = () => {
    setRunning(true);
    setStep(0);
    setFilled(false);
    let i = 0;
    const t = setInterval(() => {
      i++;
      if (i >= STEPS.length) {
        clearInterval(t);
        setRunning(false);
        setFilled(true);
      } else setStep(i);
    }, 450);
  };

  const runBarcodeLocalLookup = () => {
    const requestId = ++barcodeLookupRequestRef.current;
    const scannedBarcode = barcodeScan;
    const validation = validarGtin(barcodeScan);
    if (!validation.valid) {
      setBarcodeLocalNotFound(null);
      setExternalBarcodeLookup(null);
      setBarcodeSuggestionApplication(null);
      setCosmosFiscalApplied(null);
      setBarcodeFeedback({ tone: "error", message: validation.message });
      return;
    }

    // UPC-A fica canonicamente representado como EAN-13 no formulário; a busca também cobre
    // cadastros legados que ainda guardam os 12 dígitos originais.
    if (barrasRef.current) barrasRef.current.value = validation.gtin;
    startBarcodeLookup(async () => {
      try {
        const result = await lookupProdutoPorBarcodeLocal(storeId, scannedBarcode);
        if (requestId !== barcodeLookupRequestRef.current) return;
        if (!result.ok) {
          setBarcodeLocalNotFound(null);
          setExternalBarcodeLookup(null);
          setBarcodeSuggestionApplication(null);
          setCosmosFiscalApplied(null);
          setBarcodeFeedback({ tone: "error", message: result.message });
          return;
        }
        if (result.status === "FOUND") {
          setBarcodeLocalNotFound(null);
          setExternalBarcodeLookup(null);
          setBarcodeSuggestionApplication(null);
          setCosmosFiscalApplied(null);
          const sku = result.produto.sku ? ` · SKU ${result.produto.sku}` : "";
          setBarcodeFeedback({
            tone: "found",
            message: `Produto já cadastrado nesta loja: ${result.produto.nome}${sku} · estoque ${result.produto.estoque}. O salvamento bloqueará duplicidade.`,
          });
          return;
        }
        setExternalBarcodeLookup(null);
        setBarcodeSuggestionApplication(null);
        setCosmosFiscalApplied(null);
        setBarcodeLocalNotFound(result.interno ? null : { gtin: result.gtin, formato: result.formato });
        setBarcodeFeedback({
          tone: "not-found",
          message: result.interno
            ? "Código interno consultado somente nesta loja e não encontrado. Nenhuma busca externa será feita."
            : "Código válido, mas não encontrado nesta loja. Você pode preencher manualmente ou buscar sugestões externas.",
        });
      } catch {
        if (requestId !== barcodeLookupRequestRef.current) return;
        setBarcodeLocalNotFound(null);
        setExternalBarcodeLookup(null);
        setBarcodeSuggestionApplication(null);
        setCosmosFiscalApplied(null);
        setBarcodeFeedback({ tone: "error", message: "Não foi possível consultar o cadastro local. Tente novamente." });
      }
    });
  };

  const runExternalBarcodeLookup = () => {
    if (!barcodeLocalNotFound) return;
    const requestId = ++barcodeLookupRequestRef.current;
    const localNotFound = barcodeLocalNotFound;
    startExternalBarcodeLookup(async () => {
      try {
        const result = await resolverCodigoBarras(storeId, localNotFound.gtin);
        if (requestId !== barcodeLookupRequestRef.current) return;
        if (!result.ok) {
          setBarcodeFeedback({ tone: "error", message: result.message });
          return;
        }
        if (result.status === "INTERNO") {
          setBarcodeFeedback({ tone: "not-found", message: result.mensagem });
          return;
        }
        setBarcodeSuggestionApplication(null);
        setCosmosFiscalApplied(null);
        setExternalBarcodeLookup({
          gtin: localNotFound.gtin,
          formato: localNotFound.formato,
          consultadoEm: new Date().toISOString(),
          result,
        });
      } catch {
        if (requestId !== barcodeLookupRequestRef.current) return;
        setExternalBarcodeLookup({
          gtin: localNotFound.gtin,
          formato: localNotFound.formato,
          consultadoEm: new Date().toISOString(),
          result: { ok: true, status: "erro", tentativas: [] },
        });
      }
    });
  };

  const applyExternalBarcodeSuggestions = () => {
    if (!externalBarcodeLookup || externalBarcodeLookup.result.status !== "encontrado") return;

    const { dados, provedor } = externalBarcodeLookup.result;
    // CAD-R2-015: campos aplicáveis vêm da governança canônica (allow-list por
    // provider + nunca sobrescrever o operador + nunca preco/custo/estoque/
    // fornecedor/sku). Nada aqui salva Produto — só preenche o formulário para
    // revisão; a persistência continua sendo upsertProduto ("Salvar produto").
    const aplicaveis = calcularCamposAplicaveis(provedor, dados, {
      nome: nomeRef.current?.value.trim() ?? "",
      marca,
      categoria,
      descricao,
      ncm: ncmDisplay,
      cest: cestDisplay,
    });
    const camposAplicados: string[] = [];
    const fiscalAplicado: { ncm?: string; cest?: string } = {};
    for (const item of aplicaveis) {
      if (item.campo === "nome") {
        if (!nomeRef.current) continue;
        nomeRef.current.value = item.valor;
      } else if (item.campo === "marca") {
        setMarca(item.valor);
      } else if (item.campo === "categoria") {
        setCategoria(item.valor);
      } else if (item.campo === "descricao") {
        setDescricao(item.valor);
      } else if (item.campo === "ncm") {
        setNcmDisplay(item.valor);
        fiscalAplicado.ncm = item.valor;
      } else if (item.campo === "cest") {
        setCestDisplay(item.valor);
        fiscalAplicado.cest = item.valor;
      }
      camposAplicados.push(item.campo);
    }

    const camposAplicadosAntes = barcodeSuggestionApplication?.camposAplicados ?? [];
    const camposAplicadosTotais = Array.from(new Set([...camposAplicadosAntes, ...camposAplicados]));
    const aplicadoEm = barcodeSuggestionApplication?.aplicadoEm ?? new Date().toISOString();
    if (Object.keys(fiscalAplicado).length > 0) {
      setCosmosFiscalApplied((anterior) => ({ ...(anterior ?? {}), ...fiscalAplicado }));
    }
    setBarcodeSuggestionApplication({ aplicadoEm, camposAplicados: camposAplicadosTotais });
    if (camposAplicados.length > 0) {
      toast.success(`Sugestões aplicadas em ${camposAplicados.length} campo(s). Revise e salve manualmente.`);
    } else {
      toast.message("Os campos sugeridos já estão preenchidos e foram preservados. Nenhum produto foi salvo.");
    }
  };

  // CAD-R2-016 — interpreta a descrição em linguagem natural (server-side) e
  // exibe a sugestão temporária para revisão. Não grava banco.
  const runInterpretacaoTextoLivre = () => {
    const texto = textoLivre.trim();
    if (!texto || interpretandoTexto) return;
    setTextoErro(null);
    startInterpretacaoTexto(async () => {
      try {
        const result = await interpretarProdutoTextoLivre(storeId, texto, {
          captureSource: textoCaptureSource,
        });
        if (!result.ok) {
          setTextoErro(result.message);
          return;
        }
        setTextoSugestao(result.sugestao);
        setTextoExcluidos([]);
      } catch {
        setTextoErro("Não foi possível interpretar o texto agora. Tente novamente.");
      }
    });
  };

  const emitirEventoVoz = (event: VoiceCaptureEvent) => {
    setVoz((prev) => {
      const next = reduceVoiceCapture(prev, event);
      if (next.status === "completed" && next.sessionTranscript.trim()) {
        const mesclado = montarTextoCaptura(textoLivreAntesVozRef.current, next.sessionTranscript);
        queueMicrotask(() => {
          setTextoLivre(mesclado);
          setTextoCaptureSource("voice");
        });
      }
      if (next.status === "cancelled" || next.status === "permission-denied") {
        queueMicrotask(() => setTextoLivre(textoLivreAntesVozRef.current));
      }
      if (next.status === "error" && !next.sessionTranscript.trim()) {
        queueMicrotask(() => setTextoLivre(textoLivreAntesVozRef.current));
      }
      return next;
    });
  };

  const iniciarVoz = () => {
    if (interpretandoTexto) return;
    if (voz.status === "unavailable") return;
    if (voz.status === "listening" || voz.status === "transcribing") return;
    textoLivreAntesVozRef.current = textoLivre;
    emitirEventoVoz({ type: "start" });
    const session = startBrowserVoiceCapture({ emit: emitirEventoVoz, lang: "pt-BR" });
    if (!session.ok) {
      vozSessionRef.current = null;
      if (session.reason === "unavailable") {
        emitirEventoVoz({ type: "capability", available: false });
      } else {
        emitirEventoVoz({ type: "error", code: "start-failed" });
      }
      setTextoLivre(textoLivreAntesVozRef.current);
      return;
    }
    vozSessionRef.current = session;
  };

  const pararVoz = () => {
    vozSessionRef.current?.stop();
    vozSessionRef.current = null;
  };

  const cancelarVoz = () => {
    vozSessionRef.current?.cancel();
    vozSessionRef.current = null;
    setTextoLivre(textoLivreAntesVozRef.current);
  };

  const alternarExclusaoTextoLivre = (campo: string) => {
    setTextoExcluidos((prev) => (prev.includes(campo) ? prev.filter((c) => c !== campo) : [...prev, campo]));
  };

  // CAD-R2-016 — "aplicar" = preencher/mesclar o formulário local. NÃO salva.
  // Preenche só campos vazios (nunca sobrescreve o operador); em edição o
  // estoque é ignorado (saldo somente leitura). Salvar continua via
  // upsertProduto → ProductWriteService → StockLedger ("Salvar produto").
  const applySugestaoTextoLivre = () => {
    if (!textoSugestao) return;
    const { aplicacoes, ignorados } = calcularAplicacaoTextoLivre(
      textoSugestao,
      {
        nome: nomeRef.current?.value ?? "",
        marca,
        categoria,
        descricao,
        preco: precoRef.current?.value ?? "",
        custo: custoRef.current?.value ?? "",
        estoque: estoqueRef.current?.value ?? "",
        fornecedor: fornecedorRef.current?.value ?? "",
        sku: skuRef.current?.value ?? "",
        ean: barrasRef.current?.value ?? "",
        garantia: garantiaRef.current?.value ?? "",
        ncm: ncmDisplay,
        cest: cestDisplay,
      },
      { modoEdicao: Boolean(productId), excluir: textoExcluidos },
    );
    for (const item of aplicacoes) {
      if (item.campo === "nome" && nomeRef.current) nomeRef.current.value = item.valor;
      else if (item.campo === "sku" && skuRef.current) skuRef.current.value = item.valor;
      else if (item.campo === "ean" && barrasRef.current) barrasRef.current.value = item.valor;
      else if (item.campo === "fornecedor" && fornecedorRef.current) fornecedorRef.current.value = item.valor;
      else if (item.campo === "estoque" && estoqueRef.current) estoqueRef.current.value = item.valor;
      else if (item.campo === "custo" && custoRef.current) custoRef.current.value = item.valor;
      else if (item.campo === "preco" && precoRef.current) precoRef.current.value = item.valor;
      else if (item.campo === "garantia" && garantiaRef.current) garantiaRef.current.value = item.valor;
      else if (item.campo === "marca") setMarca(item.valor);
      else if (item.campo === "categoria") setCategoria(item.valor);
      else if (item.campo === "descricao") setDescricao(item.valor);
      else if (item.campo === "ncm") setNcmDisplay(item.valor);
      else if (item.campo === "cest") setCestDisplay(item.valor);
    }
    const ambiguosAplicados = aplicacoes.filter(
      (a) => textoSugestao.campos[a.campo].estado === "ambiguo",
    ).length;
    if (aplicacoes.length > 0) {
      toast.success(
        `Sugestão aplicada em ${aplicacoes.length} campo(s). Revise e salve manualmente.` +
          (ambiguosAplicados > 0 ? ` ${ambiguosAplicados} campo(s) precisam de confirmação.` : ""),
      );
    } else {
      const motivo = ignorados.some((i) => i.motivo === "ja-preenchido")
        ? "Os campos já estão preenchidos e foram preservados."
        : "Nada a aplicar — revise os avisos.";
      toast.message(`${motivo} Nenhum produto foi salvo.`);
    }
  };

  const saveProduct = (another: boolean) => {
    if (saveLockRef.current || !storeReady || uncertain) return;
    saveLockRef.current = true;
    setSaveError(null);
    let dispatched = false;
    let unconfirmed = false;
    const report = (message: string, input?: HTMLInputElement | null) => {
      setSaveError(message); toast.error(message);
      const details = input?.closest("details");
      if (details) details.open = true;
      input?.focus();
    };
    startSaving(async () => {
      try {
        const name = (nomeRef.current?.value ?? "").trim();
        if (!name) { report("Informe o nome do produto.", nomeRef.current); return; }
        const changed = (value: string, previous: string | undefined) => value.trim() !== (previous ?? "").trim();
        const textPatch: Record<string, string> = {};
        const texts = [
          ["nome", name, initial?.nome], ["sku", skuRef.current?.value ?? "", initial?.sku],
          ["barras", barrasRef.current?.value ?? "", initial?.barras], ["categoria", categoria, initial?.categoria],
          ["marca", marca, initial?.marca], ["fornecedor", fornecedorRef.current?.value ?? "", initial?.fornecedor],
        ] as const;
        for (const [key, value, previous] of texts) if (changed(value, previous)) textPatch[key] = value.trim();
        const numbers = [
          { key: "preco", label: "Preço", ref: precoRef, previous: manualProductNumberText(initial?.preco), kind: "money" },
          { key: "custo", label: "Custo", ref: custoRef, previous: manualProductNumberText(initial?.custo), kind: "money" },
          { key: "garantia", label: "Garantia", ref: garantiaRef, previous: initial?.garantia === undefined ? "" : String(initial.garantia), kind: "integer" },
          ...(!productId ? [{ key: "estoque", label: "Estoque inicial", ref: estoqueRef, previous: "", kind: "integer" as const }] : []),
        ] as const;
        const numericPatch: Record<string, number> = {};
        for (const field of numbers) {
          const raw = field.ref.current?.value ?? "";
          if (productId && !changed(raw, field.previous)) continue;
          const parsed = parseManualProductNumber(raw, field.kind);
          if (parsed.state === "invalid") {
            report(field.kind === "money" ? field.label + " inválido — use um valor não negativo com até 2 casas decimais (ex.: 1.234,56)." : field.label + " inválido — informe um número inteiro ≥ 0, sem separadores.", field.ref.current);
            return;
          }
          if (parsed.state === "valid") numericPatch[field.key] = parsed.value;
        }
        const originalMetadata = metadataRecord(initial?.metadata);
        const originalAttrs = metadataRecord(originalMetadata?.atributos);
        const attrs: Record<string, unknown> = {};
        if (changed(descricao, typeof originalAttrs?.descricao === "string" ? originalAttrs.descricao : "")) attrs.descricao = descricao.trim();
        const originalTags = Array.isArray(originalAttrs?.tags) ? originalAttrs.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "";
        if (changed(tags, originalTags)) attrs.tags = normalizeProdutoTags(tags);
        if (showCompatibility && changed(modeloCompativel, typeof originalAttrs?.modeloCompativel === "string" ? originalAttrs.modeloCompativel : "")) attrs.modeloCompativel = modeloCompativel.trim();
        const initialFiscal = getProdutoFiscal({ metadata: originalMetadata });
        const fiscalPatch: Record<string, string> = {};
        if (changed(ncmDisplay, initialFiscal.ncm || initial?.ncm)) {
          if (ncmInvalido) { report("NCM inválido — informe 8 dígitos ou deixe vazio."); return; }
          fiscalPatch.ncm = ncmDigitos;
        }
        if (changed(cestDisplay, initialFiscal.cest || initial?.cest)) {
          if (cestInvalido) { report("CEST inválido — informe 7 dígitos ou deixe vazio."); return; }
          fiscalPatch.cest = cestDigitos;
        }
        const catalogoModelKeys = catalogoValue.models.map((m) => m.modelKey);
        const catalogoAparelhos =
          catalogoModelKeys.length > 0
            ? sanitizeCatalogoAparelhos({
                deviceModelKeys: catalogoModelKeys,
                deviceAliases: catalogoValue.aliases,
                compatibilityStatus: catalogoValue.status,
                compatibilityTypes: catalogoValue.types,
                notes: catalogoValue.notes,
                source: "manual",
              })
            : null;
        const barcodeLookupMetadata = externalBarcodeLookup
          ? construirProvenienciaBarcode({
              gtin: externalBarcodeLookup.gtin,
              formato: externalBarcodeLookup.formato,
              consultadoEm: externalBarcodeLookup.consultadoEm,
              status: externalBarcodeLookup.result.status,
              ...(externalBarcodeLookup.result.status === "encontrado"
                ? {
                    provedor: externalBarcodeLookup.result.provedor,
                    sugestoes: externalBarcodeLookup.result.dados,
                  }
                : {}),
              tentativas: externalBarcodeLookup.result.tentativas,
              aplicacao: barcodeSuggestionApplication,
            })
          : null;
        const applicabilityPatch = {
          ...(allowCompatibility && applicabilityTouched.compatibilidade ? { compatibilidade: applies.compatibilidade } : {}),
          ...(allowAccessories && applicabilityTouched.acessorios ? { acessorios: applies.acessorios } : {}),
        };
        const commercialPatch = { ...commercial };
        if (!allowVariants) delete commercialPatch.gradePlanejada;

        dispatched = true;
        const result = await upsertProduto(storeId, {
          ...(productId ? { id: productId } : { active: true }),
          ...textPatch, ...numericPatch,
          nome: name, // O adapter publicado exige nome também nos patches.
          ...(showAccessories && (accessoriesTouched || (applicabilityTouched.acessorios && applies.acessorios)) ? { accessoryConfig: produtoAcessoriosMetadataFromForm(acessoriosValue) } : {}),
          metadata: {
            ...(allowAI ? { cadastroIa: { phase: "fase1-stub", savedAt: new Date().toISOString(), source } } : {}),
            ...(showCompatibility && catalogoTouched && catalogoAparelhos ? { catalogoAparelhos } : {}),
            ...(commercialTouched && (!productId || allowVariants) ? { comercial: commercialPatch } : {}),
            ...(Object.keys(applicabilityPatch).length ? { cadastroRecursos: applicabilityPatch } : {}),
            ...(Object.keys(attrs).length ? { atributos: attrs } : {}),
            ...(Object.keys(fiscalPatch).length ? { fiscal: fiscalPatch } : {}),
            ...(barcodeLookupMetadata ? { barcodeLookup: barcodeLookupMetadata } : {}),
          },
        });
        if (!mountedRef.current) return;
        if (!result.ok) {
          if (result.type === "SAVE_ERROR") {
            unconfirmed = true; setUncertain(true);
            report("Não foi possível confirmar o salvamento. O produto pode ter sido gravado. Verifique o cadastro antes de iniciar outra tentativa.");
          } else report(result.message);
          return;
        }
        toast.success("Produto salvo com sucesso.", { description: name });
        // Atualização da listagem não altera a confirmação já recebida do writer.
        void Promise.resolve().then(() => onSaved?.()).catch(() => {});
        if (another) onCreateAnother(name);
        else onClose();
      } catch {
        if (!mountedRef.current) return;
        unconfirmed = dispatched;
        if (dispatched) {
          setUncertain(true);
          report("Não foi possível confirmar o salvamento. O produto pode ter sido gravado. Verifique o cadastro antes de iniciar outra tentativa.");
        } else report("Não foi possível preparar o cadastro. Revise os campos preenchidos.");
      } finally {
        if (!unconfirmed) saveLockRef.current = false;
      }
    });
  };

  const reconcileSave = async () => {
    if (reconciling) return;
    setReconciling(true);
    try {
      const q = skuRef.current?.value.trim() || barrasRef.current?.value.trim() || nomeRef.current?.value.trim() || initial?.nome || "";
      const result = await listProdutosPaginado(storeId, { q, pageSize: 10 });
      if (!mountedRef.current) return;
      if (result.erroFiltros) throw new Error("READ_FAILED");
      const names = result.produtos.map((product) => product.nome).join("; ");
      setReconciliation(result.total > 0
        ? "Consulta na loja encontrou: " + names + ". Confira o produto na listagem antes de editar ou cadastrar novamente; esta busca não identifica qual tentativa o gravou."
        : "Nenhum produto encontrado nesta consulta. Isso não confirma que a gravação falhou. Confira novamente a listagem antes de iniciar outra tentativa.");
      // Sem chave de idempotência cadastral no backend, a busca não autoriza retry automático.
      onSaved?.();
    } catch {
      if (mountedRef.current) setReconciliation("Não foi possível consultar a loja. Os campos foram preservados; o salvamento continua sem confirmação.");
    } finally { if (mountedRef.current) setReconciling(false); }
  };

  const title = productId ? "Editar produto" : "Novo produto";
  return (
    <Modal accessible open={open} onClose={requestClose} title={title} subtitle={allowAI ? "Cadastro real no banco — revise as sugestões antes de salvar." : "Cadastre os dados do produto para sua loja."} size="xl">
      <div className="space-y-6">
        {lastSaved && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{lastSaved} foi salvo. Preencha o próximo produto.</p>}
        {/* IA SOURCE */}
        {allowAI && <>
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Cadastro Inteligente IA</h3>
              <p className="text-xs text-muted-foreground">Escolha como quer começar — a IA preenche o resto.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              { id: "manual", l: "Digitar nome", i: Type },
              { id: "texto", l: "Descrever produto", i: MessageSquareText },
              { id: "link", l: "Link marketplace", i: Link2 },
              { id: "barcode", l: "Código de barras", i: Barcode },
              { id: "image", l: "Upload imagem", i: ImagePlus },
            ].map((o) => {
              const Ic = o.i;
              const active = source === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => setSource(o.id as Source)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                    active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Ic className="h-4 w-4" /> {o.l}
                </button>
              );
            })}
          </div>
          {source === "texto" ? (
            <div className="mt-3 grid gap-2">
              {(() => {
                const ouvindo = voz.status === "listening" || voz.status === "transcribing";
                const textoExibido = ouvindo
                  ? montarTextoCaptura(textoLivreAntesVozRef.current, voz.sessionTranscript, voz.interim)
                  : textoLivre;
                return (
                  <>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        texto
                      </span>
                      <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        microfone
                      </span>
                      <span className="min-w-0 text-[11px] text-muted-foreground">
                        {rotuloEstadoVoz(voz)}
                        {voz.status === "unavailable"
                          ? " — Chrome ou Edge em HTTPS/localhost."
                          : null}
                      </span>
                    </div>
                    <Textarea
                      value={textoExibido}
                      onChange={(event) => {
                        if (ouvindo) return;
                        setTextoLivre(event.target.value);
                        setTextoErro(null);
                      }}
                      rows={3}
                      maxLength={2000}
                      readOnly={ouvindo}
                      placeholder="Ex.: Biscoito de chocolate, custa 4 reais e vendo por 8"
                      title="Descreva o produto em linguagem natural — a IA sugere o preenchimento para revisão"
                    />
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-[11px] text-muted-foreground">
                        {textoExibido.trim().length}/2000 · preço, custo, estoque e fornecedor só entram se você declarar.
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {ouvindo ? (
                          <>
                            <button
                              type="button"
                              onClick={pararVoz}
                              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground"
                            >
                              <Square className="h-4 w-4" /> Encerrar
                            </button>
                            <button
                              type="button"
                              onClick={cancelarVoz}
                              className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={iniciarVoz}
                            disabled={voz.status === "unavailable" || interpretandoTexto}
                            title={
                              voz.status === "unavailable"
                                ? "Reconhecimento de voz indisponível neste navegador"
                                : "Gravar descrição por voz (pede permissão de microfone)"
                            }
                            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground disabled:opacity-60"
                          >
                            <Mic className="h-4 w-4" /> Microfone
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={runInterpretacaoTextoLivre}
                          disabled={interpretandoTexto || textoExibido.trim().length === 0 || ouvindo}
                          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                        >
                          {interpretandoTexto ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                          Interpretar com IA
                        </button>
                      </div>
                    </div>
                    {voz.status !== "ready" && voz.message ? (
                      <div
                        role="status"
                        className={`rounded-lg border p-3 text-xs ${
                          voz.status === "permission-denied" || voz.status === "error"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : voz.status === "unavailable"
                              ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                              : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {voz.message}
                      </div>
                    ) : null}
                  </>
                );
              })()}
              {textoErro && (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {textoErro}
                </div>
              )}
            </div>
          ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            {source === "manual" && <Input placeholder={business.presentation.productExample} />}
            {source === "link" && <Input placeholder="https://produto.mercadolivre.com.br/…" />}
            {source === "barcode" && (
              <Input
                ref={barcodeScannerRef}
                value={barcodeScan}
                onChange={(event) => {
                  barcodeLookupRequestRef.current += 1;
                  setBarcodeScan(event.target.value);
                  setBarcodeFeedback(null);
                  setBarcodeLocalNotFound(null);
                  setExternalBarcodeLookup(null);
                  setBarcodeSuggestionApplication(null);
                  setCosmosFiscalApplied(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  runBarcodeLocalLookup();
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Bipe ou digite EAN/GTIN e pressione Enter"
                title="Busca somente no cadastro da loja atual"
              />
            )}
            {source === "image" && (
              <div className="rounded-lg border border-dashed border-border bg-background p-3 text-center text-xs text-muted-foreground">
                Solte a imagem do produto aqui
              </div>
            )}
            {source === "barcode" ? (
              <button
                type="button"
                onClick={runBarcodeLocalLookup}
                disabled={lookingUpBarcode || lookingUpExternalBarcode}
                title="Consulta exclusivamente o cadastro local; provedores externos só são consultados após uma ação explícita"
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {lookingUpBarcode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
                Buscar na loja
              </button>
            ) : (
              <button
                disabled
                title="Preenchimento automático por IA — em breve. Preencha os campos manualmente abaixo."
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-40"
              >
                <Wand2 className="h-4 w-4" /> Preencher com IA · Em breve
              </button>
            )}
          </div>
          )}

          {source === "texto" && textoSugestao && (
            <div role="status" className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">Sugestão da descrição — revise antes de aplicar</div>
                <Badge tone={textoSugestao.proveniencia.degradadoLocal ? "warning" : "info"}>
                  {nomeBackendTextoLivre(textoSugestao)}
                </Badge>
              </div>
              <div className="mt-2 grid gap-1.5">
                {TEXTO_LIVRE_CAMPOS.map(({ campo, rotulo }) => {
                  const proposto = textoSugestao.campos[campo];
                  const excluido = textoExcluidos.includes(campo);
                  if (proposto.valor === null || proposto.valor === undefined) return null;
                  return (
                    <label key={campo} className="flex items-center gap-2 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!excluido}
                        onChange={() => alternarExclusaoTextoLivre(campo)}
                        title={excluido ? "Ignorado na aplicação" : "Desmarque para não aplicar"}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className={excluido ? "line-through opacity-60" : ""}>
                        <strong className="text-foreground">{rotulo}:</strong>{" "}
                        {formatarValorTextoLivre(campo, proposto.valor)}
                      </span>
                      <Badge tone={toneEstadoTextoLivre(proposto.estado)}>{rotuloEstadoTextoLivre(proposto.estado)}</Badge>
                    </label>
                  );
                })}
              </div>
              {textoSugestao.avisos.length > 0 && (
                <div className="mt-2 grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-muted-foreground">
                  {textoSugestao.avisos.map((aviso) => (
                    <span key={aviso}>• {aviso}</span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Origem: {rotuloCapturaTextoLivre(textoSugestao.proveniencia.captureSource)} · {nomeBackendTextoLivre(textoSugestao)} ·{" "}
                {new Date(textoSugestao.proveniencia.interpretedAt).toLocaleString("pt-BR")}. O texto
                original e o áudio não são salvos no produto.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Preenche apenas campos vazios{productId ? "; estoque ignorado na edição" : ""}. Nada é salvo agora.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTextoSugestao(null);
                      setTextoExcluidos([]);
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={applySugestaoTextoLivre}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                  >
                    Aplicar ao cadastro
                  </button>
                </div>
              </div>
            </div>
          )}

          {source === "barcode" && barcodeFeedback && (
            <div
              role="status"
              className={`mt-3 rounded-lg border p-3 text-xs ${
                barcodeFeedback.tone === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : barcodeFeedback.tone === "found"
                    ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                    : "border-primary/30 bg-background text-muted-foreground"
              }`}
            >
              {barcodeFeedback.message}
            </div>
          )}

          {source === "barcode" && barcodeLocalNotFound && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-background p-3">
              <div className="text-xs text-muted-foreground">
                A consulta externa não é automática e só ocorre após sua confirmação.
              </div>
              <button
                type="button"
                onClick={runExternalBarcodeLookup}
                disabled={lookingUpExternalBarcode || lookingUpBarcode}
                className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                {lookingUpExternalBarcode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Buscar dados externos
              </button>
            </div>
          )}

          {source === "barcode" && externalBarcodeLookup && (
            <div role="status" className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-foreground">
              {externalBarcodeLookup.result.status === "encontrado" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">Sugestão encontrada em {nomeProvedor(externalBarcodeLookup.result.provedor)}</div>
                    <Badge tone={externalBarcodeLookup.result.provedor === "cosmos" ? "primary" : "warning"}>{nomeProvedor(externalBarcodeLookup.result.provedor)}</Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <span><strong className="text-foreground">Nome:</strong> {externalBarcodeLookup.result.dados.nome}</span>
                    {externalBarcodeLookup.result.dados.marca ? <span><strong className="text-foreground">Marca:</strong> {externalBarcodeLookup.result.dados.marca}</span> : null}
                    {externalBarcodeLookup.result.dados.categoria ? <span><strong className="text-foreground">Categoria:</strong> {externalBarcodeLookup.result.dados.categoria}</span> : null}
                    {externalBarcodeLookup.result.dados.descricao ? <span><strong className="text-foreground">Descrição:</strong> disponível para aplicação</span> : null}
                    {externalBarcodeLookup.result.provedor === "cosmos" && (externalBarcodeLookup.result.dados.ncm || externalBarcodeLookup.result.dados.cest) ? (
                      <span><strong className="text-foreground">Fiscal sugerido:</strong> {[externalBarcodeLookup.result.dados.ncm && `NCM ${externalBarcodeLookup.result.dados.ncm}`, externalBarcodeLookup.result.dados.cest && `CEST ${externalBarcodeLookup.result.dados.cest}`].filter(Boolean).join(" · ")} (revisão do operador)</span>
                    ) : null}
                    {externalBarcodeLookup.result.dados.imagemUrl ? <span>Imagem de referência será mantida no metadata ao salvar; nenhum arquivo será baixado.</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-muted-foreground">Preenche apenas campos vazios. Custo, preço de venda e estoque continuam manuais.</span>
                    <button
                      type="button"
                      onClick={applyExternalBarcodeSuggestions}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                    >
                      Aplicar sugestões
                    </button>
                  </div>
                </>
              ) : externalBarcodeLookup.result.status === "nao_encontrado" ? (
                <p>Nenhum dado encontrado nas bases externas configuradas.</p>
              ) : externalBarcodeLookup.result.status === "limite_excedido" ? (
                <p>Limite diário do provedor atingido. Você ainda pode cadastrar manualmente.</p>
              ) : externalBarcodeLookup.result.status === "erro_config" ? (
                <p>Lookup externo não configurado corretamente. Cadastre manualmente ou revise as variáveis do servidor.</p>
              ) : (
                <p>Não foi possível consultar as bases externas agora. Você ainda pode cadastrar manualmente.</p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">Tentativas: {resumoTentativas(externalBarcodeLookup.result.tentativas)}</p>
              {barcodeSuggestionApplication ? <p className="mt-1 text-[11px] text-muted-foreground">Sugestões revisadas pelo operador; o produto só será gravado ao clicar em “Salvar produto”.</p> : null}
            </div>
          )}

          {(running || filled) && (
            <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3">
              {STEPS.map((s, i) => {
                const done = filled || i < step;
                const active = !filled && i === step;
                return (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    {done ? <Check className="h-3.5 w-3.5 text-[color:var(--success)]" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
                    <span className={done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        </>}
        {/* FORM */}
        <div>
          <SectionTitle title="Ficha do produto" subtitle={allowAI ? (filled ? "Campos preenchidos automaticamente — revise antes de salvar." : "Preenchimento manual ou pelas sugestões acima.") : "Preencha os campos e salve o cadastro."} />
          <fieldset disabled={saving || uncertain} className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field label="Nome" span={2}>
              <Input
                ref={nomeRef} aria-label="Nome" autoComplete="off"
                defaultValue={initial?.nome ?? ""}
                placeholder={business.presentation.productExample}
                className="font-medium"
              />
            </Field>
            <Field label="Categoria" span={2}>
              {explicitCategoryCreation ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <CategoriaMarcaCombobox
                        inputId="produto-categoria"
                        inputLabel="Categoria"
                        value={categoria}
                        onChange={(next) => {
                          setCategoria(next);
                          categoriaPendenteRef.current = "";
                          setCategoriaPendente("");
                          setCategoriaStatus(null);
                        }}
                        options={categoriaOpts}
                        onCreate={async () => null}
                        placeholder={business.presentation.categoryExample}
                        loading={optsLoading}
                        explicitCreate={{
                          label: "Nova categoria",
                          onRequest: openNovaCategoria,
                          onUnmatched: (draft) => { categoriaPendenteRef.current = draft; setCategoriaPendente(draft); setCategoriaStatus(null); },
                          describedBy: "produto-categoria-ajuda",
                        }}
                      />
                    </div>
                    <button
                      ref={novaCategoriaButtonRef}
                      type="button"
                      aria-haspopup="dialog"
                      // Ref: o blur do campo (que registra o texto digitado) roda no mousedown, antes deste clique.
                      onClick={() => openNovaCategoria(categoriaPendenteRef.current)}
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-4 w-4" aria-hidden /> Nova categoria
                    </button>
                  </div>
                  <p id="produto-categoria-ajuda" className="mt-1 text-xs text-muted-foreground">
                    {categoriaPendente
                      ? `"${categoriaPendente}" não está na lista desta loja. Escolha uma categoria existente ou use Nova categoria para criá-la.`
                      : categoriaLoadError
                        ? "Não foi possível carregar as categorias desta loja. Você ainda pode criar uma pela Nova categoria."
                        : "Busque e escolha uma categoria da loja."}
                  </p>
                  {categoriaStatus && <p role="status" className="mt-1 text-xs font-medium text-foreground">{categoriaStatus}</p>}
                </>
              ) : (
                <CategoriaMarcaCombobox
                  inputId="produto-categoria"
                  inputLabel="Categoria"
                  value={categoria}
                  onChange={setCategoria}
                  options={categoriaOpts}
                  onCreate={createCategoria}
                  placeholder={business.presentation.categoryExample}
                  loading={optsLoading}
                />
              )}
            </Field>
            {invalidCommercial && <p role="alert" className="col-span-full text-sm text-destructive">Declaração comercial inválida. Venda bloqueada. Os dados existentes serão preservados; cadastre outro produto para definir unidade e preço sem reinterpretar saldos.</p>}
            {!invalidCommercial && (bakery || allowWeight || allowVariants || commercial.modoVenda === "peso") && <div className="col-span-full space-y-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Unidade e forma de venda</p>
              <label className="block space-y-1 text-sm">Forma de venda
                <select aria-label="Forma de venda" value={commercial.modoVenda} disabled={!!productId || !allowWeight}
                  onChange={(event) => { const weight = event.target.value === "peso"; setCommercial((current) => ({ ...current, modoVenda: weight ? "peso" : "unidade", unidade: weight ? "KG" : "UN", basePreco: weight ? "KG" : "UN" })); setCommercialTouched(true); }}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground">
                  <option value="unidade">Por unidade (UN)</option><option value="peso">Por peso — preparação</option>
                </select>
              </label>
              {commercial.modoVenda === "peso" && <>
                <label className="block text-sm">Unidade comercial e base do preço
                  <select aria-label="Unidade comercial e base do preço" value={commercial.unidade} disabled={!!productId || !allowWeight}
                    onChange={(event) => { const unit = event.target.value as "KG" | "G"; setCommercial((current) => ({ ...current, unidade: unit, basePreco: unit })); setCommercialTouched(true); }} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground">
                    <option value="KG">Quilograma (KG)</option><option value="G">Grama (G)</option>
                  </select>
                </label>
                <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Preparação: preço e custo por {commercial.basePreco}. Venda bloqueada até a integração de quantidade e estoque. Saldos existentes não serão convertidos.</p>
              </>}
              {allowVariants && <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={commercial.gradePlanejada ?? false} onChange={(event) => { setCommercial((current) => ({ ...current, gradePlanejada: event.target.checked })); setCommercialTouched(true); }} />
                Planejar grade para este produto — estoque e venda por variação ainda indisponíveis.
              </label>}
            </div>}
            <div className="col-span-full">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{invalidCommercial ? "Precificação · base comercial a revisar" : `Precificação · valores por ${commercial.basePreco}`}</p>
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label={`Preço venda (${priceBasisLabel})`}><Input ref={precoRef} aria-label={`Preço venda (${priceBasisLabel})`} inputMode="decimal" autoComplete="off" defaultValue={manualProductNumberText(initial?.preco)} placeholder="0,00" /></Field>
                <Field label={`Custo (${priceBasisLabel})`}><Input ref={custoRef} aria-label={`Custo (${priceBasisLabel})`} inputMode="decimal" autoComplete="off" defaultValue={manualProductNumberText(initial?.custo)} placeholder="0,00" /></Field>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Ex.: 12,50 ou 1.234,56. Preço vazio ou zero deixa o cadastro incompleto; revise antes de vender. {productId ? "Em branco mantém o valor salvo; para zerar, informe 0." : "Custo não informado permanece sem cálculo de margem."}</p>
            </div>
            <Field label={bakery ? "Código interno (SKU)" : "SKU"}><Input ref={skuRef} aria-label={bakery ? "Código interno (SKU)" : "SKU"} autoComplete="off" defaultValue={initial?.sku ?? ""} placeholder="Opcional" /><p className="mt-1 text-xs text-muted-foreground">Código interno opcional, quando usado pela loja.</p></Field>
            <Field label="Código de barras"><Input ref={barrasRef} aria-label="Código de barras" autoComplete="off" defaultValue={initial?.barras ?? ""} placeholder="Opcional — digite ou bipe" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /><p className="mt-1 text-xs text-muted-foreground">Pode ficar vazio. Digitar ou bipar não consulta serviços externos.</p></Field>
            {/* Estoque (Parte 13): em EDIÇÃO é somente leitura — saldo só muda por
                movimentação auditada (MovimentacaoEstoque). Na CRIAÇÃO continua
                editável, rotulado como saldo inicial. */}
            {productId ? (
              <Field label="Estoque atual">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[8rem] flex-1">
                    <Input
                      readOnly aria-label="Estoque atual"
                      aria-describedby={`produto-estoque-unidade${stockMovement.disponivel ? "" : " produto-estoque-bloqueio"}`}
                      value={String(estoqueAtual)}
                      className={`cursor-default bg-muted/40 tabular-nums text-foreground ${stockMovement.unidade ? "pr-12" : "pr-32"}`}
                    />
                    <span
                      id="produto-estoque-unidade"
                      data-unidade={stockMovement.unidade ?? "revisar"}
                      className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${stockMovement.unidade ? "text-muted-foreground" : "text-destructive"}`}
                    >
                      {stockMovement.unidade ?? "unidade a revisar"}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!stockMovement.disponivel}
                    aria-describedby={stockMovement.disponivel ? undefined : "produto-estoque-bloqueio"}
                    onClick={() => { setEstoqueStatus(null); setMovimentacaoAberta(true); }}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted/40 disabled:text-muted-foreground disabled:hover:bg-muted/40"
                  >
                    <PackagePlus className="h-3.5 w-3.5" aria-hidden /> Movimentar estoque
                  </button>
                </div>
                {stockMovement.disponivel ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Salvar o produto não altera o saldo. Use Movimentar estoque para entrada ou
                    ajuste; tudo fica registrado no histórico de movimentações.
                  </p>
                ) : (
                  <div
                    id="produto-estoque-bloqueio"
                    data-estoque-bloqueio={stockMovement.motivo}
                    className={`mt-2 flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs text-foreground ${stockMovement.motivo === "declaracao_invalida" ? "border-destructive/40 bg-destructive/10" : "border-warning/50 bg-warning/10"}`}
                  >
                    <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${stockMovement.motivo === "declaracao_invalida" ? "text-destructive" : "text-warning"}`} aria-hidden />
                    <p className="min-w-0">
                      <strong className="font-semibold">{stockMovement.titulo}</strong> {stockMovement.orientacao}
                    </p>
                  </div>
                )}
                {estoqueStatus && <p role="status" className="mt-1 text-xs font-medium text-foreground">{estoqueStatus}</p>}
              </Field>
            ) : (
              <Field label="Estoque inicial">
                <div className="relative">
                  <Input ref={estoqueRef} aria-label="Estoque inicial" aria-describedby="produto-estoque-inicial-unidade" inputMode="numeric" autoComplete="off" defaultValue="0" placeholder="0" className="pr-12" />
                  <span id="produto-estoque-inicial-unidade" data-unidade={commercial.unidade} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{commercial.unidade}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {commercial.modoVenda === "peso" ? "Peso em preparação: mantenha zero. Estoque fracionado indisponível." : "Quantidade inteira, inclusive zero. Depois do cadastro, use a movimentação de estoque."}
                </p>
              </Field>
            )}
            <details open={!bakery} className="col-span-full rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium text-foreground">Informações complementares</summary><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Marca">
              <CategoriaMarcaCombobox
                inputId="produto-marca"
                inputLabel="Marca"
                value={marca}
                onChange={setMarca}
                options={marcaOpts}
                onCreate={createMarca}
                placeholder={business.presentation.brandExample}
                loading={optsLoading}
              />
            </Field>
            <Field label="Fornecedor"><Input ref={fornecedorRef} aria-label="Fornecedor" defaultValue={initial?.fornecedor ?? ""} placeholder="Nome do fornecedor" /></Field>
            <Field label="Garantia (dias)"><Input ref={garantiaRef} aria-label="Garantia (dias)" inputMode="numeric" defaultValue={initial?.garantia !== undefined ? String(initial.garantia) : ""} placeholder="90" /></Field>
            <Field label="Tags" span={2}><Input aria-label="Tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Separadas por vírgula — Ex.: artesanal, presente, promoção" /></Field>
            <Field label="Descrição" span={2}>
              <Textarea aria-label="Descrição" value={descricao} onChange={(event) => setDescricao(event.target.value)} rows={3} placeholder="Descrição comercial (opcional)" />
            </Field>
            </div></details>
            <details open={!bakery} className="col-span-full rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium text-foreground">Dados fiscais do produto</summary><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Identidade fiscal do produto — editável e revisável pelo operador.
                Lê `metadata.fiscal` primeiro (contrato canônico de lib/produto-fiscal.ts),
                com fallback para o legado `metadata.ncm` / `metadata.cest`. A gravação
                passa pelo mesmo write path canônico da Server Action. */}
            <Field label="NCM">
              <Input
                aria-label="NCM"
                value={ncmDisplay}
                onChange={(event) => setNcmDisplay(event.target.value)}
                placeholder="8 dígitos — ex.: 85065010"
                inputMode="numeric"
                className={cn("font-mono", ncmInvalido && "border-destructive")}
                aria-invalid={ncmInvalido || undefined}
                title="NCM do produto — 8 dígitos. Deixe vazio se ainda não souber."
              />
              {ncmInvalido && (
                <p className="mt-1 text-[11px] text-destructive">
                  NCM precisa ter 8 dígitos (ou ficar vazio).
                </p>
              )}
            </Field>
            <Field label="CEST">
              <Input
                aria-label="CEST"
                value={cestDisplay}
                onChange={(event) => setCestDisplay(event.target.value)}
                placeholder="7 dígitos — ex.: 1700600"
                inputMode="numeric"
                className={cn("font-mono", cestInvalido && "border-destructive")}
                aria-invalid={cestInvalido || undefined}
                title="CEST do produto — 7 dígitos. Só se aplica a mercadorias sujeitas a ST."
              />
              {cestInvalido && (
                <p className="mt-1 text-[11px] text-destructive">
                  CEST precisa ter 7 dígitos (ou ficar vazio).
                </p>
              )}
            </Field>
            <Field label="Regime tributário">
              <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/30 px-3">
                <p className="truncate text-xs text-muted-foreground" title="O regime é da loja, não do produto">
                  Configurado na Identidade Fiscal da loja
                </p>
              </div>
            </Field>
            </div></details>
            {showCompatibility && <Field label="Modelo compatível"><Input aria-label="Modelo compatível" value={modeloCompativel} onChange={(event) => setModeloCompativel(event.target.value)} placeholder="Nome ou referência do aparelho" /></Field>}
            {(allowCompatibility || allowAccessories) && <fieldset className="col-span-full space-y-3 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">Recursos aplicáveis a este produto</legend>
              {allowCompatibility && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applies.compatibilidade} onChange={(event) => { setApplies((current) => ({ ...current, compatibilidade: event.target.checked })); setApplicabilityTouched((current) => ({ ...current, compatibilidade: true })); }} />Possui compatibilidade com aparelhos</label>}
              {allowAccessories && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applies.acessorios} onChange={(event) => { setApplies((current) => ({ ...current, acessorios: event.target.checked })); setApplicabilityTouched((current) => ({ ...current, acessorios: true })); }} />É um acessório para aparelhos</label>}
            </fieldset>}
            {/* CATALOGO-APARELHOS-UI-CADASTROSV2-002 — compatibilidade de aparelhos (reuso). */}
            {showCompatibility && <div className="col-span-full">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compatibilidade com aparelhos</p>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="mb-4 text-xs text-muted-foreground">
                  Use para capinhas, películas e acessórios. Não confirma encaixe físico automaticamente.
                </p>
                <ProdutoCompatibilidadeAparelhos
                  value={catalogoValue}
                  onChange={(value) => { setCatalogoValue(value); setCatalogoTouched(true); }}
                  lojaHeader={storeId}
                />
              </div>
            </div>}
            {showAccessories && <div className="col-span-full">
              <ProdutoAcessoriosConfig value={acessoriosValue} onChange={(value) => { setAcessoriosValue(value); setAccessoriesTouched(true); }} />
            </div>}
          </fieldset>
        </div>

        {/* IMAGEM IA */}
        {allowAI && <>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Imagem IA</h3>
            <Badge tone="warning">Em breve</Badge>
          </div>
          <div className="pointer-events-none grid gap-3 opacity-50 md:grid-cols-[1fr_1fr]">
            <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
              <ImagePlus className="mx-auto h-7 w-7 text-muted-foreground" />
              <div className="mt-2 text-sm text-foreground">Soltar fotos do produto</div>
              <div className="text-xs text-muted-foreground">PNG/JPG • até 8 imagens</div>
            </div>
            <div className="space-y-2">
              {[
                "Remover fundo automaticamente",
                "Padronizar imagem (1080×1080)",
                "Gerar thumbnail",
                "Gerar capa marketplace",
                "Sugerir imagens complementares",
              ].map((o) => (
                <label key={o} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 text-sm text-foreground">
                  <input type="checkbox" defaultChecked /> {o}
                </label>
              ))}
            </div>
          </div>
          {filled && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {["Original", "Sem fundo", "Thumb", "Capa MKT"].map((l, i) => (
                <div key={l} className="overflow-hidden rounded-lg border border-border">
                  <div className="aspect-square bg-gradient-to-br from-primary/20 to-muted grid place-items-center text-xs text-muted-foreground">
                    Preview {i + 1}
                  </div>
                  <div className="border-t border-border bg-surface px-2 py-1 text-[10px] uppercase text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        </>}
        {/* RELACIONAMENTOS */}
        {business.resource("service.technical").operational && <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Relacionamentos inteligentes</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sugestões de equipamentos, peças relacionadas e checklists ainda indisponíveis.
          </p>
        </Card>}

        {/* MARKETPLACE — apenas rótulo Fase 1; integrações reais ficam no módulo Marketplace */}
        {allowMarketplace && <Card className="p-5 opacity-80">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Send className="h-4 w-4" />
            <span>Publicação em marketplaces: não disponível nesta fase (cadastro local apenas).</span>
          </div>
        </Card>}

        {saveError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p>}
        {uncertain && <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <button type="button" onClick={() => void reconcileSave()} disabled={reconciling} className="rounded-lg border border-border px-4 py-2 disabled:opacity-60">{reconciling ? "Consultando…" : "Verificar cadastro na loja"}</button>
          {reconciliation && <p role="status">{reconciliation}</p>}
          <p className="text-xs text-muted-foreground">Nenhuma repetição automática foi feita. Feche esta ficha apenas depois de conferir a listagem.</p>
        </div>}
        <div aria-busy={saving} className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" disabled={saving} onClick={requestClose} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-60">Cancelar</button>
          <button type="button" disabled={saving || !storeReady || uncertain} onClick={() => saveProduct(true)} className="flex items-center justify-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-60">Salvar e cadastrar outro</button>
          <button type="button" disabled={saving || !storeReady || uncertain} onClick={() => saveProduct(false)} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Salvar produto
          </button>
        </div>
      </div>

      {/* Movimentação de estoque — reusa o modal já publicado (Parte 13). */}
      {productId && (
        <MovimentacaoEstoqueModal
          open={movimentacaoAberta}
          onClose={() => setMovimentacaoAberta(false)}
          storeId={storeId}
          produto={{
            id: productId,
            nome: initial?.nome ?? "",
            sku: initial?.sku,
            estoque: estoqueAtual,
            custo: initial?.custo,
            metadata: initial?.metadata,
          }}
          onSaved={(result) => {
            setMovimentacaoAberta(false);
            // Saldo devolvido pelo writer canônico na mesma transação; a lista relê do servidor.
            if (result && mountedRef.current) {
              setEstoqueAtual(result.estoqueDepois);
              setEstoqueStatus(`Movimentação registrada. Saldo atual: ${result.estoqueDepois} ${stockMovement.unidade ?? ""}`.trim() + ".");
            }
            onSaved?.();
          }}
        />
      )}
      {explicitCategoryCreation && (
        <NovaCategoriaDialog
          open={novaCategoriaOpen}
          initialName={novaCategoriaNome}
          onOpenChange={setNovaCategoriaOpen}
          onSubmit={submitNovaCategoria}
          returnFocusTo={() => novaCategoriaButtonRef.current}
        />
      )}
    </Modal>
  );
}

/* ── Quality score ring for product cards ── */
export function QualityScore({ value }: { value: number }) {
  const tone = value >= 85 ? "success" : value >= 60 ? "warning" : "danger";
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-7 w-7">
        <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted-foreground)/0.2)" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={value >= 85 ? "var(--success)" : value >= 60 ? "var(--warning)" : "var(--destructive)"}
            strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 94.25} 94.25`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-[9px] font-bold text-foreground">{value}</div>
      </div>
      <Badge tone={tone}>score</Badge>
    </div>
  );
}

/* ── Inteligência de Cadastros block for dashboard ── */
export function InteligenciaCadastros({
  stats,
}: {
  stats?: Partial<{
    produtosProntosMarketplace: number;
    cadastrosGeradosPorIa: number;
    produtosSemImagem: number;
    anunciosPendentes: number;
    duplicadosEncontrados: number;
    camposFiscaisFaltando: number;
  }>;
}) {
  const items = [
    { l: "Produtos prontos para marketplace", v: stats?.produtosProntosMarketplace ?? 0, t: "success" as const, i: Send },
    { l: "Cadastros gerados por IA", v: stats?.cadastrosGeradosPorIa ?? 0, t: "primary" as const, i: Sparkles },
    { l: "Produtos sem imagem", v: stats?.produtosSemImagem ?? 0, t: "warning" as const, i: ImageIcon },
    { l: "Anúncios pendentes", v: stats?.anunciosPendentes ?? 0, t: "info" as const, i: Store },
    { l: "Duplicados encontrados", v: stats?.duplicadosEncontrados ?? 0, t: "danger" as const, i: AlertCircle },
    { l: "Campos fiscais faltando", v: stats?.camposFiscaisFaltando ?? 0, t: "warning" as const, i: TagIcon },
  ];
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <SectionTitle title="Inteligência de Cadastros" subtitle="Status do que a IA já analisou e o que precisa de atenção." />
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => {
          const Ic = it.i;
          return (
            <div key={it.l} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Ic className="h-4 w-4" /></div>
                <Badge tone={it.t}>•</Badge>
              </div>
              <div className="mt-3 text-2xl font-bold text-foreground">{it.v}</div>
              <div className="text-[11px] text-muted-foreground">{it.l}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── IA Importação extras ── */
export function ImportIAActions() {
  const acts = [
    { l: "IA corrige planilha", i: Wand2 },
    { l: "Detectar duplicados", i: Layers },
    { l: "Sugerir categorias", i: TagIcon },
    { l: "Completar campos ausentes", i: Sparkles },
    { l: "Padronizar nomes", i: Type },
    { l: "Validar SKU/código de barras", i: Barcode },
  ];
  return (
    <Card className="p-5 border-primary/30 bg-primary/5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Correção Inteligente</h3>
        <Badge tone="primary">IA</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {acts.map((a) => {
          const Ic = a.i;
          return (
            <button key={a.l} className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-left text-sm text-foreground hover:border-primary">
              <Ic className="h-4 w-4 text-primary" /> {a.l}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
