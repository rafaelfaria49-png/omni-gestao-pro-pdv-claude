import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Search, Plus, Upload, Users, Package, Wrench, Truck, HardHat, Smartphone,
  AlertTriangle, RefreshCw, LayoutDashboard, Tag, FileSpreadsheet, History,
  Sparkles, MessageCircle, ShoppingCart, Edit3, Eye, Trash2, ChevronRight,
  CheckCircle2, ArrowUpRight, Database, Filter, Download, Workflow,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge, Card, Field, Input, Modal, SectionTitle, Select, Textarea, useToggle } from "./ui-kit";
import { ProductAIModal, QualityScore, InteligenciaCadastros } from "./produto-ia";
import { ImportacaoHub } from "./ImportacaoHub";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults";
import {
  createCliente,
  getCadastrosDashboardStats,
  listCategorias,
  listEquipamentosModelos,
  listClientes,
  listFornecedores,
  listMarcas,
  listProdutos,
  listServicos,
  listTecnicos,
  listLogsAuditoriaCadastros,
  type AuditoriaItemDTO,
  type CategoriaCadastroDTO,
  type ClienteDTO,
  type EquipamentoModeloDTO,
  type FornecedorDTO,
  type MarcaCadastroDTO,
  type ProdutoDTO,
  type ServicoDTO,
  type TecnicoDTO,
  upsertCategoria,
  upsertEquipamentoModelo,
  upsertFornecedor,
  upsertMarca,
  upsertTecnico,
  updateCliente,
  upsertServico,
  upsertProduto,
  deleteProduto,
  type DeleteProdutoResult,
} from "@/app/actions/cadastros";
import { catalogQualityScore } from "@/lib/cadastros/produto-quality-score";

const ICONS: Record<string, any> = {
  Users, Package, Wrench, Truck, HardHat, Smartphone, AlertTriangle, RefreshCw,
};

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "produtos", label: "Produtos", icon: Package },
  { id: "servicos", label: "Serviços", icon: Wrench },
  { id: "fornecedores", label: "Fornecedores", icon: Truck },
  { id: "tecnicos", label: "Técnicos", icon: HardHat },
  { id: "equipamentos", label: "Equipamentos", icon: Smartphone },
  { id: "categorias", label: "Categorias / Marcas", icon: Tag },
  { id: "importacao", label: "Importação", icon: FileSpreadsheet },
  { id: "auditoria", label: "Auditoria", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CadastrosHub() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const novo = useToggle();
  const { lojaAtivaId } = useLojaAtiva();
  const storeId = (lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID;

  return (
    <div className="w-full min-w-0 max-w-full bg-background">
      {/* HEADER */}
      <header className="z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="w-full px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl gradient-primary ring-primary-glow">
                <Database className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-bold text-foreground">Cadastros HUB</h1>
                  <Badge tone="primary">Premium</Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  Clientes, produtos, serviços, fornecedores e base operacional centralizada.
                </p>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="relative hidden lg:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Buscar em todos os cadastros…"
                  className="w-80 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={() => setTab("importacao")}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent transition"
                title="Abrir HUB de Importação"
              >
                <Upload className="h-4 w-4" /> <span className="hidden md:inline">Importar</span>
              </button>
              <button
                onClick={novo.openIt}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                <Plus className="h-4 w-4" /> Novo cadastro
              </button>
              <ThemeSwitcher />
            </div>
          </div>

          {/* TABS */}
          <nav className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* CONTENT */}
      <main className="w-full min-w-0 px-6 py-8">
        {tab === "dashboard" && <DashboardPanel />}
        {tab === "clientes" && <ClientesPanel storeId={storeId} />}
        {tab === "produtos" && <ProdutosPanel storeId={storeId} />}
        {tab === "servicos" && <ServicosPanel storeId={storeId} />}
        {tab === "fornecedores" && <FornecedoresPanel storeId={storeId} />}
        {tab === "tecnicos" && <TecnicosPanel storeId={storeId} />}
        {tab === "equipamentos" && <EquipamentosPanel storeId={storeId} />}
        {tab === "categorias" && <CategoriasPanel storeId={storeId} />}
        {tab === "importacao" && <ImportacaoPanel />}
        {tab === "auditoria" && <AuditoriaPanel />}
      </main>

      <Modal open={novo.open} onClose={novo.close} title="Novo cadastro" subtitle="Selecione o tipo de cadastro que deseja criar.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { l: "Cliente", i: Users }, { l: "Produto", i: Package }, { l: "Serviço", i: Wrench },
            { l: "Fornecedor", i: Truck }, { l: "Técnico", i: HardHat }, { l: "Equipamento", i: Smartphone },
          ].map((x) => (
            <button key={x.l} className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 text-left hover:border-primary hover:bg-accent transition">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <x.i className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">{x.l}</div>
                <div className="text-xs text-muted-foreground">Criar novo</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

    </div>
  );
}

/* ───── DASHBOARD ───── */
function DashboardPanel() {
  const quick = [
    { l: "Novo cliente", i: Users }, { l: "Novo produto", i: Package }, { l: "Novo serviço", i: Wrench },
    { l: "Novo fornecedor", i: Truck }, { l: "Novo técnico", i: HardHat },
    { l: "Importar planilha", i: Upload }, { l: "Revisar incompletos", i: AlertTriangle },
  ];
  const { lojaAtivaId } = useLojaAtiva();
  const storeId = (lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getCadastrosDashboardStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const s = await getCadastrosDashboardStats(storeId);
        if (!alive) return;
        setStats(s);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Falha ao carregar indicadores");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [storeId]);

  return (
    <div className="w-full min-w-0 space-y-8">
      {loading && <div className="text-sm text-muted-foreground">Carregando indicadores…</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}
      {/* KPIs */}
      <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-4">
        {(stats?.kpis ?? []).map((k) => {
          const Icon = ICONS[k.icon] ?? Package;
          const negative = k.delta.startsWith("-");
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <Badge tone={negative ? "danger" : "success"}>{k.delta}</Badge>
              </div>
              <div className="mt-4 text-3xl font-bold text-foreground">{k.value.toLocaleString("pt-BR")}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle title="Cards rápidos" subtitle="Operações mais usadas em um clique." />
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {quick.map((q) => (
            <button key={q.l} className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary hover:ring-primary-glow">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <q.i className="h-4 w-4" />
              </div>
              <div className="text-sm font-medium text-foreground">{q.l}</div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        {/* Saúde */}
        <Card className="p-6 lg:col-span-2">
          <SectionTitle title="Saúde dos cadastros" subtitle="Indicadores de completude por entidade." />
          <div className="space-y-4">
            {(stats?.saude ?? []).map((s) => (
              <div key={s.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground">{s.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${s.value}%`,
                      background: s.value >= 90
                        ? "var(--success)"
                        : s.value >= 75
                        ? "var(--primary)"
                        : "var(--warning)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* IA */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">IA de Cadastros</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Sugestões automáticas para melhorar a base.</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              "12 produtos sem margem definida",
              "5 clientes possivelmente duplicados",
              "8 serviços sem termo de garantia",
              "3 fornecedores sem WhatsApp",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground">{t}</span>
              </li>
            ))}
          </ul>
          <button className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Corrigir com IA
          </button>
        </Card>
      </div>

      <InteligenciaCadastros stats={stats?.ia} />
      <VinculosSistema />
    </div>
  );
}

function VinculosSistema() {
  const flows = [
    { l: "Cliente → OS → Garantia → WhatsApp", c: "info" as const },
    { l: "Produto → Estoque → PDV → Financeiro", c: "primary" as const },
    { l: "Serviço → OS → Garantia → Marketing IA", c: "success" as const },
    { l: "Fornecedor → Produto → Compra → Custo", c: "warning" as const },
    { l: "Modelo → Peça compatível → Diagnóstico IA", c: "info" as const },
  ];
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Workflow className="h-5 w-5 text-primary" />
        <SectionTitle title="Vínculos do sistema" subtitle="Como os cadastros se conectam entre os módulos." />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {flows.map((f) => (
          <div key={f.l} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-4">
            <Badge tone={f.c}>Fluxo</Badge>
            <span className="min-w-0 truncate text-sm text-foreground">{f.l}</span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ───── TABLE TOOLBAR ───── */
function Toolbar({
  count,
  label,
  onNew,
  filterQuery,
  onFilterQueryChange,
}: {
  count: number;
  label: string;
  onNew?: () => void;
  filterQuery?: string;
  onFilterQueryChange?: (v: string) => void;
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
      <div className="relative min-w-0 max-w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder={`Buscar em ${label.toLowerCase()}…`}
          value={filterQuery ?? ""}
          onChange={(e) => onFilterQueryChange?.(e.target.value)}
          className="w-64 max-w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent">
        <Filter className="h-4 w-4" /> Filtros
      </button>
      <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent">
        <Download className="h-4 w-4" /> Exportar
      </button>
      <span className="ml-auto text-sm text-muted-foreground">{count} {label}</span>
      {onNew && (
        <button onClick={onNew} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo
        </button>
      )}
    </div>
  );
}

/* ───── helpers de máscara de documento ───── */
function maskCPF(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
function applyDocMask(v: string, tipo: "PF" | "PJ"): string {
  return tipo === "PF" ? maskCPF(v) : maskCNPJ(v);
}

/* ───── CLIENTES ───── */
function ClientesPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [editing, setEditing] = useState<ClienteDTO | null>(null);
  const [rows, setRows] = useState<ClienteDTO[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [tipoSelecionado, setTipoSelecionado] = useState<"PF" | "PJ">("PF");
  const [docValue, setDocValue] = useState("");
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const telRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const cidadeRef = useRef<HTMLInputElement | null>(null);
  const tagsRef = useRef<HTMLInputElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listClientes(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar clientes");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sincroniza tipo e documento com o cliente editado ao abrir/fechar o modal
  useEffect(() => {
    if (m.open) {
      const tipo = editing?.tipo ?? "PF";
      setTipoSelecionado(tipo);
      const rawDoc = editing?.documento === "—" ? "" : (editing?.documento ?? "");
      setDocValue(applyDocMask(rawDoc, tipo));
    } else {
      setTipoSelecionado("PF");
      setDocValue("");
    }
  }, [m.open, editing]);

  const visibleRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const blob = [c.nome, c.telefone, c.documento, c.cidade].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, filterQuery]);

  return (
    <div className="w-full min-w-0">
      <Toolbar
        count={visibleRows.length}
        label="clientes"
        onNew={m.openIt}
        filterQuery={filterQuery}
        onFilterQueryChange={setFilterQuery}
      />
      {loading && <div className="mb-3 text-sm text-muted-foreground">Carregando clientes…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      <Card className="overflow-hidden">
        <div className="w-full min-w-0 max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Cliente", "Tipo", "Telefone", "Documento", "Cidade", "Total gasto", "Última compra", "Tags", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.id}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={c.tipo === "PJ" ? "info" : "default"}>{c.tipo}</Badge></td>
                  <td className="px-4 py-3 text-foreground">{c.telefone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.documento}</td>
                  <td className="px-4 py-3 text-foreground">{c.cidade}</td>
                  <td className="px-4 py-3 font-medium text-foreground">R$ {c.totalGasto.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.ultimaCompra}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div></td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        startSaving(async () => {
                          try {
                            await updateCliente(storeId, c.id, { active: c.status !== "Ativo" });
                            await refresh();
                          } catch (e) {
                            window.alert(e instanceof Error ? e.message : "Não foi possível atualizar status");
                          }
                        });
                      }}
                      className="inline-flex"
                      title="Ativar/Inativar"
                    >
                      <Badge tone={c.status === "Ativo" ? "success" : "default"}>{c.status}</Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <button disabled className="rounded p-1.5 opacity-40 cursor-not-allowed" title="Visualizar (em breve)"><Eye className="h-4 w-4" /></button>
                      <button
                        className="rounded p-1.5 hover:bg-accent hover:text-foreground"
                        title="Editar cliente"
                        onClick={() => {
                          setEditing(c);
                          m.openIt();
                        }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button disabled className="rounded p-1.5 opacity-40 cursor-not-allowed" title="Nova OS (em breve)"><Wrench className="h-4 w-4" /></button>
                      <button disabled className="rounded p-1.5 opacity-40 cursor-not-allowed" title="Nova venda (em breve)"><ShoppingCart className="h-4 w-4" /></button>
                      {c.telefone && c.telefone !== "—" ? (
                        <button
                          className="rounded p-1.5 hover:bg-accent hover:text-foreground"
                          title="Abrir WhatsApp"
                          onClick={() => {
                            const digits = c.telefone.replace(/\D/g, "");
                            const phone = digits.startsWith("55") ? digits : `55${digits}`;
                            window.open(`https://wa.me/${phone}`, "_blank");
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      ) : (
                        <button disabled className="rounded p-1.5 opacity-40 cursor-not-allowed" title="WhatsApp (sem telefone)"><MessageCircle className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={m.open}
        onClose={() => {
          setEditing(null);
          m.close();
        }}
        title={editing ? "Editar cliente" : "Novo cliente"}
        subtitle="Cadastro completo com consentimento LGPD."
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome" span={2}>
            <Input ref={nomeRef} defaultValue={editing?.nome ?? ""} placeholder="Nome completo ou razão social" />
          </Field>
          <Field label="Tipo">
            <Select
              value={tipoSelecionado}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setTipoSelecionado(e.target.value as "PF" | "PJ");
                setDocValue("");
              }}
            >
              <option value="PF">PF — Pessoa Física</option>
              <option value="PJ">PJ — Pessoa Jurídica</option>
            </Select>
          </Field>
          <Field label={tipoSelecionado === "PF" ? "CPF" : "CNPJ"}>
            <Input
              value={docValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDocValue(applyDocMask(e.target.value, tipoSelecionado))
              }
              placeholder={tipoSelecionado === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
            />
          </Field>
          <Field label="Telefone / WhatsApp"><Input ref={telRef} defaultValue={editing?.telefone === "—" ? "" : editing?.telefone ?? ""} placeholder="(11) 9 0000-0000" /></Field>
          <Field label="Email"><Input ref={emailRef} defaultValue="" placeholder="email@exemplo.com" /></Field>
          <Field label="Endereço" span={2}><Input placeholder="Rua, número, bairro" /></Field>
          <Field label="Cidade"><Input ref={cidadeRef} defaultValue={editing?.cidade === "—" ? "" : editing?.cidade ?? ""} placeholder="São Paulo/SP" /></Field>
          <Field label="UF"><Input placeholder="SP" /></Field>
          <Field label="Tags" span={2}><Input ref={tagsRef} defaultValue={editing?.tags?.join(", ") ?? ""} placeholder="VIP, Recorrente, B2B…" /></Field>
          <Field label="Observações" span={2}><Textarea rows={3} placeholder="Notas internas" /></Field>
          <Field label="Status">
            <Select ref={statusRef} defaultValue={editing?.status ?? "Ativo"}>
              <option>Ativo</option>
              <option>Inativo</option>
            </Select>
          </Field>
          <Field label="Consentimento LGPD" span={2}>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
              <input type="checkbox" /> Cliente autoriza uso dos dados conforme política de privacidade.
            </label>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(null);
              m.close();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const tagsRaw = (tagsRef.current?.value ?? "").trim();
                  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
                  const payload = {
                    nome: (nomeRef.current?.value ?? "").trim(),
                    tipo: tipoSelecionado,
                    documento: docValue.trim(),
                    telefone: (telRef.current?.value ?? "").trim(),
                    email: (emailRef.current?.value ?? "").trim(),
                    cidade: (cidadeRef.current?.value ?? "").trim(),
                    tags,
                    active: (statusRef.current?.value ?? "Ativo") !== "Inativo",
                  } as const;

                  if (editing) {
                    await updateCliente(storeId, editing.id, {
                      nome: payload.nome,
                      tipo: payload.tipo,
                      documento: payload.documento,
                      telefone: payload.telefone,
                      email: payload.email,
                      cidade: payload.cidade,
                      tags: payload.tags,
                      active: payload.active,
                    });
                  } else {
                    await createCliente(storeId, payload);
                  }
                  await refresh();
                  setEditing(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar cliente");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── PRODUTOS ───── */
function ProdutosPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [editing, setEditing] = useState<ProdutoDTO | null>(null);
  const [deleting, setDeleting] = useState<ProdutoDTO | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteProdutoResult | null>(null);
  const [rows, setRows] = useState<ProdutoDTO[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  // loadingRows: bloqueia apenas a tabela; loadingAlerts: atualiza os cards silenciosamente
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [alerts, setAlerts] = useState<Array<{ l: string; n: number; t: "warning" | "danger" | "success" }>>([
    { l: "Estoque baixo", n: 0, t: "warning" },
    { l: "Sem preço", n: 0, t: "danger" },
    { l: "Sem fornecedor", n: 0, t: "danger" },
    { l: "Margem baixa", n: 0, t: "warning" },
    { l: "Prontos p/ Marketplace", n: 0, t: "success" },
  ]);

  // Carrega só a lista — rápido, desbloqueia tabela e busca imediatamente
  const refreshRows = useMemo(
    () => async () => {
      setLoadingRows(true);
      setErr(null);
      try {
        const data = await listProdutos(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar produtos");
      } finally {
        setLoadingRows(false);
      }
    },
    [storeId]
  );

  // Carrega stats/alertas — pesado (>15 queries), não bloqueia tabela nem busca
  const refreshAlerts = useMemo(
    () => async () => {
      setLoadingAlerts(true);
      try {
        const dash = await getCadastrosDashboardStats(storeId);
        setAlerts([
          { l: "Estoque baixo", n: dash.produtoAlerts.estoqueBaixo, t: "warning" },
          { l: "Sem preço", n: dash.produtoAlerts.semPreco, t: "danger" },
          { l: "Sem fornecedor", n: dash.produtoAlerts.semFornecedor, t: "danger" },
          { l: "Margem baixa", n: dash.produtoAlerts.margemBaixa, t: "warning" },
          { l: "Prontos p/ Marketplace", n: dash.produtoAlerts.prontosMarketplace, t: "success" },
        ]);
      } catch {
        // alertas são não-críticos: mantém valores anteriores sem propagar erro
      } finally {
        setLoadingAlerts(false);
      }
    },
    [storeId]
  );

  // refresh completo: usado pelo ProductAIModal após salvar um produto
  const refresh = useMemo(
    () => async () => {
      void refreshAlerts();
      await refreshRows();
    },
    [refreshRows, refreshAlerts]
  );

  // Dispara os dois carregamentos em paralelo na montagem do painel
  useEffect(() => {
    void refreshRows();
    void refreshAlerts();
  }, [refreshRows, refreshAlerts]);

  const visibleRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const blob = [p.nome, p.sku, p.barras, p.categoria, p.marca, p.fornecedor].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, filterQuery]);

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-5">
        {alerts.map((a) => (
          <Card key={a.l} className="p-4">
            <div className="text-xs text-muted-foreground">{a.l}</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-2xl font-bold text-foreground">
                {loadingAlerts ? <span className="text-muted-foreground text-base">—</span> : a.n}
              </div>
              <Badge tone={a.t}>{a.t === "success" ? "OK" : "Revisar"}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Toolbar
        count={visibleRows.length}
        label="produtos"
        onNew={m.openIt}
        filterQuery={filterQuery}
        onFilterQueryChange={setFilterQuery}
      />
      {loadingRows && <div className="mb-3 text-sm text-muted-foreground">Carregando produtos…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      {!loadingRows && !err && rows.length === 0 && (
        <Card className="mb-4 border-dashed border-2 border-border/80 bg-gradient-to-br from-card to-muted/20 p-10 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Package className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold text-foreground">Nenhum produto nesta unidade</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o primeiro item ou importe o catálogo. Os dados vêm do banco (Prisma) e alimentam estoque, PDV e OS.
          </p>
          <button
            type="button"
            onClick={m.openIt}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo produto
          </button>
        </Card>
      )}
      {!loadingRows && !err && rows.length > 0 && visibleRows.length === 0 && (
        <Card className="mb-4 border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Nenhum produto corresponde à busca. Limpe o filtro ou ajuste os termos.
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Produto", "SKU", "Categoria", "Estoque", "Preço", "Margem", "Qualidade", "Status", "Ações"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map((p) => {
                const score = catalogQualityScore(p);
                const iaStub = p.metadata && typeof p.metadata.cadastroIa === "object";
                return (
                  <tr key={p.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.marca} • {p.fornecedor}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{p.sku}</td>
                    <td className="px-4 py-3"><Badge>{p.categoria}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={p.estoque === 0 ? "danger" : p.estoque < 6 ? "warning" : "success"}>{p.estoque}</Badge></td>
                    <td className="px-4 py-3 font-medium text-foreground">{p.preco ? `R$ ${p.preco}` : <span className="text-destructive">—</span>}</td>
                    <td className="px-4 py-3 text-foreground">{p.margem ? `${p.margem.toFixed(1)}%` : "—"}</td>
                    <td className="px-4 py-3"><QualityScore value={score} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {p.status === "Incompleto" && <Badge tone="warning">Incompleto</Badge>}
                        {iaStub && (
                          <Badge tone="primary">
                            <Sparkles className="mr-1 inline h-3 w-3" /> pipeline
                          </Badge>
                        )}
                        <button
                          disabled={saving}
                          onClick={() => {
                            startSaving(async () => {
                              try {
                                await upsertProduto(storeId, {
                                  id: p.id,
                                  nome: p.nome,
                                  sku: p.sku === "—" ? "" : p.sku,
                                  barras: p.barras,
                                  categoria: p.categoria === "—" ? "" : p.categoria,
                                  marca: p.marca === "—" ? "" : p.marca,
                                  fornecedor: p.fornecedor === "—" ? "" : p.fornecedor,
                                  estoque: p.estoque,
                                  custo: p.custo,
                                  preco: p.preco,
                                  garantia: p.garantia,
                                  active: p.status !== "Ativo",
                                });
                                await refresh();
                              } catch (e) {
                                window.alert(e instanceof Error ? e.message : "Não foi possível atualizar status");
                              }
                            });
                          }}
                          className="inline-flex"
                          title="Ativar/Inativar"
                        >
                        <Badge tone={p.status === "Ativo" ? "success" : "warning"}>{p.status === "Incompleto" ? "Rascunho" : p.status}</Badge>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground cursor-not-allowed" title="Fase 2" type="button" disabled>
                          Anúncio
                        </button>
                        <button className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground cursor-not-allowed" title="Fase 2" type="button" disabled>
                          Publicar
                        </button>
                        <button
                          className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
                          title="Editar ficha"
                          type="button"
                          onClick={() => {
                            setEditing(p);
                            m.openIt();
                          }}
                        >
                          <Edit3 className="h-3 w-3" /> Editar
                        </button>
                        <button
                          className="flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/25"
                          title="Excluir produto"
                          type="button"
                          onClick={() => {
                            setDeleting(p);
                            setDeleteResult(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductAIModal
        open={m.open}
        onClose={() => {
          setEditing(null);
          m.close();
        }}
        storeId={storeId}
        onSaved={refresh}
        productId={editing?.id}
        initial={
          editing
            ? {
                nome: editing.nome,
                sku: editing.sku === "—" ? "" : editing.sku,
                barras: editing.barras,
                categoria: editing.categoria === "—" ? "" : editing.categoria,
                marca: editing.marca === "—" ? "" : editing.marca,
                fornecedor: editing.fornecedor === "—" ? "" : editing.fornecedor,
                estoque: editing.estoque,
                custo: editing.custo,
                preco: editing.preco,
                garantia: editing.garantia,
              }
            : undefined
        }
      />

      {deleting && (
        <Modal
          open={true}
          onClose={() => {
            if (saving) return;
            setDeleting(null);
            setDeleteResult(null);
          }}
          title="Excluir produto?"
          subtitle="Ação destrutiva — não pode ser desfeita"
          size="md"
        >
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Produto</div>
              <div className="mt-1 line-clamp-3 font-medium text-foreground">{deleting.nome}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="block text-[10px] uppercase text-muted-foreground">SKU</span>
                  <span className="text-foreground">{deleting.sku && deleting.sku !== "—" ? deleting.sku : "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-muted-foreground">Estoque</span>
                  <span className="text-foreground">{deleting.estoque}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-muted-foreground">Preço</span>
                  <span className="text-foreground">{deleting.preco ? `R$ ${deleting.preco}` : "—"}</span>
                </div>
              </div>
            </div>

            {deleting.estoque > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                Atenção: produto com estoque {deleting.estoque}. A exclusão remove o cadastro e o saldo registrado.
                Considere inativar pelo botão de status, na coluna Status.
              </div>
            )}

            {deleteResult && !deleteResult.ok && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <div className="font-medium">{deleteResult.reason}</div>
                {deleteResult.vinculos && (
                  <div className="mt-1 text-[11px]">
                    Vínculos encontrados: {deleteResult.vinculos.osItens} item(ns) de OS ·{" "}
                    {deleteResult.vinculos.listings} anúncio(s) · {deleteResult.vinculos.links} integração(ões) marketplace.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                onClick={() => {
                  setDeleting(null);
                  setDeleteResult(null);
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                disabled={saving || (deleteResult !== null && !deleteResult.ok)}
                onClick={() => {
                  if (!deleting) return;
                  startSaving(async () => {
                    try {
                      const res = await deleteProduto(storeId, deleting.id);
                      setDeleteResult(res);
                      if (res.ok) {
                        await refreshRows();
                        setDeleting(null);
                        setDeleteResult(null);
                      }
                    } catch (e) {
                      setDeleteResult({
                        ok: false,
                        reason: e instanceof Error ? e.message : "Falha ao excluir produto",
                      });
                    }
                  });
                }}
              >
                {saving ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───── SERVIÇOS ───── */
function ServicosPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [editing, setEditing] = useState<ServicoDTO | null>(null);
  const [rows, setRows] = useState<ServicoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [servCategorias, setServCategorias] = useState<string[]>([]);

  useEffect(() => {
    listCategorias(storeId).then((cats) =>
      setServCategorias(cats.filter((c) => c.active && c.type === "servico").map((c) => c.name))
    ).catch(() => {});
  }, [storeId]);
  const [saving, startSaving] = useTransition();
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const catRef = useRef<HTMLSelectElement | null>(null);
  const tempoRef = useRef<HTMLInputElement | null>(null);
  const custoRef = useRef<HTMLInputElement | null>(null);
  const precoRef = useRef<HTMLInputElement | null>(null);
  const garantiaRef = useRef<HTMLInputElement | null>(null);
  const termoRef = useRef<HTMLTextAreaElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listServicos(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar serviços");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="w-full min-w-0">
      <Toolbar count={rows.length} label="serviços" onNew={m.openIt} />
      {loading && <div className="mb-3 text-sm text-muted-foreground">Carregando serviços…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((s) => (
          <Card
            key={s.id}
            className="p-5"
            onClick={() => {
              setEditing(s);
              m.openIt();
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-semibold text-foreground">{s.nome}</div>
                <Badge tone="primary">{s.categoria}</Badge>
              </div>
              <button
                disabled={saving}
                onClick={() => {
                  startSaving(async () => {
                    try {
                      await upsertServico(storeId, {
                        id: s.id,
                        nome: s.nome,
                        categoria: s.categoria === "—" ? "" : s.categoria,
                        tempo: s.tempo === "—" ? "" : s.tempo,
                        custo: s.custo,
                        preco: s.preco,
                        garantia: s.garantia,
                        termo: s.termo,
                        active: s.status !== "Ativo",
                      });
                      await refresh();
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : "Não foi possível atualizar status");
                    }
                  });
                }}
                className="inline-flex"
                title="Ativar/Inativar"
              >
              <Badge tone={s.status === "Ativo" ? "success" : "warning"}>{s.status}</Badge>
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Tempo médio" value={s.tempo} />
              <Stat label="Garantia" value={`${s.garantia} dias`} />
              <Stat label="Custo" value={`R$ ${s.custo}`} />
              <Stat label="Preço" value={s.preco ? `R$ ${s.preco}` : "—"} />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs">
              <div className="text-muted-foreground">Margem</div>
              <div className="font-semibold text-primary">{s.margem ? `${s.margem.toFixed(1)}%` : "—"}</div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone="info">Marketing IA</Badge>
              <Badge>OS</Badge>
              <Badge>PDV</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={m.open} onClose={m.close} title="Novo serviço" subtitle="Configuração completa para OS e Marketing IA." size="lg">
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome" span={2}><Input ref={nomeRef} defaultValue={editing?.nome ?? ""} placeholder="Troca de tela" /></Field>
          <Field label="Categoria"><Select ref={catRef} defaultValue={editing?.categoria ?? ""}>{servCategorias.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Tempo médio"><Input ref={tempoRef} defaultValue={editing?.tempo === "—" ? "" : editing?.tempo ?? ""} placeholder="45 min" /></Field>
          <Field label="Custo interno"><Input ref={custoRef} defaultValue={editing ? String(editing.custo) : ""} placeholder="60" /></Field>
          <Field label="Preço de venda"><Input ref={precoRef} defaultValue={editing ? String(editing.preco) : ""} placeholder="280" /></Field>
          <Field label="Garantia (dias)"><Input ref={garantiaRef} defaultValue={editing ? String(editing.garantia) : ""} placeholder="90" /></Field>
          <Field label="Peças sugeridas"><Input placeholder="Tela compatível…" /></Field>
          <Field label="Checklist padrão" span={2}><Textarea rows={3} placeholder="• Testar touch&#10;• Testar Face ID" /></Field>
          <Field label="Termo de garantia" span={2}><Textarea ref={termoRef} defaultValue={editing?.termo ?? ""} rows={3} /></Field>
          <Field label="Status"><Select ref={statusRef} defaultValue={editing?.status ?? "Ativo"}><option>Ativo</option><option>Inativo</option></Select></Field>
          <Field label="Marketing IA" span={2}>
            <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
              <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Usar em conteúdo automático</label>
              <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Pode gerar post antes/depois</label>
              <Input placeholder="Template de legenda" />
              <Input placeholder="Hashtags padrão" />
            </div>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={m.close} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const custo = Number(String(custoRef.current?.value ?? "").replace(",", "."));
                  const preco = Number(String(precoRef.current?.value ?? "").replace(",", "."));
                  const garantia = Number(String(garantiaRef.current?.value ?? "").replace(",", "."));
                  await upsertServico(storeId, {
                    id: editing?.id,
                    nome: (nomeRef.current?.value ?? "").trim(),
                    categoria: (catRef.current?.value ?? "").trim(),
                    tempo: (tempoRef.current?.value ?? "").trim(),
                    custo: Number.isFinite(custo) ? custo : 0,
                    preco: Number.isFinite(preco) ? preco : 0,
                    garantia: Number.isFinite(garantia) ? garantia : 0,
                    termo: (termoRef.current?.value ?? "").trim(),
                    active: (statusRef.current?.value ?? "Ativo") !== "Inativo",
                  });
                  await refresh();
                  setEditing(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar serviço");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar serviço"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

/* ───── FORNECEDORES ───── */
function FornecedoresPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [rows, setRows] = useState<FornecedorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [editing, setEditing] = useState<FornecedorDTO | null>(null);

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const razaoRef = useRef<HTMLInputElement | null>(null);
  const cnpjRef = useRef<HTMLInputElement | null>(null);
  const contatoRef = useRef<HTMLInputElement | null>(null);
  const whatsappRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const enderecoRef = useRef<HTMLInputElement | null>(null);
  const produtosRef = useRef<HTMLInputElement | null>(null);
  const prazoRef = useRef<HTMLInputElement | null>(null);
  const pagamentoRef = useRef<HTMLInputElement | null>(null);
  const obsRef = useRef<HTMLTextAreaElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listFornecedores(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar fornecedores");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="w-full min-w-0">
      <Toolbar
        count={rows.length}
        label="fornecedores"
        onNew={() => {
          setEditing(null);
          m.openIt();
        }}
      />
      {loading && <div className="mb-3 text-sm text-muted-foreground">Carregando fornecedores…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      <Card className="overflow-hidden">
        <div className="w-full min-w-0 max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{["Fornecedor", "CNPJ", "Contato", "Categoria", "Prazo", "Pagamento", "Última compra", "Status"].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => {
                    setEditing(f);
                    m.openIt();
                  }}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{f.nome}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.cnpj}</td>
                  <td className="px-4 py-3 text-foreground">
                    <div>{f.whatsapp !== "—" ? f.whatsapp : f.contato}</div>
                    <div className="text-xs text-muted-foreground">{f.email}</div>
                  </td>
                  <td className="px-4 py-3"><Badge>{"—"}</Badge></td>
                  <td className="px-4 py-3 text-foreground">{f.prazo}</td>
                  <td className="px-4 py-3 text-foreground">{f.pagamento}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.ultima}</td>
                  <td className="px-4 py-3">
                    <button
                      disabled={saving}
                      className="inline-flex"
                      title="Ativar/Inativar"
                      onClick={(e) => {
                        e.stopPropagation();
                        startSaving(async () => {
                          try {
                            await upsertFornecedor(storeId, {
                              id: f.id,
                              nome: f.nome,
                              razaoSocial: f.razaoSocial,
                              cnpj: f.cnpj === "—" ? "" : f.cnpj,
                              contato: f.contato === "—" ? "" : f.contato,
                              whatsapp: f.whatsapp === "—" ? "" : f.whatsapp,
                              email: f.email === "—" ? "" : f.email,
                              endereco: f.endereco,
                              produtos: f.produtos,
                              prazo: f.prazo === "—" ? "" : f.prazo,
                              pagamento: f.pagamento === "—" ? "" : f.pagamento,
                              observacoes: f.observacoes,
                              active: f.status !== "Ativo",
                            });
                            await refresh();
                          } catch (e2) {
                            window.alert(e2 instanceof Error ? e2.message : "Não foi possível atualizar status");
                          }
                        });
                      }}
                    >
                      <Badge tone={f.status === "Ativo" ? "success" : "default"}>{f.status}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={m.open}
        onClose={() => {
          setEditing(null);
          m.close();
        }}
        title={editing ? "Editar fornecedor" : "Novo fornecedor"}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome fantasia"><Input ref={nomeRef} defaultValue={editing?.nome ?? ""} /></Field>
          <Field label="Razão social"><Input ref={razaoRef} defaultValue={editing?.razaoSocial ?? ""} /></Field>
          <Field label="CNPJ"><Input ref={cnpjRef} defaultValue={editing?.cnpj === "—" ? "" : editing?.cnpj ?? ""} placeholder="00.000.000/0000-00" /></Field>
          <Field label="Contato principal"><Input ref={contatoRef} defaultValue={editing?.contato === "—" ? "" : editing?.contato ?? ""} /></Field>
          <Field label="WhatsApp"><Input ref={whatsappRef} defaultValue={editing?.whatsapp === "—" ? "" : editing?.whatsapp ?? ""} /></Field>
          <Field label="Email"><Input ref={emailRef} defaultValue={editing?.email === "—" ? "" : editing?.email ?? ""} /></Field>
          <Field label="Endereço" span={2}><Input ref={enderecoRef} defaultValue={editing?.endereco ?? ""} /></Field>
          <Field label="Produtos fornecidos" span={2}><Input ref={produtosRef} defaultValue={editing?.produtos ?? ""} placeholder="Telas, baterias…" /></Field>
          <Field label="Prazo médio"><Input ref={prazoRef} defaultValue={editing?.prazo === "—" ? "" : editing?.prazo ?? ""} placeholder="5 dias" /></Field>
          <Field label="Condição de pagamento"><Input ref={pagamentoRef} defaultValue={editing?.pagamento === "—" ? "" : editing?.pagamento ?? ""} placeholder="30/60" /></Field>
          <Field label="Status"><Select ref={statusRef} defaultValue={editing?.status ?? "Ativo"}><option>Ativo</option><option>Inativo</option></Select></Field>
          <Field label="Observações" span={2}><Textarea ref={obsRef} defaultValue={editing?.observacoes ?? ""} rows={3} /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(null);
              m.close();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  await upsertFornecedor(storeId, {
                    id: editing?.id,
                    nome: (nomeRef.current?.value ?? "").trim(),
                    razaoSocial: (razaoRef.current?.value ?? "").trim(),
                    cnpj: (cnpjRef.current?.value ?? "").trim(),
                    contato: (contatoRef.current?.value ?? "").trim(),
                    whatsapp: (whatsappRef.current?.value ?? "").trim(),
                    email: (emailRef.current?.value ?? "").trim(),
                    endereco: (enderecoRef.current?.value ?? "").trim(),
                    produtos: (produtosRef.current?.value ?? "").trim(),
                    prazo: (prazoRef.current?.value ?? "").trim(),
                    pagamento: (pagamentoRef.current?.value ?? "").trim(),
                    observacoes: (obsRef.current?.value ?? "").trim(),
                    active: (statusRef.current?.value ?? "Ativo") !== "Inativo",
                  });
                  await refresh();
                  setEditing(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar fornecedor");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar fornecedor"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── TÉCNICOS ───── */
function TecnicosPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [rows, setRows] = useState<TecnicoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [editing, setEditing] = useState<TecnicoDTO | null>(null);

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const telRef = useRef<HTMLInputElement | null>(null);
  const cargoRef = useRef<HTMLInputElement | null>(null);
  const especialidadeRef = useRef<HTMLInputElement | null>(null);
  const comissaoRef = useRef<HTMLInputElement | null>(null);
  const permissaoRef = useRef<HTMLSelectElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listTecnicos(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar técnicos");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="w-full min-w-0">
      <Toolbar count={rows.length} label="técnicos / funcionários" onNew={m.openIt} />
      {loading && <div className="mb-3 text-sm text-muted-foreground">Carregando técnicos…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <Card
            key={t.id}
            className="p-5"
            onClick={() => {
              setEditing(t);
              m.openIt();
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-base font-semibold">
                {t.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">{t.name}</div>
                <div className="truncate text-xs text-muted-foreground">{t.role || "—"}</div>
              </div>
              <button
                disabled={saving}
                className="inline-flex"
                title="Ativar/Inativar"
                onClick={(e) => {
                  e.stopPropagation();
                  startSaving(async () => {
                    try {
                      await upsertTecnico(storeId, {
                        id: t.id,
                        name: t.name,
                        email: t.email,
                        phone: t.phone,
                        role: t.role,
                        specialty: t.specialty,
                        commissionPercent: t.commissionPercent,
                        active: !t.active,
                      });
                      await refresh();
                    } catch (e2) {
                      window.alert(e2 instanceof Error ? e2.message : "Não foi possível atualizar status");
                    }
                  });
                }}
              >
                <Badge tone={t.active ? "success" : "default"}>{t.active ? "Ativo" : "Inativo"}</Badge>
              </button>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">Especialidade</div>
            <div className="text-sm text-foreground">{t.specialty || "—"}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Abertas</div>
                <div className="text-sm font-bold text-foreground">0</div>
              </div>
              <div className="rounded-lg bg-surface py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Concluídas</div>
                <div className="text-sm font-bold text-foreground">0</div>
              </div>
              <div className="rounded-lg bg-surface py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Tempo</div>
                <div className="text-sm font-bold text-foreground">—</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <Badge tone="primary">{t.role || "Técnico"}</Badge>
              <span className="text-muted-foreground">Comissão {Number(t.commissionPercent || 0)}%</span>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={m.open}
        onClose={() => {
          setEditing(null);
          m.close();
        }}
        title={editing ? "Editar técnico / funcionário" : "Novo técnico / funcionário"}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome" span={2}><Input ref={nomeRef} defaultValue={editing?.name ?? ""} /></Field>
          <Field label="Email"><Input ref={emailRef} defaultValue={editing?.email ?? ""} /></Field>
          <Field label="Telefone"><Input ref={telRef} defaultValue={editing?.phone ?? ""} /></Field>
          <Field label="Cargo"><Input ref={cargoRef} defaultValue={editing?.role ?? ""} placeholder="Técnico Sênior" /></Field>
          <Field label="Especialidades"><Input ref={especialidadeRef} defaultValue={editing?.specialty ?? ""} placeholder="Microsoldagem, Telas…" /></Field>
          <Field label="Comissão (%)"><Input ref={comissaoRef} defaultValue={editing ? String(editing.commissionPercent) : ""} placeholder="10" /></Field>
          <Field label="Permissão">
            <Select ref={permissaoRef} defaultValue={editing?.role || "Técnico"}>
              <option>Técnico</option>
              <option>Atendente</option>
              <option>Caixa</option>
              <option>Gerente</option>
              <option>Administrador</option>
            </Select>
          </Field>
          <Field label="Status" span={2}>
            <Select ref={statusRef} defaultValue={editing?.active === false ? "Inativo" : "Ativo"}>
              <option>Ativo</option>
              <option>Inativo</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(null);
              m.close();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const commission = Number(String(comissaoRef.current?.value ?? "").replace(",", "."));
                  const role =
                    (cargoRef.current?.value ?? "").trim() ||
                    (permissaoRef.current?.value ?? "").trim();

                  await upsertTecnico(storeId, {
                    id: editing?.id,
                    name: (nomeRef.current?.value ?? "").trim(),
                    email: (emailRef.current?.value ?? "").trim(),
                    phone: (telRef.current?.value ?? "").trim(),
                    role,
                    specialty: (especialidadeRef.current?.value ?? "").trim(),
                    commissionPercent: Number.isFinite(commission) ? commission : 0,
                    active: (statusRef.current?.value ?? "Ativo") !== "Inativo",
                  });
                  await refresh();
                  setEditing(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── EQUIPAMENTOS ───── */
function EquipamentosPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [rows, setRows] = useState<EquipamentoModeloDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [editing, setEditing] = useState<EquipamentoModeloDTO | null>(null);

  const nameRef = useRef<HTMLInputElement | null>(null);
  const brandRef = useRef<HTMLInputElement | null>(null);
  const typeRef = useRef<HTMLInputElement | null>(null);
  const yearRef = useRef<HTMLInputElement | null>(null);
  const tempoRef = useRef<HTMLInputElement | null>(null);
  const partsRef = useRef<HTMLTextAreaElement | null>(null);
  const defectsRef = useRef<HTMLTextAreaElement | null>(null);
  const checklistRef = useRef<HTMLTextAreaElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await listEquipamentosModelos(storeId);
        setRows(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar equipamentos");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="w-full min-w-0">
      <Toolbar
        count={rows.length}
        label="equipamentos / modelos"
        onNew={() => {
          setEditing(null);
          m.openIt();
        }}
      />
      {loading && <div className="mb-3 text-sm text-muted-foreground">Carregando equipamentos…</div>}
      {err && <div className="mb-3 text-sm text-destructive">{err}</div>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((e) => (
          <Card
            key={e.id}
            className="overflow-hidden"
            onClick={() => {
              setEditing(e);
              m.openIt();
            }}
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface p-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">{e.name}</div>
                <div className="truncate text-xs text-muted-foreground">{e.brand} • {e.type} • {e.year || "—"}</div>
              </div>
              <button
                disabled={saving}
                className="inline-flex"
                title="Ativar/Inativar"
                onClick={(ev) => {
                  ev.stopPropagation();
                  startSaving(async () => {
                    try {
                      await upsertEquipamentoModelo(storeId, {
                        id: e.id,
                        name: e.name,
                        brand: e.brand,
                        type: e.type,
                        year: e.year,
                        averageRepairTime: e.averageRepairTime,
                        compatibleParts: e.compatibleParts,
                        commonDefects: e.commonDefects,
                        recommendedChecklist: e.recommendedChecklist,
                        active: !e.active,
                      });
                      await refresh();
                    } catch (e2) {
                      window.alert(e2 instanceof Error ? e2.message : "Não foi possível atualizar status");
                    }
                  });
                }}
              >
                <Badge tone={e.active ? "info" : "default"}>{e.active ? (e.averageRepairTime || "—") : "Inativo"}</Badge>
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Peças compatíveis</div>
                <div className="mt-1 flex flex-wrap gap-1">{(e.compatibleParts || []).map((p) => <Badge key={p}>{p}</Badge>)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Defeitos comuns</div>
                <div className="mt-1 flex flex-wrap gap-1">{(e.commonDefects || []).map((p) => <Badge key={p} tone="warning">{p}</Badge>)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Checklist recomendado</div>
                <div className="mt-1 flex flex-wrap gap-1">{(e.recommendedChecklist || []).map((p) => <Badge key={p} tone="success">{p}</Badge>)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone="primary"><Sparkles className="mr-1 inline h-3 w-3" />Base IA</Badge>
                <Badge tone="info">Diagnóstico</Badge>
                <Badge tone="success">Marketing IA</Badge>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary/15 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/25">
                  <Sparkles className="h-3 w-3" /> Usar no diagnóstico IA
                </button>
                <button className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground hover:border-primary">
                  Gerar conteúdo Marketing
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={m.open}
        onClose={() => {
          setEditing(null);
          m.close();
        }}
        title={editing ? "Editar equipamento / modelo" : "Novo equipamento / modelo"}
        subtitle="Cadastro de modelos e base de diagnóstico."
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome / Modelo" span={2}><Input ref={nameRef} defaultValue={editing?.name ?? ""} placeholder="iPhone 11" /></Field>
          <Field label="Marca"><Input ref={brandRef} defaultValue={editing?.brand ?? ""} placeholder="Apple" /></Field>
          <Field label="Tipo"><Input ref={typeRef} defaultValue={editing?.type ?? ""} placeholder="Smartphone" /></Field>
          <Field label="Ano"><Input ref={yearRef} defaultValue={editing ? String(editing.year || "") : ""} placeholder="2019" /></Field>
          <Field label="Tempo médio"><Input ref={tempoRef} defaultValue={editing?.averageRepairTime ?? ""} placeholder="1h" /></Field>
          <Field label="Status"><Select ref={statusRef} defaultValue={editing?.active === false ? "Inativo" : "Ativo"}><option>Ativo</option><option>Inativo</option></Select></Field>
          <Field label="Peças compatíveis" span={2}><Textarea ref={partsRef} rows={3} defaultValue={(editing?.compatibleParts ?? []).join(", ")} placeholder="Tela, Bateria, Conector..." /></Field>
          <Field label="Defeitos comuns" span={2}><Textarea ref={defectsRef} rows={3} defaultValue={(editing?.commonDefects ?? []).join(", ")} placeholder="Não carrega, Tela quebrada..." /></Field>
          <Field label="Checklist recomendado" span={2}><Textarea ref={checklistRef} rows={3} defaultValue={(editing?.recommendedChecklist ?? []).join(", ")} placeholder="Testar touch, Testar carga..." /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(null);
              m.close();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const year = Number(String(yearRef.current?.value ?? "").replace(/[^\d]/g, ""));
                  const parts = (partsRef.current?.value ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const defects = (defectsRef.current?.value ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const checklist = (checklistRef.current?.value ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);

                  await upsertEquipamentoModelo(storeId, {
                    id: editing?.id,
                    name: (nameRef.current?.value ?? "").trim(),
                    brand: (brandRef.current?.value ?? "").trim(),
                    type: (typeRef.current?.value ?? "").trim(),
                    year: Number.isFinite(year) ? year : 0,
                    averageRepairTime: (tempoRef.current?.value ?? "").trim(),
                    compatibleParts: parts,
                    commonDefects: defects,
                    recommendedChecklist: checklist,
                    active: (statusRef.current?.value ?? "Ativo") !== "Inativo",
                  });
                  await refresh();
                  setEditing(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── CATEGORIAS ───── */
function CategoriasPanel({ storeId }: { storeId: string }) {
  const m = useToggle();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [cats, setCats] = useState<CategoriaCadastroDTO[]>([]);
  const [brands, setBrands] = useState<MarcaCadastroDTO[]>([]);
  const [mode, setMode] = useState<"categoria" | "marca">("categoria");
  const [catType, setCatType] = useState<"produto" | "servico" | "equipamento" | "geral">("produto");
  const [editingId, setEditingId] = useState<string | null>(null);

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const typeRef = useRef<HTMLSelectElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);

  const editingCategoria = useMemo(
    () => (editingId ? cats.find((c) => c.id === editingId) ?? null : null),
    [cats, editingId]
  );
  const editingMarca = useMemo(
    () => (editingId ? brands.find((b) => b.id === editingId) ?? null : null),
    [brands, editingId]
  );

  const modalNameDefault = mode === "marca" ? (editingMarca?.name ?? "") : (editingCategoria?.name ?? "");
  const modalTypeDefault = editingCategoria?.type ?? catType;
  const modalStatusDefault =
    mode === "marca"
      ? (editingMarca?.active === false ? "Inativo" : "Ativo")
      : (editingCategoria?.active === false ? "Inativo" : "Ativo");

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setErr(null);
      try {
        const [c, b] = await Promise.all([listCategorias(storeId), listMarcas(storeId)]);
        setCats(c);
        setBrands(b);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao carregar categorias/marcas");
      } finally {
        setLoading(false);
      }
    },
    [storeId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const itemsFor = (kind: "produto" | "servico" | "equipamento" | "geral") =>
    cats.filter((c) => c.active && c.type === kind).map((c) => c.name);

  const groups = [
    { l: "Categorias de produtos", items: itemsFor("produto"), t: "primary" as const, kind: "categoria" as const, catType: "produto" as const },
    { l: "Categorias de serviços", items: itemsFor("servico"), t: "info" as const, kind: "categoria" as const, catType: "servico" as const },
    { l: "Marcas", items: brands.filter((b) => b.active).map((b) => b.name), t: "success" as const, kind: "marca" as const, catType: "geral" as const },
    { l: "Linhas de equipamentos", items: itemsFor("equipamento"), t: "warning" as const, kind: "categoria" as const, catType: "equipamento" as const },
    { l: "Tags globais", items: itemsFor("geral"), t: "default" as const, kind: "categoria" as const, catType: "geral" as const },
  ];
  return (
    <div className="grid w-full min-w-0 gap-6 md:grid-cols-2">
      {loading && <div className="text-sm text-muted-foreground">Carregando categorias…</div>}
      {err && <div className="text-sm text-destructive">{err}</div>}
      {groups.map((g) => (
        <Card key={g.l} className="p-6">
          <SectionTitle
            title={g.l}
            action={
              <button
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                onClick={() => {
                  setMode(g.kind);
                  setCatType(g.catType);
                  setEditingId(null);
                  m.openIt();
                }}
              >
                <Plus className="h-3 w-3" /> Novo
              </button>
            }
          />
          <div className="flex flex-wrap gap-2">
            {g.items.map((i) => (
              <span
                key={i}
                className="group flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                onClick={() => {
                  if (g.kind === "marca") {
                    const b = brands.find((x) => x.name === i);
                    if (!b) return;
                    setMode("marca");
                    setEditingId(b.id);
                    setCatType("geral");
                    m.openIt();
                    return;
                  }
                  const c = cats.find((x) => x.name === i && x.type === g.catType);
                  if (!c) return;
                  setMode("categoria");
                  setEditingId(c.id);
                  setCatType(g.catType);
                  m.openIt();
                }}
              >
                <Badge tone={g.t}>•</Badge>
                {i}
                <button
                  className="ml-1 text-muted-foreground opacity-0 group-hover:opacity-100"
                  title="Inativar"
                  onClick={(e) => {
                    e.stopPropagation();
                    startSaving(async () => {
                      try {
                        if (g.kind === "marca") {
                          const b = brands.find((x) => x.name === i);
                          if (!b) return;
                          await upsertMarca(storeId, { id: b.id, name: b.name, type: b.type, active: false });
                        } else {
                          const c = cats.find((x) => x.name === i && x.type === g.catType);
                          if (!c) return;
                          await upsertCategoria(storeId, { id: c.id, name: c.name, type: c.type, active: false });
                        }
                        await refresh();
                      } catch (e2) {
                        window.alert(e2 instanceof Error ? e2.message : "Não foi possível inativar");
                      }
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </Card>
      ))}

      <Modal
        open={m.open}
        onClose={() => {
          setEditingId(null);
          m.close();
        }}
        title={mode === "marca" ? (editingId ? "Editar marca" : "Nova marca") : (editingId ? "Editar categoria" : "Nova categoria")}
        size="md"
      >
        <div className="grid grid-cols-2 gap-4" key={m.open ? "open" : "closed"}>
          <Field label="Nome" span={2}>
            <Input ref={nomeRef} defaultValue={modalNameDefault} />
          </Field>
          {mode === "categoria" && (
            <Field label="Tipo" span={2}>
              <Select ref={typeRef} defaultValue={modalTypeDefault}>
                <option value="produto">produto</option>
                <option value="servico">servico</option>
                <option value="equipamento">equipamento</option>
                <option value="geral">geral</option>
              </Select>
            </Field>
          )}
          <Field label="Status" span={2}>
            <Select ref={statusRef} defaultValue={modalStatusDefault}>
              <option>Ativo</option>
              <option>Inativo</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditingId(null);
              m.close();
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => {
              startSaving(async () => {
                try {
                  const name = (nomeRef.current?.value ?? "").trim();
                  const active = (statusRef.current?.value ?? "Ativo") !== "Inativo";
                  if (mode === "marca") {
                    await upsertMarca(storeId, {
                      id: editingMarca?.id,
                      name,
                      type: editingMarca?.type ?? "",
                      active,
                    });
                  } else {
                    const rawType = (typeRef.current?.value ?? catType).trim();
                    const t =
                      rawType === "produto" || rawType === "servico" || rawType === "equipamento" || rawType === "geral"
                        ? rawType
                        : "geral";
                    await upsertCategoria(storeId, {
                      id: editingCategoria?.id,
                      name,
                      type: t,
                      active,
                    });
                  }
                  await refresh();
                  setEditingId(null);
                  m.close();
                  window.alert("Salvo com sucesso");
                } catch (e) {
                  window.alert(e instanceof Error ? e.message : "Não foi possível salvar");
                }
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ───── IMPORTAÇÃO ───── */
// Hub completo: Planilhas (real) + XML NF-e (preparatório) + Histórico.
// Implementação em ./ImportacaoHub.tsx — substitui o ImportFlow mock antigo.
function ImportacaoPanel() {
  return <ImportacaoHub />;
}

/* ───── AUDITORIA ───── */
function AuditoriaPanel() {
  const [logs, setLogs] = useState<AuditoriaItemDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLogsAuditoriaCadastros()
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full min-w-0">
      <Toolbar count={logs.length} label="eventos" />
      <Card className="p-6">
        {loading && <div className="text-sm text-muted-foreground">Carregando auditoria…</div>}
        {!loading && logs.length === 0 && <div className="text-sm text-muted-foreground">Nenhum evento registrado.</div>}
        <ol className="relative ml-3 space-y-6 border-l border-border pl-6">
          {logs.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[31px] top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <span className="h-2 w-2 rounded-full bg-primary-foreground" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{a.acao}</Badge>
                <span className="font-medium text-foreground">{a.entidade}</span>
                <span className="text-xs text-muted-foreground">por {a.usuario}</span>
                <span className="ml-auto text-xs text-muted-foreground">{a.data}</span>
              </div>
              <div className="mt-2 grid gap-2 rounded-xl border border-border bg-background p-3 text-xs md:grid-cols-2">
                {a.antes && <div><span className="text-muted-foreground">Antes:</span> <span className="text-foreground">{a.antes}</span></div>}
                <div className={a.antes ? "" : "md:col-span-2"}><span className="text-muted-foreground">Detalhe:</span> <span className="text-foreground">{a.depois}</span></div>
                <div className="md:col-span-2 text-muted-foreground">Origem: <span className="font-mono">{a.ip}</span></div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
