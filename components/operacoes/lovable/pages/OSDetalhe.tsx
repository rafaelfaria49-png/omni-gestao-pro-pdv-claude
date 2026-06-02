import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, ExternalLink, MessageCircle, Pencil, Phone, Printer,
  ShieldCheck, Tag, User, UserPlus, Wrench,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { OperacaoOsAcaoBar } from "@/components/operacoes/OperacaoOsAcaoBar";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrioridadeBadge, SLABadge } from "@/components/operacoes/badges";
import { Timeline } from "@/components/operacoes/Timeline";
import { OrcamentoPanel } from "@/components/operacoes/OrcamentoPanel";
import { AnexosPanel } from "@/components/operacoes/AnexosPanel";
import { ObservacoesPanel } from "@/components/operacoes/ObservacoesPanel";
import { ChecklistTecnicoPanel } from "@/components/operacoes/ChecklistTecnicoPanel";
import { RetiradaPanel } from "@/components/operacoes/RetiradaPanel";
import { GarantiaOperacionalCard } from "@/components/operacoes/GarantiaOperacionalCard";
import { IASugestaoModal } from "@/components/operacoes/IASugestaoModal";
import { RetornoGarantiaModal } from "@/components/operacoes/RetornoGarantiaModal";
import { PortalClienteModal } from "@/components/operacoes/PortalClienteModal";
import { ImpressaoModal } from "@/components/operacoes/ImpressaoModal";
import { EtiquetaModal } from "@/components/operacoes/EtiquetaModal";
import { ModoBancadaModal } from "@/components/operacoes/ModoBancadaModal";
import { OperacionalAlertsBar } from "@/components/operacoes/OperacionalAlertsBar";
import { GerarCobrancaModal } from "@/components/operacoes/GerarCobrancaModal";
import { ORIGEM_LABEL, type OrdemServico } from "@/types/os";
import { getOperacaoStatusMeta, normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import * as osApi from "@/api/os";
import { brl, dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ESTADO_BADGE: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  ruim: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  nao_testado: "bg-muted text-muted-foreground border-border",
};

export default function OSDetalhe() {
  const { id = "" } = useParams();
  const { getOS, updateChecklist, storeId, loading: hubLoading, refresh, produtosCatalogo, clientes, tecnicos, vincularCliente, assignTecnico } = useOS();
  const fromList = getOS(id);
  /** idle = ainda não resolveu leitura avulsa; loading; done + os */
  const [detailRead, setDetailRead] = useState<
    { phase: "idle" } | { phase: "loading" } | { phase: "done"; os: OrdemServico | null }
  >({ phase: "idle" });
  const [openCliente, setOpenCliente] = useState(false);
  const [openTecnico, setOpenTecnico] = useState(false);

  useEffect(() => {
    if (!id.trim() || !storeId) {
      setDetailRead({ phase: "idle" });
      return;
    }
    if (fromList) {
      setDetailRead({ phase: "idle" });
      return;
    }
    if (hubLoading) {
      setDetailRead({ phase: "idle" });
      return;
    }
    let cancelled = false;
    setDetailRead({ phase: "loading" });
    void (async () => {
      try {
        const o = await osApi.fetchOrdem(storeId, id);
        if (!cancelled) setDetailRead({ phase: "done", os: o ?? null });
      } catch {
        if (!cancelled) setDetailRead({ phase: "done", os: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, storeId, fromList, hubLoading]);

  const os =
    fromList ?? (detailRead.phase === "done" ? detailRead.os ?? undefined : undefined);

  const awaitingDetail =
    Boolean(id.trim() && storeId) &&
    !fromList &&
    !hubLoading &&
    detailRead.phase !== "done";

  const [iaOpen, setIaOpen] = useState(false);
  const [retornoOpen, setRetornoOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [etiqOpen, setEtiqOpen] = useState(false);
  const [bancadaOpen, setBancadaOpen] = useState(false);
  const [cobrancaOpen, setCobrancaOpen] = useState(false);

  if (hubLoading || detailRead.phase === "loading" || awaitingDetail) {
    return (
      <OperacoesLayout>
        <div className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-8 text-center">
          <div className="text-sm font-medium text-muted-foreground">Carregando OS…</div>
        </div>
      </OperacoesLayout>
    );
  }

  if (!os) {
    return (
      <OperacoesLayout>
        <div className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-8 text-center">
          <div className="text-sm font-medium">OS não encontrada</div>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/operacoes/os">Voltar ao Kanban</Link>
          </Button>
        </div>
      </OperacoesLayout>
    );
  }

  const operacaoSt = normalizeOperacaoStatus(os.status);
  const operacaoMeta = getOperacaoStatusMeta(operacaoSt);
  const cycle = (s: "ok" | "ruim" | "nao_testado"): "ok" | "ruim" | "nao_testado" =>
    s === "nao_testado" ? "ok" : s === "ok" ? "ruim" : "nao_testado";

  // Financeiro estimado da OS (serviços + peças). Custo interno fica oculto do cliente.
  const custoInternoEstimado =
    (os.servicosCatalogo ?? []).reduce((s, x) => s + (x.custoInterno || 0), 0) +
    (os.pecas ?? []).reduce((s, p) => s + (p.custoUnitario || 0) * p.quantidade, 0);
  const valorClienteEstimado =
    os.orcamento?.total ??
    ((os.servicosCatalogo ?? []).reduce((s, x) => s + (x.valorVenda || 0), 0) +
      (os.pecas ?? []).reduce((s, p) => s + (p.valorUnitario || 0) * p.quantidade, 0));
  const lucroEstimado = valorClienteEstimado - custoInternoEstimado;

  return (
    <OperacoesLayout>
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/operacoes/os" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Kanban
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            {os.codigo} · Criada em {dt(os.criadoEm)} · Origem: {ORIGEM_LABEL[os.origem]}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{os.cliente.nome}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {os.equipamento.tipo} · {os.equipamento.marca} {os.equipamento.modelo}
            {os.equipamento.numeroSerie && ` · S/N ${os.equipamento.numeroSerie}`}
          </div>
          {os.tags && os.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {os.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={operacaoMeta.badgeClass}>
            {operacaoMeta.label}
          </Badge>
          <PrioridadeBadge value={os.prioridade} />
          <SLABadge prazo={os.sla.prazo} />
          {os.garantia.ativa && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
              <ShieldCheck className="h-3 w-3" /> Garantia ativa
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBancadaOpen(true)}>
          <Wrench className="h-3.5 w-3.5" /> Modo Bancada
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIaOpen(true)}>
          <Bot className="h-3.5 w-3.5" /> Sugerir solução (IA)
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPortalOpen(true)}>
          <ExternalLink className="h-3.5 w-3.5" /> Ver Portal Cliente
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEtiqOpen(true)}>
          <Tag className="h-3.5 w-3.5" /> Etiqueta
        </Button>
        {os.garantia.ativa && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRetornoOpen(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Abrir retorno em garantia
          </Button>
        )}
      </div>

      <div className="mt-5">
        <OperacaoOsAcaoBar os={os} onDone={() => void refresh()} />
      </div>

      <div className="mt-4 min-w-0">
        <OperacionalAlertsBar os={os} produtosCatalogo={produtosCatalogo} />
      </div>

      {/* Conteúdo */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5">
            <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Resumo financeiro</div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Valor ao cliente</dt>
                <dd className="font-medium">{brl(valorClienteEstimado)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Custo interno <span className="text-[10px]">(oculto do cliente)</span></dt>
                <dd className="font-medium text-amber-600">{brl(custoInternoEstimado)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Lucro estimado</dt>
                <dd className={cn("font-medium", lucroEstimado >= 0 ? "text-emerald-600" : "text-rose-600")}>{brl(lucroEstimado)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor total (Prisma)</dt>
                <dd className="font-medium">
                  {typeof os.prismaValorTotal === "number" ? brl(os.prismaValorTotal) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor base (Prisma)</dt>
                <dd className="font-medium">
                  {typeof os.prismaValorBase === "number" ? brl(os.prismaValorBase) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Atualizado em</dt>
                <dd className="font-medium">{dt(os.atualizadoEm)}</dd>
              </div>
              {os.faturamentoPendente && os.faturamentoStatus === "pendente" && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Faturamento pendente</dt>
                  <dd className="font-medium">{brl(Number(os.faturamentoTotal ?? 0))}</dd>
                </div>
              )}
              {os.faturamentoModoCobranca && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Modo de cobrança</dt>
                  <dd className="font-medium">
                    {os.faturamentoModoCobranca}
                    {os.faturamentoParcelas && os.faturamentoParcelas.length > 1
                      ? ` · ${os.faturamentoParcelas.length} parcelas`
                      : null}
                  </dd>
                </div>
              )}
            </dl>
            {os.faturamentoPendente === true &&
              os.faturamentoStatus === "pendente" &&
              Number(os.faturamentoTotal ?? 0) > 0 && (
                <div className="mt-4">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setCobrancaOpen(true)}>
                    Gerar cobrança
                  </Button>
                </div>
              )}
          </section>

          <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5">
            <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Defeito relatado</div>
            <p className="mt-2 text-sm text-foreground/90">{os.equipamento.defeitoRelatado}</p>
            {os.equipamento.acessorios && os.equipamento.acessorios.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                Acessórios entregues: {os.equipamento.acessorios.join(", ")}
              </div>
            )}
            {os.senhaEquipamento && (
              <div className="mt-2 text-xs text-muted-foreground">
                Senha do equipamento
                {os.senhaEquipamentoTipo
                  ? ` (${os.senhaEquipamentoTipo === "numerica" ? "numérica/PIN" : os.senhaEquipamentoTipo === "padrao" ? "padrão" : "texto"})`
                  : ""}
                : <span className="font-mono">{os.senhaEquipamento}</span>
              </div>
            )}
          </section>

          {os.checklist && os.checklist.length > 0 && (
            <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5">
              <div className="mb-3 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Checklist de entrada</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {os.checklist.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-2 text-xs">
                    <span>{c.label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = os.checklist?.map((it) => it.id === c.id ? { ...it, estado: cycle(it.estado) } : it);
                        updateChecklist(os.id, next, "Você");
                        toast.success("Checklist atualizado");
                      }}
                      className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase", ESTADO_BADGE[c.estado])}
                      title="Clique para alternar"
                    >
                      {c.estado === "nao_testado" ? "N/T" : c.estado}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <ChecklistTecnicoPanel os={os} />

          {os.servicosCatalogo && os.servicosCatalogo.length > 0 && (
            <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5">
              <div className="mb-3 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Serviços contratados</div>
              <ul className="space-y-2">
                {os.servicosCatalogo.map((s) => (
                  <li key={s.servicoId} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-3">
                    <div>
                      <div className="text-sm font-medium">{s.descricao}</div>
                      <div className="text-[11px] text-muted-foreground">Garantia: {s.prazoGarantiaDias} dias</div>
                    </div>
                    <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">{brl(s.valorVenda)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {os.pecas && os.pecas.length > 0 && (
            <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-5">
              <div className="mb-3 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Peças utilizadas</div>
              <ul className="space-y-2">
                {os.pecas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-3">
                    <div>
                      <div className="text-sm font-medium">{p.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.quantidade}× {brl(p.valorUnitario)}
                        {p.produtoOrigem === "manual" ? " · item manual" : p.sku ? ` · ${p.sku}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">{brl(p.valorUnitario * p.quantidade)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ObservacoesPanel os={os} />

          <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card">
            <details className="group">
              <summary className="cursor-pointer border-b border-border/50 p-4 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                Dados do payload (JSON)
              </summary>
              <div className="max-h-72 overflow-auto p-4">
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(os, null, 2)}
                </pre>
              </div>
            </details>
          </section>

          <section className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card">
            <div className="flex items-center gap-2.5 border-b border-border p-4">
              <div className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                Histórico auditável
              </div>
              {os.timeline.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                  {os.timeline.length}
                </span>
              )}
            </div>
            <div className="p-5">
              <Timeline eventos={os.timeline} />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</div>
              <Popover open={openCliente} onOpenChange={setOpenCliente}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                    <Pencil className="h-3 w-3" />
                    {os.cliente.id ? "Trocar" : "Vincular"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.nome}
                            onSelect={async () => {
                              vincularCliente(os.id, {
                                id: c.id,
                                nome: c.nome,
                                documento: c.documento ?? undefined,
                                telefone: c.telefone ?? undefined,
                                whatsapp: c.whatsapp ?? undefined,
                              });
                              setOpenCliente(false);
                              toast.success(`Cliente vinculado: ${c.nome}`);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{c.nome}</span>
                              {c.telefone && <span className="text-[11px] text-muted-foreground">{c.telefone}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="mt-1 text-sm font-semibold">{os.cliente.nome || "—"}</div>
            {os.cliente.documento && (
              <div className="text-xs text-muted-foreground">{os.cliente.documento}</div>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {os.cliente.telefone && (
                <a href={`tel:${os.cliente.telefone}`} className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary">
                  <Phone className="h-3 w-3" /> {os.cliente.telefone}
                </a>
              )}
              {os.cliente.whatsapp && (
                <button
                  onClick={() => toast("Abrir conversa WhatsApp (integração futura)")}
                  className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary"
                >
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10 shadow-sm bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Técnico responsável</div>
              <Popover open={openTecnico} onOpenChange={setOpenTecnico}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                    <UserPlus className="h-3 w-3" />
                    {os.tecnico ? "Trocar" : "Atribuir"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Buscar técnico..." />
                    <CommandList>
                      <CommandEmpty>
                        {tecnicos.length === 0
                          ? "Nenhum técnico cadastrado. Cadastre em Cadastros HUB."
                          : "Nenhum técnico encontrado."}
                      </CommandEmpty>
                      <CommandGroup>
                        {tecnicos.map((t) => (
                          <CommandItem
                            key={t.id}
                            value={t.nome}
                            onSelect={() => {
                              assignTecnico(os.id, t);
                              setOpenTecnico(false);
                              toast.success(`Técnico atribuído: ${t.nome}`);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{t.nome}</span>
                              {t.especialidades?.length > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  {t.especialidades.join(" · ")}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{os.tecnico?.nome ?? "Não atribuído"}</div>
                {os.tecnico && os.tecnico.especialidades?.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {os.tecnico.especialidades.join(" · ")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {os.garantia.ativa && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Garantia vinculada
              </div>
              <div className="mt-2 text-sm">
                {os.garantia.prazoDias} dias · início {dt(os.garantia.inicioEm)}
              </div>
              {os.garantia.fimEm && (
                <div className="text-[11px] text-muted-foreground">Vence em {dt(os.garantia.fimEm)}</div>
              )}
            </div>
          )}

          <OrcamentoPanel os={os} />
          <GarantiaOperacionalCard os={os} />
          <RetiradaPanel os={os} />
          <AnexosPanel os={os} />
        </aside>
      </div>

      <IASugestaoModal os={os} open={iaOpen} onOpenChange={setIaOpen} />
      <RetornoGarantiaModal os={os} open={retornoOpen} onOpenChange={setRetornoOpen} />
      <PortalClienteModal os={os} open={portalOpen} onOpenChange={setPortalOpen} />
      <ImpressaoModal os={os} open={printOpen} onOpenChange={setPrintOpen} />
      <EtiquetaModal os={os} open={etiqOpen} onOpenChange={setEtiqOpen} />
      <ModoBancadaModal os={os} open={bancadaOpen} onOpenChange={setBancadaOpen} />
      <GerarCobrancaModal
        os={os}
        open={cobrancaOpen}
        onOpenChange={(open) => {
          setCobrancaOpen(open);
          if (!open) void refresh();
        }}
      />
    </OperacoesLayout>
  );
}
