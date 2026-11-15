"use client";

/**
 * OMNI-VESTUARIO-P02 — Cadastros HUB · Grades e variações.
 * Só cadastro: nada aqui movimenta estoque, vende ou gera código de barras. O painel só existe quando o
 * servidor habilita o catálogo para a loja (flag privada + allowlist). Toda resposta é descartada se a loja
 * mudou ou se uma requisição mais nova já respondeu (sem mistura de dados entre lojas).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, Palette, Plus, Ruler, Shirt } from "lucide-react";
import { Badge, Card, Field, Input, Modal, Select } from "@/components/cadastros/lovable/components/cadastros/ui-kit";
import {
  addVestuarioTamanho, addVestuarioVariantes, createVestuarioCor, createVestuarioGrade, createVestuarioProdutoGrade,
  getVestuarioProdutoGrade, listVestuarioCatalogo, listVestuarioProdutosGrade, reorderVestuarioCores,
  reorderVestuarioTamanhos, updateVestuarioCor, updateVestuarioGrade, updateVestuarioProdutoGradeBase,
  updateVestuarioTamanho, updateVestuarioVariante,
} from "@/app/actions/vestuario-catalogo";
import { listCategorias, listFornecedores, listMarcas } from "@/app/actions/cadastros";
import type { CorDTO, GradeDTO, ProdutoGradeDTO, ProdutoGradeResumoDTO, VarianteDTO } from "@/lib/vestuario/catalog-service";
import { comboKey, formatCents, type VariantSituacao } from "@/lib/vestuario/catalog-normalize";

type Failure = { ok: false; message: string };
type Res<T> = { ok: true; value: T } | Failure;

const SITUACAO: Record<VariantSituacao, { label: string; tone: "success" | "warning" | "default"; title: string }> = {
  COMPLETA: { label: "Cadastro completo", tone: "success", title: "SKU e código interno informados. Estoque e venda por cor/tamanho ainda não estão disponíveis." },
  RASCUNHO: { label: "Rascunho", tone: "warning", title: "Falta SKU ou código interno. O código interno de etiqueta será tratado na fase de etiquetas." },
  INATIVA: { label: "Inativa", tone: "default", title: "Variação desativada; histórico preservado." },
};

/** Executa uma action e só devolve o resultado se a loja/sequência ainda for a atual. */
function useStoreGuard(storeId: string) {
  const seq = useRef(0);
  const current = useRef(storeId);
  current.current = storeId;
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    const mine = ++seq.current;
    const sid = storeId;
    const r = await fn();
    return mine === seq.current && sid === current.current ? r : null;
  }, [storeId]);
}

function notify<T>(r: Res<T>, success?: string): r is { ok: true; value: T } {
  if (r.ok) { if (success) toast.success(success); return true; }
  toast.error(r.message);
  return false;
}

export function VestuarioCatalogoPanel({ storeId, openNewProduct, onNewProductConsumed }: { storeId: string; openNewProduct?: boolean; onNewProductConsumed?: () => void }) {
  const [section, setSection] = useState<"produtos" | "grades" | "cores">("produtos");
  const [grades, setGrades] = useState<GradeDTO[]>([]);
  const [cores, setCores] = useState<CorDTO[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const guard = useStoreGuard(storeId);

  const reloadCatalogo = useCallback(async () => {
    const r = await guard(() => listVestuarioCatalogo(storeId));
    if (!r) return;
    if (!r.ok) { setLoadErr(r.message); return; }
    setLoadErr(null); setGrades(r.value.grades); setCores(r.value.cores);
  }, [guard, storeId]);

  // Recarrega ao abrir cada seção: "em uso"/ativos refletem variações criadas desde a última leitura.
  useEffect(() => { void reloadCatalogo(); }, [reloadCatalogo, section]);

  const sections = [
    { id: "produtos" as const, label: "Produtos com grade", icon: Shirt },
    { id: "grades" as const, label: "Grades de tamanho", icon: Ruler },
    { id: "cores" as const, label: "Cores", icon: Palette },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <Card className="border border-border bg-muted/20 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">Cadastro de grades e variações (cor × tamanho)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Esta etapa registra o catálogo. Estoque, venda e etiquetas por cor e tamanho ainda não estão disponíveis:
              produtos com grade não entram no PDV nem recebem entrada de estoque até as próximas fases.
            </p>
          </div>
        </div>
      </Card>
      <nav className="flex min-w-0 flex-wrap gap-1" aria-label="Seções de grade">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} type="button" onClick={() => setSection(s.id)} aria-pressed={section === s.id}
              className={["flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-smooth",
                section === s.id ? "border-primary/15 bg-primary/8 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"].join(" ")}>
              <Icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          );
        })}
      </nav>
      {loadErr && <Card className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{loadErr}</Card>}
      {section === "produtos" && (
        <ProdutosGradeSection storeId={storeId} grades={grades} cores={cores} openNew={openNewProduct} onOpenNewConsumed={onNewProductConsumed} onNeedCatalog={() => setSection(grades.length ? "cores" : "grades")} />
      )}
      {section === "grades" && <GradesSection storeId={storeId} grades={grades} reload={reloadCatalogo} />}
      {section === "cores" && <CoresSection storeId={storeId} cores={cores} reload={reloadCatalogo} />}
    </div>
  );
}

// ───────────────────────────── Grades ─────────────────────────────

function GradesSection({ storeId, grades, reload }: { storeId: string; grades: GradeDTO[]; reload: () => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [tamanhos, setTamanhos] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async <T,>(p: Promise<Res<T>>, msg?: string) => { setBusy(true); try { const r = await p; if (notify(r, msg)) await reload(); return r.ok; } finally { setBusy(false); } };

  return (
    <div className="min-w-0 space-y-4">
      <Card className="border border-border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Nova grade</p>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nome da grade"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Adulto, Jeans, Calçados" maxLength={60} /></Field>
          <div className="min-w-0 md:col-span-2">
            <Field label="Tamanhos (na ordem, separados por vírgula)"><Input value={tamanhos} onChange={(e) => setTamanhos(e.target.value)} placeholder="PP, P, M, G, GG, XG" /></Field>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={busy || !nome.trim()} onClick={async () => {
            const list = tamanhos.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
            if (await act(createVestuarioGrade(storeId, { nome, tamanhos: list }), "Grade criada.")) { setNome(""); setTamanhos(""); }
          }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Criar grade
          </button>
        </div>
      </Card>
      {grades.length === 0 && <Card className="border border-border p-6 text-center text-sm text-muted-foreground">Nenhuma grade cadastrada nesta loja.</Card>}
      {grades.map((g) => <GradeCard key={g.id} storeId={storeId} grade={g} busy={busy} act={act} />)}
    </div>
  );
}

function GradeCard({ storeId, grade, busy, act }: { storeId: string; grade: GradeDTO; busy: boolean; act: <T>(p: Promise<Res<T>>, msg?: string) => Promise<boolean> }) {
  const [novo, setNovo] = useState("");
  const [nome, setNome] = useState(grade.nome);
  useEffect(() => setNome(grade.nome), [grade.nome]);
  const move = (i: number, d: -1 | 1) => {
    const ids = grade.tamanhos.map((t) => t.id);
    const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void act(reorderVestuarioTamanhos(storeId, { gradeId: grade.id, ids }));
  };
  return (
    <Card className="border border-border p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input className="max-w-xs" aria-label="Nome da grade" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
        {nome.trim() !== grade.nome && (
          <button type="button" disabled={busy} onClick={() => act(updateVestuarioGrade(storeId, { id: grade.id, nome, expectedVersion: grade.version }), "Grade renomeada.")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40">Salvar nome</button>
        )}
        <Badge tone={grade.ativo ? "success" : "default"}>{grade.ativo ? "Ativa" : "Inativa"}</Badge>
        <button type="button" disabled={busy} onClick={() => act(updateVestuarioGrade(storeId, { id: grade.id, ativo: !grade.ativo, expectedVersion: grade.version }))}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40">{grade.ativo ? "Desativar grade" : "Reativar grade"}</button>
      </div>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {grade.tamanhos.map((t, i) => <TamanhoRow key={t.id} storeId={storeId} t={t} first={i === 0} last={i === grade.tamanhos.length - 1} busy={busy} act={act} onMove={(d) => move(i, d)} />)}
        {grade.tamanhos.length === 0 && <li className="p-3 text-xs text-muted-foreground">Sem tamanhos.</li>}
      </ul>
      <div className="mt-3 flex min-w-0 gap-2">
        <Input aria-label="Novo tamanho" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo tamanho" maxLength={20} />
        <button type="button" disabled={busy || !novo.trim()} onClick={async () => { if (await act(addVestuarioTamanho(storeId, { gradeId: grade.id, rotulo: novo }), "Tamanho incluído.")) setNovo(""); }}
          className="shrink-0 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50">Incluir</button>
      </div>
    </Card>
  );
}

function TamanhoRow({ storeId, t, first, last, busy, act, onMove }: {
  storeId: string; t: GradeDTO["tamanhos"][number]; first: boolean; last: boolean; busy: boolean
  act: <T>(p: Promise<Res<T>>, msg?: string) => Promise<boolean>; onMove: (d: -1 | 1) => void
}) {
  const [rotulo, setRotulo] = useState(t.rotulo);
  useEffect(() => setRotulo(t.rotulo), [t.rotulo]);
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 p-2">
      <div className="flex shrink-0 flex-col">
        <button type="button" aria-label={`Subir ${t.rotulo}`} disabled={busy || first} onClick={() => onMove(-1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted/40 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label={`Descer ${t.rotulo}`} disabled={busy || last} onClick={() => onMove(1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted/40 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
      </div>
      <Input className="w-28" aria-label={`Rótulo do tamanho ${t.rotulo}`} value={rotulo} disabled={t.emUso} title={t.emUso ? "Tamanho já usado em variações: não pode ser renomeado. Desative e crie outro." : undefined}
        onChange={(e) => setRotulo(e.target.value)} maxLength={20} />
      {!t.emUso && rotulo.trim() !== t.rotulo && (
        <button type="button" disabled={busy} onClick={() => act(updateVestuarioTamanho(storeId, { id: t.id, rotulo }))} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted/40">Salvar</button>
      )}
      {t.emUso && <Badge tone="info">Em uso</Badge>}
      <Badge tone={t.ativo ? "success" : "default"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
      <button type="button" disabled={busy} onClick={() => act(updateVestuarioTamanho(storeId, { id: t.id, ativo: !t.ativo }))}
        className="ml-auto rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted/40">{t.ativo ? "Desativar" : "Reativar"}</button>
    </li>
  );
}

// ───────────────────────────── Cores ─────────────────────────────

function Swatch({ hex }: { hex: string | null }) {
  // A cor exibida é dado cadastrado pela loja (não é token de tema).
  return hex
    ? <span aria-hidden className="inline-block h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: hex }} />
    : <span aria-hidden className="inline-block h-5 w-5 shrink-0 rounded-full border border-dashed border-border bg-muted" />;
}

function CoresSection({ storeId, cores, reload }: { storeId: string; cores: CorDTO[]; reload: () => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [hex, setHex] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async <T,>(p: Promise<Res<T>>, msg?: string) => { setBusy(true); try { const r = await p; if (notify(r, msg)) await reload(); return r.ok; } finally { setBusy(false); } };
  const move = (i: number, d: -1 | 1) => {
    const ids = cores.map((c) => c.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; void act(reorderVestuarioCores(storeId, { ids }));
  };
  return (
    <div className="min-w-0 space-y-4">
      <Card className="border border-border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Nova cor</p>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nome comercial"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Azul Marinho, Estampado" maxLength={60} /></Field>
          <Field label="Cor visual (opcional)">
            <div className="flex min-w-0 items-center gap-2">
              <input type="color" aria-label="Escolher cor visual" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#808080"} onChange={(e) => setHex(e.target.value.toUpperCase())} className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-background" />
              <Input value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB ou vazio" maxLength={7} />
            </div>
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={busy || !nome.trim()} onClick={async () => { if (await act(createVestuarioCor(storeId, { nome, hex: hex || null }), "Cor criada.")) { setNome(""); setHex(""); } }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /> Criar cor</button>
        </div>
      </Card>
      {cores.length === 0 && <Card className="border border-border p-6 text-center text-sm text-muted-foreground">Nenhuma cor cadastrada nesta loja.</Card>}
      {cores.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {cores.map((c, i) => <CorRow key={c.id} storeId={storeId} c={c} first={i === 0} last={i === cores.length - 1} busy={busy} act={act} onMove={(d) => move(i, d)} />)}
        </ul>
      )}
    </div>
  );
}

function CorRow({ storeId, c, first, last, busy, act, onMove }: {
  storeId: string; c: CorDTO; first: boolean; last: boolean; busy: boolean; act: <T>(p: Promise<Res<T>>, msg?: string) => Promise<boolean>; onMove: (d: -1 | 1) => void
}) {
  const [nome, setNome] = useState(c.nome);
  const [hex, setHex] = useState(c.hex ?? "");
  useEffect(() => { setNome(c.nome); setHex(c.hex ?? ""); }, [c.nome, c.hex]);
  const dirty = nome.trim() !== c.nome || (hex || null) !== c.hex;
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 p-3">
      <div className="flex shrink-0 flex-col">
        <button type="button" aria-label={`Subir ${c.nome}`} disabled={busy || first} onClick={() => onMove(-1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted/40 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label={`Descer ${c.nome}`} disabled={busy || last} onClick={() => onMove(1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted/40 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
      </div>
      <Swatch hex={c.hex} />
      <Input className="min-w-0 max-w-[14rem]" aria-label={`Nome da cor ${c.nome}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
      <Input className="w-28" aria-label={`Cor visual de ${c.nome}`} value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB" maxLength={7} />
      {dirty && <button type="button" disabled={busy} onClick={() => act(updateVestuarioCor(storeId, { id: c.id, nome, hex: hex || null }), "Cor atualizada.")} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted/40">Salvar</button>}
      {c.emUso && <Badge tone="info">Em uso</Badge>}
      <Badge tone={c.ativo ? "success" : "default"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
      <button type="button" disabled={busy} onClick={() => act(updateVestuarioCor(storeId, { id: c.id, ativo: !c.ativo }))}
        className="ml-auto rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted/40">{c.ativo ? "Desativar" : "Reativar"}</button>
    </li>
  );
}

// ───────────────────────────── Produtos com grade ─────────────────────────────

function ProdutosGradeSection({ storeId, grades, cores, openNew, onOpenNewConsumed, onNeedCatalog }: {
  storeId: string; grades: GradeDTO[]; cores: CorDTO[]; openNew?: boolean; onOpenNewConsumed?: () => void; onNeedCatalog: () => void
}) {
  const [items, setItems] = useState<ProdutoGradeResumoDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<{ mode: "new" } | { mode: "edit"; produtoId: string } | null>(null);
  const guard = useStoreGuard(storeId);

  const load = useCallback(async (append: string | null) => {
    setLoading(true);
    const r = await guard(() => listVestuarioProdutosGrade(storeId, { cursor: append, q }));
    if (!r) return;
    setLoading(false);
    if (!r.ok) { toast.error(r.message); return; }
    setItems((prev) => (append ? [...prev, ...r.value.items] : r.value.items));
    setCursor(r.value.nextCursor);
  }, [guard, storeId, q]);

  useEffect(() => { const t = setTimeout(() => void load(null), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (openNew) { setEditor({ mode: "new" }); onOpenNewConsumed?.(); } }, [openNew, onOpenNewConsumed]);

  const ready = grades.some((g) => g.ativo && g.tamanhos.some((t) => t.ativo)) && cores.some((c) => c.ativo);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input className="min-w-0 max-w-sm" aria-label="Buscar produto com grade" placeholder="Buscar produto com grade…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => (ready ? setEditor({ mode: "new" }) : onNeedCatalog())}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo produto com grade
        </button>
      </div>
      {!ready && <Card className="border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Cadastre ao menos uma grade com tamanhos ativos e uma cor ativa para criar produtos com grade.</Card>}
      {!loading && items.length === 0 && <Card className="border border-border p-6 text-center text-sm text-muted-foreground">Nenhum produto com grade nesta loja.</Card>}
      {items.length > 0 && (
        <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Variações</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <tr key={it.produtoId}>
                  <td className="px-3 py-2 font-medium text-foreground">{it.nome}{!it.ativo && <span className="ml-2"><Badge>Inativo</Badge></span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{it.gradeNome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{it.ativas} ativa(s) de {it.variantes}</td>
                  <td className="px-3 py-2">{it.rascunhos > 0 ? <Badge tone="warning">{it.rascunhos} em rascunho</Badge> : <Badge tone="success">Cadastro completo</Badge>}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => setEditor({ mode: "edit", produtoId: it.produtoId })} className="rounded-lg border border-border px-3 py-1 text-xs font-semibold hover:bg-muted/40">Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && <div className="flex justify-center"><button type="button" disabled={loading} onClick={() => void load(cursor)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40">Carregar mais</button></div>}
      {editor && (
        <ProdutoGradeEditor key={editor.mode === "edit" ? editor.produtoId : "new"} storeId={storeId} grades={grades} cores={cores}
          produtoId={editor.mode === "edit" ? editor.produtoId : null}
          onClose={() => setEditor(null)} onSaved={(produtoId) => { setEditor({ mode: "edit", produtoId }); void load(null); }} />
      )}
    </div>
  );
}

type Lookups = { categorias: string[]; marcas: string[]; fornecedores: string[] };

function ProdutoGradeEditor({ storeId, grades, cores, produtoId, onClose, onSaved }: {
  storeId: string; grades: GradeDTO[]; cores: CorDTO[]; produtoId: string | null; onClose: () => void; onSaved: (produtoId: string) => void
}) {
  const guard = useStoreGuard(storeId);
  const [produto, setProduto] = useState<ProdutoGradeDTO | null>(null);
  const [base, setBase] = useState({ nome: "", categoria: "", marca: "", fornecedor: "", preco: "", custo: "", skuPai: "" });
  const [gradeId, setGradeId] = useState("");
  const [corIds, setCorIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [lookups, setLookups] = useState<Lookups>({ categorias: [], marcas: [], fornecedores: [] });

  const reload = useCallback(async () => {
    if (!produtoId) return;
    const r = await guard(() => getVestuarioProdutoGrade(storeId, produtoId));
    if (!r) return;
    if (!r.ok) { toast.error(r.message); return; }
    const p = r.value;
    setProduto(p); setGradeId(p.grade.id);
    setBase({ nome: p.nome, categoria: p.categoria ?? "", marca: p.marca, fornecedor: p.fornecedor, preco: formatCents(p.precoCentavos), custo: formatCents(p.custoCentavos), skuPai: p.sku ?? "" });
    setCorIds((prev) => [...new Set([...p.variantes.map((v) => v.corId), ...prev])]);
    setSelected(new Set());
  }, [guard, storeId, produtoId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    let alive = true;
    void Promise.all([listCategorias(storeId).catch(() => []), listMarcas(storeId).catch(() => []), listFornecedores(storeId).catch(() => [])]).then(([c, m, f]) => {
      if (!alive) return;
      setLookups({ categorias: c.filter((x) => x.active).map((x) => x.name), marcas: m.filter((x) => x.active).map((x) => x.name), fornecedores: f.map((x) => x.nome) });
    });
    return () => { alive = false; };
  }, [storeId]);

  const grade = useMemo(
    () => (produto ? grades.find((g) => g.id === produto.grade.id) ?? { ...produto.grade, ativo: true, version: 1 } : grades.find((g) => g.id === gradeId)),
    [produto, grades, gradeId],
  );
  const tamanhos = useMemo(() => (grade?.tamanhos ?? []).filter((t) => t.ativo || produto?.variantes.some((v) => v.tamanhoId === t.id)), [grade, produto]);
  const existing = useMemo(() => new Map((produto?.variantes ?? []).map((v) => [comboKey(v.corId, v.tamanhoId), v])), [produto]);
  const shownCores = cores.filter((c) => corIds.includes(c.id));
  const toggleCor = (id: string) => {
    setCorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSelected((prev) => {
      const next = new Set(prev);
      const adding = !corIds.includes(id);
      for (const t of tamanhos) {
        const k = comboKey(id, t.id);
        if (existing.has(k) || !t.ativo) continue;
        if (adding) next.add(k); else next.delete(k);
      }
      return next;
    });
  };
  const toggleCell = (k: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const combos = [...selected].map((k) => { const [corId, tamanhoId] = JSON.parse(k) as [string, string]; return { corId, tamanhoId }; });

  const save = async () => {
    setBusy(true);
    try {
      if (!produto) {
        const r = await createVestuarioProdutoGrade(storeId, { ...base, skuPai: base.skuPai || null, gradeId, combinacoes: combos });
        if (notify(r, `Produto criado com ${combos.length} variação(ões) em rascunho.`)) onSaved(r.value.produtoId);
        return;
      }
      let version = produto.catalogVersion;
      const changed = base.nome !== produto.nome || base.categoria !== (produto.categoria ?? "") || base.marca !== produto.marca || base.fornecedor !== produto.fornecedor
        || base.preco !== formatCents(produto.precoCentavos) || base.custo !== formatCents(produto.custoCentavos);
      if (changed) {
        const r = await updateVestuarioProdutoGradeBase(storeId, { produtoId: produto.produtoId, expectedVersion: version, nome: base.nome, categoria: base.categoria || null, marca: base.marca || null, fornecedor: base.fornecedor || null, preco: base.preco || null, custo: base.custo || null });
        if (!notify(r)) return;
        version = r.value.catalogVersion;
      }
      if (combos.length) {
        const r = await addVestuarioVariantes(storeId, { produtoId: produto.produtoId, expectedVersion: version, combinacoes: combos });
        if (!r.ok) {
          // Os dados comuns (se alterados) já foram gravados; recarrega para não ficar com versão antiga.
          toast.error(changed ? `Dados do produto salvos, mas as novas variações não: ${r.message}` : r.message);
          await reload();
          return;
        }
      }
      toast.success("Produto atualizado.");
      await reload();
    } finally { setBusy(false); }
  };

  const toggleProdutoAtivo = async () => {
    if (!produto) return;
    setBusy(true);
    try { if (notify(await updateVestuarioProdutoGradeBase(storeId, { produtoId: produto.produtoId, expectedVersion: produto.catalogVersion, ativo: !produto.ativo }))) await reload(); } finally { setBusy(false); }
  };

  const canSave = !busy && base.nome.trim() && (produto ? true : gradeId && combos.length > 0);
  const activeGrades = grades.filter((g) => g.ativo);
  return (
    <Modal open onClose={onClose} accessible size="xl" title={produto ? produto.nome : "Novo produto com grade"} subtitle="Cadastro de catálogo — sem estoque, venda ou etiqueta nesta fase.">
      <div className="min-w-0 space-y-5">
        <datalist id="vest-cat">{lookups.categorias.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="vest-marca">{lookups.marcas.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="vest-forn">{lookups.fornecedores.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nome do produto" span={2}><Input value={base.nome} onChange={(e) => setBase({ ...base, nome: e.target.value })} maxLength={200} placeholder="Ex.: Camiseta básica" /></Field>
          <Field label="SKU do produto (referência do grupo)">
            <Input value={base.skuPai} disabled={!!produto} onChange={(e) => setBase({ ...base, skuPai: e.target.value })} maxLength={60} placeholder="Opcional" />
          </Field>
          <Field label="Categoria"><Input list="vest-cat" value={base.categoria} onChange={(e) => setBase({ ...base, categoria: e.target.value })} maxLength={120} /></Field>
          <Field label="Marca"><Input list="vest-marca" value={base.marca} onChange={(e) => setBase({ ...base, marca: e.target.value })} maxLength={120} /></Field>
          <Field label="Fornecedor"><Input list="vest-forn" value={base.fornecedor} onChange={(e) => setBase({ ...base, fornecedor: e.target.value })} maxLength={200} /></Field>
          <Field label="Preço de venda (R$)"><Input inputMode="decimal" value={base.preco} onChange={(e) => setBase({ ...base, preco: e.target.value })} placeholder="0,00" /></Field>
          <Field label="Custo de referência (R$)"><Input inputMode="decimal" value={base.custo} onChange={(e) => setBase({ ...base, custo: e.target.value })} placeholder="0,00" /></Field>
          <Field label="Grade de tamanhos">
            {produto
              ? <Input value={produto.grade.nome} disabled title="A grade de um produto não muda depois de criado." />
              : <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSelected(new Set()); setCorIds([]); }}>
                  <option value="">Selecione…</option>
                  {activeGrades.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.tamanhos.filter((t) => t.ativo).map((t) => t.rotulo).join(", ")})</option>)}
                </Select>}
          </Field>
        </div>

        {grade && (
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cores do produto</p>
            <div className="flex min-w-0 flex-wrap gap-2">
              {cores.filter((c) => c.ativo || corIds.includes(c.id)).map((c) => {
                const on = corIds.includes(c.id);
                const locked = produto?.variantes.some((v) => v.corId === c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} disabled={busy || (locked && on)} onClick={() => toggleCor(c.id)}
                    title={locked ? "Cor com variações cadastradas" : undefined}
                    className={["flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-smooth", on ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"].join(" ")}>
                    <Swatch hex={c.hex} /> {c.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {grade && shownCores.length > 0 && (
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Matriz cor × tamanho — marque somente as combinações que existem</p>
            <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
              <table className="text-xs">
                <thead className="bg-muted/30">
                  <tr><th className="sticky left-0 bg-muted/30 px-3 py-2 text-left">Cor</th>{tamanhos.map((t) => <th key={t.id} className="px-3 py-2 text-center font-semibold">{t.rotulo}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shownCores.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-medium"><span className="flex items-center gap-2"><Swatch hex={c.hex} />{c.nome}</span></th>
                      {tamanhos.map((t) => {
                        const k = comboKey(c.id, t.id);
                        const v = existing.get(k);
                        if (v) return <td key={t.id} className="px-3 py-2 text-center"><Badge tone={SITUACAO[v.situacao].tone}>{v.situacao === "INATIVA" ? "Inativa" : "Cadastrada"}</Badge></td>;
                        return (
                          <td key={t.id} className="px-3 py-2 text-center">
                            <input type="checkbox" aria-label={`${c.nome} ${t.rotulo}`} disabled={busy || !t.ativo || !c.ativo} checked={selected.has(k)} onChange={() => toggleCell(k)} className="h-4 w-4 accent-primary" />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{combos.length} combinação(ões) nova(s) selecionada(s). Variações nascem em rascunho, sem estoque.</p>
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {produto && <button type="button" disabled={busy} onClick={toggleProdutoAtivo} className="mr-auto rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40">{produto.ativo ? "Desativar produto" : "Reativar produto"}</button>}
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40">Fechar</button>
          <button type="button" disabled={!canSave} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {produto ? "Salvar alterações" : "Criar produto com grade"}
          </button>
        </div>

        {produto && produto.variantes.length > 0 && (
          <VariantesTable storeId={storeId} produto={produto} cores={cores} tamanhos={grade?.tamanhos ?? []} reload={reload} />
        )}
      </div>
    </Modal>
  );
}

function VariantesTable({ storeId, produto, cores, tamanhos, reload }: { storeId: string; produto: ProdutoGradeDTO; cores: CorDTO[]; tamanhos: GradeDTO["tamanhos"]; reload: () => Promise<void> }) {
  const corNome = new Map(cores.map((c) => [c.id, c]));
  const tamNome = new Map(tamanhos.map((t) => [t.id, t.rotulo]));
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Variações cadastradas</p>
      <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[40rem] text-xs">
          <thead className="bg-muted/30 text-left text-muted-foreground">
            <tr><th className="px-3 py-2">Cor / tamanho</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Preço próprio (R$)</th><th className="px-3 py-2">Código interno</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {produto.variantes.map((v) => <VarianteRow key={v.id} storeId={storeId} v={v} label={`${corNome.get(v.corId)?.nome ?? "?"} / ${tamNome.get(v.tamanhoId) ?? "?"}`} hex={corNome.get(v.corId)?.hex ?? null} precoPai={produto.precoCentavos} reload={reload} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VarianteRow({ storeId, v, label, hex, precoPai, reload }: { storeId: string; v: VarianteDTO; label: string; hex: string | null; precoPai: number; reload: () => Promise<void> }) {
  const [sku, setSku] = useState(v.sku ?? "");
  const [preco, setPreco] = useState(formatCents(v.precoCentavos));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSku(v.sku ?? ""); setPreco(formatCents(v.precoCentavos)); }, [v.sku, v.precoCentavos]);
  const dirty = sku.trim().toUpperCase() !== (v.sku ?? "") || preco !== formatCents(v.precoCentavos);
  const send = async (input: Record<string, unknown>) => {
    setBusy(true);
    try { if (notify(await updateVestuarioVariante(storeId, { varianteId: v.id, expectedVersion: v.version, ...input }))) await reload(); } finally { setBusy(false); }
  };
  const s = SITUACAO[v.situacao];
  return (
    <tr>
      <td className="px-3 py-2 font-medium"><span className="flex items-center gap-2"><Swatch hex={hex} />{label}</span></td>
      <td className="px-3 py-2"><Input className="w-40" aria-label={`SKU de ${label}`} value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} placeholder="Sem SKU" /></td>
      <td className="px-3 py-2"><Input className="w-28" aria-label={`Preço de ${label}`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder={formatCents(precoPai) || "Herda"} title="Vazio herda o preço do produto." /></td>
      <td className="px-3 py-2 text-muted-foreground">{v.barcodeInterno ?? "Fase de etiquetas"}</td>
      <td className="px-3 py-2"><span title={s.title}><Badge tone={s.tone}>{s.label}</Badge></span></td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {dirty && <button type="button" disabled={busy} onClick={() => send({ sku: sku || null, preco: preco || null })} className="mr-1 rounded-lg border border-border px-2 py-1 font-semibold hover:bg-muted/40">Salvar</button>}
        <button type="button" disabled={busy} onClick={() => send({ ativo: !v.ativo })} className="rounded-lg border border-border px-2 py-1 font-semibold hover:bg-muted/40">{v.ativo ? "Desativar" : "Reativar"}</button>
      </td>
    </tr>
  );
}
