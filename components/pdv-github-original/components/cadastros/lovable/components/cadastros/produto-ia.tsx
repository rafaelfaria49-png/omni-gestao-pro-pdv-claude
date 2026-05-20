import { useRef, useState, useTransition } from "react";
import {
  Sparkles, Link2, Barcode, ImagePlus, Type, Check, Loader2,
  Store, ShoppingBag, Globe, Wand2, Layers, Tag as TagIcon,
  Wrench, Package, CheckCircle2, AlertCircle, Image as ImageIcon,
  Eye, Zap, Send,
} from "lucide-react";
import { Badge, Card, Field, Input, Modal, SectionTitle, Select, Textarea } from "./ui-kit";
import { upsertProduto } from "@/app/actions/cadastros";

type Source = "manual" | "link" | "barcode" | "image";

const MARKETPLACES = [
  { id: "ml", name: "Mercado Livre", icon: Store, status: "conectado" as const, color: "warning" as const },
  { id: "shopee", name: "Shopee", icon: ShoppingBag, status: "conectado" as const, color: "danger" as const },
  { id: "amazon", name: "Amazon", icon: Package, status: "aguardando" as const, color: "warning" as const },
  { id: "magalu", name: "Magalu", icon: Store, status: "não conectado" as const, color: "default" as const },
  { id: "nuvem", name: "Nuvemshop", icon: Globe, status: "conectado" as const, color: "info" as const },
  { id: "shopify", name: "Shopify", icon: ShoppingBag, status: "não conectado" as const, color: "default" as const },
];

const STEPS = [
  "Analisando produto…",
  "Buscando imagens…",
  "Detectando categoria…",
  "Gerando ficha técnica…",
  "Sugerindo preço…",
  "Calculando margem…",
  "Preparando anúncio…",
];

export function ProductAIModal({
  open,
  onClose,
  storeId,
  onSaved,
  initial,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSaved?: () => void;
  initial?: Partial<{
    nome: string;
    sku: string;
    barras: string;
    categoria: string;
    marca: string;
    fornecedor: string;
    custo: number;
    preco: number;
    garantia: number;
  }>;
  productId?: string;
}) {
  const [source, setSource] = useState<Source>("manual");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [filled, setFilled] = useState(false);
  const [autoPublish, setAutoPublish] = useState(true);
  const [selected, setSelected] = useState<string[]>(["ml", "shopee"]);
  const [saving, startSaving] = useTransition();

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const skuRef = useRef<HTMLInputElement | null>(null);
  const barrasRef = useRef<HTMLInputElement | null>(null);
  const categoriaRef = useRef<HTMLInputElement | null>(null);
  const marcaRef = useRef<HTMLInputElement | null>(null);
  const modeloRef = useRef<HTMLInputElement | null>(null);
  const fornecedorRef = useRef<HTMLInputElement | null>(null);
  const custoRef = useRef<HTMLInputElement | null>(null);
  const precoRef = useRef<HTMLInputElement | null>(null);
  const garantiaRef = useRef<HTMLInputElement | null>(null);

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

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const title = productId ? "Editar produto" : "Novo produto";
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Cadastro Inteligente com IA + Marketplace" size="xl">
      <div className="space-y-6">
        {/* IA SOURCE */}
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Cadastro Inteligente IA</h3>
              <p className="text-xs text-muted-foreground">Escolha como quer começar — a IA preenche o resto.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { id: "manual", l: "Digitar nome", i: Type },
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
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            {source === "manual" && <Input placeholder="Ex.: Tela iPhone 11 Original" />}
            {source === "link" && <Input placeholder="https://produto.mercadolivre.com.br/…" />}
            {source === "barcode" && <Input placeholder="7891234500011" />}
            {source === "image" && (
              <div className="rounded-lg border border-dashed border-border bg-background p-3 text-center text-xs text-muted-foreground">
                Solte a imagem do produto aqui
              </div>
            )}
            <button
              onClick={runAI}
              disabled={running}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {running ? "Processando…" : "Preencher com IA"}
            </button>
          </div>

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

        {/* FORM (preenchido pela IA) */}
        <div>
          <SectionTitle title="Ficha do produto" subtitle={filled ? "Campos preenchidos automaticamente — revise se quiser." : "Preenchimento manual ou via IA acima."} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome" span={2}>
              <Input
                ref={nomeRef}
                defaultValue={initial?.nome ?? (filled ? "Tela iPhone 11 Original c/ Aro" : "")}
                placeholder="Nome do produto"
              />
            </Field>
            <Field label="SKU"><Input ref={skuRef} defaultValue={initial?.sku ?? (filled ? "TEL-IPH11-OR-ARO" : "")} /></Field>
            <Field label="Código de barras"><Input ref={barrasRef} defaultValue={initial?.barras ?? (filled ? "7891234500011" : "")} /></Field>
            <Field label="Categoria"><Input ref={categoriaRef} defaultValue={initial?.categoria ?? (filled ? "Telas" : "")} /></Field>
            <Field label="Marca"><Input ref={marcaRef} defaultValue={initial?.marca ?? (filled ? "Apple" : "")} /></Field>
            <Field label="Modelo compatível"><Input ref={modeloRef} defaultValue={filled ? "iPhone 11" : ""} /></Field>
            <Field label="Fornecedor provável"><Input ref={fornecedorRef} defaultValue={initial?.fornecedor ?? (filled ? "iParts BR" : "")} /></Field>
            <Field label="Custo"><Input ref={custoRef} defaultValue={initial?.custo !== undefined ? String(initial.custo) : (filled ? "320" : "")} /></Field>
            <Field label="Preço sugerido"><Input ref={precoRef} defaultValue={initial?.preco !== undefined ? String(initial.preco) : (filled ? "690" : "")} /></Field>
            <Field label="Margem"><Input defaultValue={filled ? "53,6%" : ""} /></Field>
            <Field label="Garantia (dias)"><Input ref={garantiaRef} defaultValue={initial?.garantia !== undefined ? String(initial.garantia) : (filled ? "90" : "")} /></Field>
            <Field label="NCM"><Input defaultValue={filled ? "8517.70.10" : ""} /></Field>
            <Field label="Tributação"><Select defaultValue={filled ? "Simples" : ""}><option>Simples</option><option>Lucro Presumido</option><option>Lucro Real</option></Select></Field>
            <Field label="Tags"><Input defaultValue={filled ? "tela, iphone, original, 11" : ""} /></Field>
            <Field label="Descrição" span={2}>
              <Textarea rows={3} defaultValue={filled ? "Tela LCD original para iPhone 11, com aro e suporte. Touch responsivo, cor fiel, ideal para reposição em assistência técnica. Garantia de 90 dias contra defeitos de fabricação." : ""} />
            </Field>
          </div>
        </div>

        {/* IMAGEM IA */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Imagem IA</h3>
            <Badge tone="primary">Auto</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
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

        {/* RELACIONAMENTOS */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Relacionamentos inteligentes</h3>
          </div>
          <div className="space-y-3 text-sm">
            <Rel label="Equipamentos" tone="info" items={["iPhone 11", "iPhone 11 Pro"]} icon={Package} />
            <Rel label="Peças relacionadas" tone="primary" items={["Película 3D iPhone 11", "Cola B-7000", "Aro frontal"]} icon={TagIcon} />
            <Rel label="Serviços relacionados" tone="success" items={["Troca de tela", "Limpeza interna"]} icon={Wrench} />
            <Rel label="Checklist recomendado" tone="warning" items={["Testar touch", "Testar Face ID", "Testar carga"]} icon={CheckCircle2} />
            <Rel label="Fornecedores sugeridos" tone="default" items={["iParts BR", "iSupply Imports"]} icon={Store} />
          </div>
        </Card>

        {/* MARKETPLACE */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Publicação Marketplace</h3>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
              Publicar automaticamente após salvar
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MARKETPLACES.map((m) => {
              const Ic = m.icon;
              const active = selected.includes(m.id);
              const disabled = m.status === "não conectado";
              return (
                <button
                  key={m.id}
                  disabled={disabled}
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                    active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"
                  } ${disabled ? "opacity-60" : ""}`}
                >
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-muted text-foreground"><Ic className="h-4 w-4" /></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{m.name}</div>
                    <Badge tone={m.color}>{m.status}</Badge>
                  </div>
                  <input type="checkbox" checked={active} readOnly className="pointer-events-none" />
                </button>
              );
            })}
          </div>

          {/* Preview anúncio */}
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Preview do anúncio</span>
              <Badge tone="success" >Qualidade 92%</Badge>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {filled ? "Tela iPhone 11 Original com Aro - Garantia 90 dias - Envio Rápido" : "Título gerado pela IA aparecerá aqui"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {filled
                ? "Tela LCD original para iPhone 11 com aro frontal. Touch responsivo, cor fiel, ideal para assistência técnica. Garantia oficial de 90 dias contra defeitos de fabricação. Envio em até 24h."
                : "Descrição otimizada para SEO aparecerá aqui."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="info">Categoria: Celulares › Peças › Telas</Badge>
              <Badge>SEO: tela iphone 11</Badge>
              <Badge>palavra-chave: original</Badge>
              <Badge>display lcd</Badge>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <Zap className="h-4 w-4" /> Salvar rascunho
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const custo = Number(String(custoRef.current?.value ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
                  const preco = Number(String(precoRef.current?.value ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
                  const garantia = Number(String(garantiaRef.current?.value ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
                  await upsertProduto(storeId, {
                    id: productId,
                    nome: (nomeRef.current?.value ?? "").trim(),
                    sku: (skuRef.current?.value ?? "").trim(),
                    barras: (barrasRef.current?.value ?? "").trim(),
                    categoria: (categoriaRef.current?.value ?? "").trim(),
                    marca: (marcaRef.current?.value ?? "").trim(),
                    fornecedor: (fornecedorRef.current?.value ?? "").trim(),
                    custo: Number.isFinite(custo) ? custo : 0,
                    preco: Number.isFinite(preco) ? preco : 0,
                    garantia: Number.isFinite(garantia) ? garantia : 0,
                    active: true,
                  });
                  onSaved?.();
                  onClose();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar produto");
                }
              });
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> Salvar {autoPublish && selected.length > 0 ? `& publicar em ${selected.length}` : "produto"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Rel({ label, items, tone, icon: Ic }: { label: string; items: string[]; tone: any; icon: any }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><Ic className="h-3.5 w-3.5" /></div>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {items.map((i) => <Badge key={i} tone={tone}>{i}</Badge>)}
        </div>
      </div>
    </div>
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
