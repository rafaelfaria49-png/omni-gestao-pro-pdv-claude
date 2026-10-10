"use client";

// ============================================================================
// Operações V3 — Atendimento Rápido (serviços de balcão REAIS)
// ----------------------------------------------------------------------------
// Registra um serviço rápido concluído: cria a OS, recebe no caixa e conclui,
// reusando a espinha (`finalizarAtendimentoRapidoV3`). Integra com o fechamento
// do caixa. Sem sistema paralelo, sem schema novo.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Clock, Info, Loader2, Lock, Plus, Search, Sparkles, User, Wallet, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { listClientes } from "@/api/clientes";
import {
  finalizarAtendimentoRapidoV3,
  type FinalizarAtendimentoRapidoResultV3,
} from "@/lib/operacoes-v3/atendimento-rapido-actions";
import { getCaixaSessaoAbertaV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import {
  SERVICOS_RAPIDOS_V3,
  camposDatasAtendimentoAgoraV3,
  formatDuracaoV3,
  resolverDatasAtendimentoFormV3,
  type AtendimentoClienteModoV3,
  type AtendimentoRapidoInputV3,
  type CamposDatasAtendimentoV3,
} from "@/lib/operacoes-v3/atendimento-rapido-model";
import { formatarDataOperacionalV3, hojeNaLojaV3, lerDataOperacionalV3 } from "@/lib/operacoes-v3/datas-operacionais-model";
import { FORMAS_RECEBIMENTO_V3, type FormaRecebimentoV3 } from "@/lib/operacoes-v3/payment-model";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ButtonV3 } from "../components/UiV3";
import { DataOperacionalCampoV3 } from "../components/DataOperacionalCampoV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL } from "../lib/format";

interface ClienteOpcao {
  id: string;
  nome: string;
  telefone?: string;
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const FORMAS_SUPORTADAS = FORMAS_RECEBIMENTO_V3.filter((f) => f.suportada);

function Card({ icon, titulo, children, aside }: { icon: ReactNode; titulo: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Campo({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function AtendimentoRapidoV3() {
  const { storeId, reload, notificar, abrirNovaOS, openOS } = useOperacoesV3();

  // Caixa
  const [caixaAberta, setCaixaAberta] = useState<boolean | null>(null);

  // Cliente
  const [clienteModo, setClienteModo] = useState<AtendimentoClienteModoV3>("balcao");
  const [clienteBusca, setClienteBusca] = useState("");
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteOpcao | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  // Serviço — abre VAZIO (sem pré-seleção)
  const [servicoSelId, setServicoSelId] = useState<string>("");
  const [servicoNome, setServicoNome] = useState<string>("");
  const [servicoValor, setServicoValor] = useState<number>(0);
  const [servicoDescricao, setServicoDescricao] = useState("");

  // Catálogo da SESSÃO: curados + adicionados em "Novo serviço" (não persistente)
  const [customServicos, setCustomServicos] = useState<{ id: string; nome: string; valorPadrao: number }[]>([]);
  const [novoServicoOpen, setNovoServicoOpen] = useState(false);
  const [nsNome, setNsNome] = useState("");
  const [nsValor, setNsValor] = useState(0);
  const [nsDescricao, setNsDescricao] = useState("");

  // Equipamento (opcional)
  const [equipMarca, setEquipMarca] = useState("");
  const [equipModelo, setEquipModelo] = useState("");

  // Pagamento
  // Nenhuma forma pré-selecionada: o operador escolhe antes de finalizar (GOAL
  // OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item E) — ausência nunca vira Dinheiro.
  const [forma, setForma] = useState<FormaRecebimentoV3 | "">("");
  const [observacao, setObservacao] = useState("");

  // Data do atendimento (default = hoje, agora; editável p/ registro retroativo).
  // Fuso da loja; horário automático descartado ao trocar o dia.
  const [datas, setDatasState] = useState<CamposDatasAtendimentoV3>(() => camposDatasAtendimentoAgoraV3());
  const [errosDatas, setErrosDatas] = useState<Record<string, string>>({});
  const refsDatas = {
    dataAtendimento: useRef<HTMLInputElement>(null),
    dataEntrada: useRef<HTMLInputElement>(null),
    dataConclusao: useRef<HTMLInputElement>(null),
  };
  const setDatas = (patch: Partial<CamposDatasAtendimentoV3>) => {
    setDatasState((d) => ({ ...d, ...patch }));
    setErrosDatas({});
  };

  // Estado de submissão
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<FinalizarAtendimentoRapidoResultV3 | null>(null);

  const sid = (storeId ?? "").trim();

  // Carrega status do caixa + clientes
  useEffect(() => {
    if (!sid) {
      setCaixaAberta(null);
      setClientes([]);
      return;
    }
    let vivo = true;
    getCaixaSessaoAbertaV3(sid)
      .then((s) => vivo && setCaixaAberta(!!s.aberta))
      .catch(() => vivo && setCaixaAberta(false));
    listClientes(sid)
      .then((rows) => {
        if (!vivo) return;
        setClientes(rows.map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone ?? undefined })));
      })
      .catch(() => vivo && setClientes([]));
    return () => {
      vivo = false;
    };
  }, [sid]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nome.toLowerCase().includes(q) || (c.telefone ?? "").toLowerCase().includes(q)) : clientes;
    return base.slice(0, 20);
  }, [clientes, clienteBusca]);

  const servicosDisponiveis = useMemo(() => [...SERVICOS_RAPIDOS_V3, ...customServicos], [customServicos]);

  const selecionarServico = (id: string) => {
    setServicoSelId(id);
    if (id === "" || id === "__manual__") {
      if (id === "__manual__") {
        setServicoNome("");
        setServicoValor(0);
      }
      return;
    }
    const preset = servicosDisponiveis.find((s) => s.id === id);
    if (preset) {
      setServicoNome(preset.nome);
      setServicoValor(preset.valorPadrao);
    }
  };

  const adicionarNovoServico = () => {
    const nome = nsNome.trim();
    if (!nome) return;
    const valor = Math.max(0, nsValor);
    const novo = { id: `custom-${Date.now()}`, nome, valorPadrao: valor };
    setCustomServicos((arr) => [...arr, novo]);
    setServicoSelId(novo.id);
    setServicoNome(nome);
    setServicoValor(valor);
    setServicoDescricao(nsDescricao.trim());
    setNovoServicoOpen(false);
    setNsNome("");
    setNsValor(0);
    setNsDescricao("");
  };

  // Datas: mesma regra do servidor (fatos, nunca no futuro; saída ≥ entrada).
  const datasResolvidas = resolverDatasAtendimentoFormV3(datas);
  const hoje = hojeNaLojaV3();
  const entradaLida = datasResolvidas.entrada ? lerDataOperacionalV3(datasResolvidas.entrada.iso, datasResolvidas.entrada.meta) : null;
  const conclusaoLida = datasResolvidas.conclusao ? lerDataOperacionalV3(datasResolvidas.conclusao.iso, datasResolvidas.conclusao.meta) : null;
  const retroativo = !!entradaLida && entradaLida.dia < hoje;
  // Duração só quando as duas pontas têm horário (só-dia não inventa duração).
  const duracaoMs =
    datas.detalhar && entradaLida?.precisao === "data_hora" && conclusaoLida?.precisao === "data_hora"
      ? Date.parse(conclusaoLida.iso) - Date.parse(entradaLida.iso)
      : NaN;

  const clienteOk =
    clienteModo === "balcao" ||
    (clienteModo === "existente" && !!clienteSel) ||
    (clienteModo === "novo" && novoNome.trim().length > 0);
  const podeFinalizar =
    caixaAberta === true && clienteOk && servicoNome.trim().length > 0 && servicoValor > 0 && !!forma && !saving;

  const resetForm = useCallback(() => {
    setClienteModo("balcao");
    setClienteBusca("");
    setClienteSel(null);
    setNovoNome("");
    setNovoTelefone("");
    setServicoSelId("");
    setServicoNome("");
    setServicoValor(0);
    setServicoDescricao("");
    setNovoServicoOpen(false);
    setNsNome("");
    setNsValor(0);
    setNsDescricao("");
    setEquipMarca("");
    setEquipModelo("");
    setForma("");
    setObservacao("");
    setDatasState(camposDatasAtendimentoAgoraV3());
    setErrosDatas({});
  }, []);

  const finalizar = useCallback(async () => {
    if (!sid) {
      setErro("Selecione uma unidade ativa.");
      return;
    }
    // Datas validadas antes de qualquer efeito (mesma regra do servidor).
    const resolvidas = resolverDatasAtendimentoFormV3(datas);
    if (resolvidas.erros.length > 0) {
      setErrosDatas(Object.fromEntries(resolvidas.erros.map((e) => [e.campo, e.mensagem])));
      const alvo = refsDatas[resolvidas.erros[0]!.campo as keyof typeof refsDatas];
      requestAnimationFrame(() => alvo?.current?.focus());
      setErro("Revise a data do atendimento.");
      return;
    }
    if (!forma) {
      setErro("Escolha a forma de pagamento antes de finalizar.");
      return;
    }
    const input: AtendimentoRapidoInputV3 = {
      cliente:
        clienteModo === "existente"
          ? { modo: "existente", clienteId: clienteSel?.id, nome: clienteSel?.nome, telefone: clienteSel?.telefone }
          : clienteModo === "novo"
            ? { modo: "novo", nome: novoNome, telefone: novoTelefone }
            : { modo: "balcao" },
      servico: { nome: servicoNome, valor: servicoValor, descricao: servicoDescricao || undefined },
      equipamento: equipMarca.trim() || equipModelo.trim() ? { marca: equipMarca, modelo: equipModelo } : undefined,
      formaPagamento: forma,
      observacao: observacao || undefined,
      // Datas do SERVIÇO — o recebimento continua sendo registrado agora, no caixa atual.
      dataEntrada: resolvidas.entrada?.iso,
      dataEntradaMeta: resolvidas.entrada?.meta,
      dataConclusao: resolvidas.conclusao?.iso,
      dataConclusaoMeta: resolvidas.conclusao?.meta,
    };

    setSaving(true);
    setErro(null);
    try {
      const res = await finalizarAtendimentoRapidoV3(sid, input);
      setSucesso(res);
      notificar(`Serviço registrado: OS ${res.codigo ?? res.osId} · ${formatBRL(res.valorRecebido)}.`);
      resetForm();
      reload();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível finalizar o serviço.");
      const novamente = resolverDatasAtendimentoFormV3(datas);
      if (novamente.erros.length > 0) setErrosDatas(Object.fromEntries(novamente.erros.map((x) => [x.campo, x.mensagem])));
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, clienteModo, clienteSel, novoNome, novoTelefone, servicoNome, servicoValor, servicoDescricao, equipMarca, equipModelo, forma, observacao, datas, notificar, resetForm, reload]);

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.atendimento.titulo}
      subtitulo="Registra serviços concluídos no balcão (transferência, película, configuração…) e integra com o caixa."
      actions={
        <ButtonV3 variant="outline" onClick={abrirNovaOS}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Abrir OS completa
        </ButtonV3>
      }
    >
      <div className="space-y-4">
        {/* Caixa fechado → bloqueia */}
        {caixaAberta === false ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            <span>Caixa fechado. Abra o caixa no PDV para registrar serviços rápidos (o recebimento entra no fechamento).</span>
          </div>
        ) : null}

        {/* Sucesso */}
        {sucesso ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-xs text-success">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              Serviço registrado e recebido — <strong>OS {sucesso.codigo ?? sucesso.osId}</strong> · {formatBRL(sucesso.valorRecebido)} · {sucesso.clienteNome}.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <ButtonV3 variant="outline" className="px-2 py-1 text-xs" onClick={() => openOS(sucesso.osId)}>Ver OS</ButtonV3>
              <ButtonV3 variant="ghost" className="px-2 py-1 text-xs" onClick={() => setSucesso(null)}>Novo</ButtonV3>
            </div>
          </div>
        ) : null}

        {/* Cliente */}
        <Card icon={<User className="h-4 w-4" />} titulo="Cliente">
          <div className="mb-3 inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            {([
              { id: "balcao", label: "Cliente balcão" },
              { id: "existente", label: "Existente" },
              { id: "novo", label: "Novo" },
            ] as { id: AtendimentoClienteModoV3; label: string }[]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setClienteModo(opt.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  clienteModo === opt.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {clienteModo === "balcao" ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Atendimento sem identificação. Será registrado como <strong>Cliente Balcão</strong> (sem exigir CPF/telefone, sem duplicar cadastro).
            </p>
          ) : clienteModo === "existente" ? (
            <div className="space-y-2">
              {clienteSel ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{clienteSel.nome}</span>
                  <ButtonV3 variant="outline" className="px-2 py-1 text-xs" onClick={() => setClienteSel(null)}>Trocar</ButtonV3>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input className={cn(inputCls, "pl-9")} value={clienteBusca} onChange={(e) => setClienteBusca(e.target.value)} placeholder="Nome ou telefone…" />
                  </div>
                  {clienteBusca.trim() ? (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                      {clientesFiltrados.length === 0 ? (
                        <p className="p-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                      ) : (
                        clientesFiltrados.map((c) => (
                          <button key={c.id} type="button" onClick={() => { setClienteSel(c); setClienteBusca(""); }} className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-muted/50">
                            <span className="min-w-0 truncate text-sm text-foreground">{c.nome}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{c.telefone || "—"}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome *">
                <input className={inputCls} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do cliente" maxLength={120} />
              </Campo>
              <Campo label="Telefone (opcional)">
                <input className={inputCls} value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
              </Campo>
            </div>
          )}
        </Card>

        {/* Serviço */}
        <Card
          icon={<Wrench className="h-4 w-4" />}
          titulo="Serviço"
          aside={
            <ButtonV3 variant="outline" className="px-2 py-1 text-xs" onClick={() => setNovoServicoOpen((v) => !v)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Novo serviço
            </ButtonV3>
          }
        >
          {novoServicoOpen ? (
            <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Campo label="Nome do serviço *">
                  <input className={inputCls} value={nsNome} onChange={(e) => setNsNome(e.target.value)} placeholder="Ex.: Backup de fotos" maxLength={120} />
                </Campo>
                <Campo label="Valor padrão (R$)">
                  <input className={inputCls} type="number" min={0} step="0.01" value={nsValor || ""} onChange={(e) => setNsValor(num(e.target.value))} placeholder="0,00" />
                </Campo>
                <Campo label="Descrição (opcional)">
                  <input className={inputCls} value={nsDescricao} onChange={(e) => setNsDescricao(e.target.value)} placeholder="Detalhe" maxLength={160} />
                </Campo>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Categoria: <strong>Serviço rápido</strong>. Este serviço será usado neste atendimento. Catálogo persistente será implementado em fase futura.
              </p>
              <div className="flex justify-end gap-2">
                <ButtonV3 variant="ghost" className="px-2 py-1 text-xs" onClick={() => setNovoServicoOpen(false)}>Cancelar</ButtonV3>
                <ButtonV3 variant="primary" className="px-2 py-1 text-xs" onClick={adicionarNovoServico} disabled={!nsNome.trim()}>Adicionar</ButtonV3>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Serviço">
              <select className={inputCls} value={servicoSelId} onChange={(e) => selecionarServico(e.target.value)}>
                <option value="" disabled>Selecione um serviço…</option>
                {servicosDisponiveis.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
                <option value="__manual__">Outro / manual…</option>
              </select>
            </Campo>
            <Campo label="Valor (R$) *">
              <input className={inputCls} type="number" min={0} step="0.01" value={servicoValor || ""} onChange={(e) => setServicoValor(num(e.target.value))} placeholder="0,00" />
            </Campo>
            <Campo label="Descrição do serviço *" hint="Editável — ajuste o nome se for um serviço manual.">
              <input className={inputCls} value={servicoNome} onChange={(e) => { setServicoNome(e.target.value); setServicoSelId("__manual__"); }} placeholder="Selecione acima ou digite o serviço" maxLength={120} />
            </Campo>
            <Campo label="Observação do serviço (opcional)">
              <input className={inputCls} value={servicoDescricao} onChange={(e) => setServicoDescricao(e.target.value)} placeholder="Detalhe rápido" maxLength={160} />
            </Campo>
          </div>
        </Card>

        {/* Equipamento (opcional) */}
        <Card icon={<Wrench className="h-4 w-4" />} titulo="Equipamento (opcional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Marca">
              <input className={inputCls} value={equipMarca} onChange={(e) => setEquipMarca(e.target.value)} placeholder="Ex.: Samsung" maxLength={40} />
            </Campo>
            <Campo label="Modelo">
              <input className={inputCls} value={equipModelo} onChange={(e) => setEquipModelo(e.target.value)} placeholder="Ex.: A54" maxLength={60} />
            </Campo>
          </div>
        </Card>

        {/* Data do atendimento */}
        <Card icon={<Clock className="h-4 w-4" />} titulo="Data do atendimento">
          {datas.detalhar ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <DataOperacionalCampoV3
                ref={refsDatas.dataEntrada}
                id="atend-v3-entrada"
                rotulo="Entrada"
                ajuda="Quando o atendimento começou."
                obrigatorio
                maxDia={hoje}
                valor={datas.dataEntrada}
                onChange={(c) => setDatas({ dataEntrada: c })}
                erro={errosDatas.dataEntrada || null}
              />
              <DataOperacionalCampoV3
                ref={refsDatas.dataConclusao}
                id="atend-v3-saida"
                rotulo="Saída"
                ajuda="Quando o serviço foi concluído e entregue."
                obrigatorio
                maxDia={hoje}
                minDia={datas.dataEntrada.dia || undefined}
                valor={datas.dataSaida}
                onChange={(c) => setDatas({ dataSaida: c })}
                erro={errosDatas.dataConclusao || null}
              />
            </div>
          ) : (
            <DataOperacionalCampoV3
              ref={refsDatas.dataAtendimento}
              id="atend-v3-data"
              rotulo="Data do atendimento"
              ajuda="Quando o serviço aconteceu."
              obrigatorio
              maxDia={hoje}
              valor={datas.dataAtendimento}
              onChange={(c) => setDatas({ dataAtendimento: c })}
              erro={errosDatas.dataAtendimento || null}
            />
          )}
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-expanded={datas.detalhar}
            onClick={() =>
              setDatas(datas.detalhar ? { detalhar: false } : { detalhar: true, dataEntrada: datas.dataAtendimento, dataSaida: datas.dataAtendimento })
            }
          >
            {datas.detalhar ? "Usar uma data só" : "Detalhar entrada e saída"}
          </button>
          {Number.isFinite(duracaoMs) && duracaoMs >= 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Duração: <strong className="text-foreground">{formatDuracaoV3(duracaoMs)}</strong>
            </p>
          ) : null}
          {retroativo ? (
            <p role="status" className="mt-2 flex items-start gap-1.5 rounded-lg border border-info/30 bg-info/10 px-2.5 py-2 text-[11px] text-info">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                A data informa quando o serviço aconteceu ({formatarDataOperacionalV3(conclusaoLida)}). A confirmação registra o recebimento agora, no caixa atual.
              </span>
            </p>
          ) : null}
        </Card>

        {/* Pagamento */}
        <Card icon={<Wallet className="h-4 w-4" />} titulo="Pagamento">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Forma de pagamento">
              <select className={inputCls} value={forma} onChange={(e) => setForma(e.target.value as FormaRecebimentoV3)}>
                <option value="" disabled>Escolha a forma</option>
                {FORMAS_SUPORTADAS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Observação (opcional)">
              <input className={inputCls} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: cliente vai voltar amanhã" maxLength={200} />
            </Campo>
          </div>
        </Card>

        {/* Footer */}
        <footer className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
          {erro ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive sm:flex-1 sm:min-w-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{erro}</span>
            </p>
          ) : (
            <span className="mr-auto text-xs text-muted-foreground">
              Total a receber <strong className="text-foreground">{formatBRL(servicoValor || 0)}</strong> · entra no fechamento do caixa.
            </span>
          )}
          <ButtonV3 variant="primary" onClick={() => void finalizar()} disabled={!podeFinalizar}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {saving ? "Finalizando…" : "Finalizar serviço"}
          </ButtonV3>
        </footer>
      </div>
    </SectionShellV3>
  );
}
