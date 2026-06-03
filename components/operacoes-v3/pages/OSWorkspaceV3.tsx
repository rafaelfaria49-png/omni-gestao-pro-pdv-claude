"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, FileText, Globe, Loader2, Printer, Search, Send, Sparkles, Tag, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistEstado, OrdemServico, PecaUsada, Servico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { OSHeaderV3 } from "../components/OSHeaderV3";
import { OSCommandBarV3 } from "../components/OSCommandBarV3";
import { OSContextRailV3 } from "../components/OSContextRailV3";
import { OSSectionV3 } from "../components/OSSectionV3";
import { OSCardV3 } from "../components/OSCardV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import type { OperacaoStatusV3 } from "@/lib/operacoes-v3/status-machine";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { useOrdemV3 } from "../hooks/use-ordem-v3";
import { useOrcamentoV3 } from "../hooks/use-orcamento-v3";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL, formatData, formatDataHora } from "../lib/format";
import { matchOrdem, orcamentoTotal, pagamentoInfo } from "../lib/os-derive";

const CHECK_DOT: Record<ChecklistEstado, string> = {
  ok: "bg-success",
  ruim: "bg-destructive",
  nao_testado: "bg-info/60",
};

function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function LinhaItem({ descricao, detalhe, valor }: { descricao: string; detalhe?: string; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{descricao}</p>
        {detalhe ? <p className="truncate text-xs text-muted-foreground">{detalhe}</p> : null}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{formatBRL(valor)}</span>
    </div>
  );
}

function pecaSubtotal(p: PecaUsada): number {
  return Math.max(0, p.quantidade * p.valorUnitario - (p.desconto ?? 0));
}
function servicoSubtotal(s: Servico): number {
  return Math.max(0, s.valor - (s.desconto ?? 0));
}

// ---------------------------------------------------------------------------

function Picker() {
  const { ordens, loading, primeiraCarga, openOS, navigate } = useOperacoesV3();
  const [q, setQ] = useState("");
  const lista = useMemo(() => ordens.filter((o) => matchOrdem(o, q)).slice(0, 24), [ordens, q]);

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.workspace.titulo}
      subtitulo={SCREEN_COPY.workspace.subtitulo}
      actions={
        <ButtonV3 variant="outline" onClick={() => navigate("fila")}>
          Ver fila completa
        </ButtonV3>
      }
    >
      <div className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Selecione uma OS para abrir o workspace…"
          />
        </div>
      </div>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : lista.length === 0 ? (
        <EmptyStateV3
          icon={<FileText className="h-8 w-8" />}
          titulo="Selecione uma ordem de serviço"
          descricao="Escolha uma OS na fila ou busque acima para abrir a visão única e contínua."
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((os) => (
            <OSCardV3 key={os.id} os={os} onOpen={openOS} />
          ))}
        </div>
      )}
    </SectionShellV3>
  );
}

// ---------------------------------------------------------------------------

function Workspace({ os, reloadOrdem }: { os: OrdemServico; reloadOrdem: () => void }) {
  const { acaoEmConstrucao, navigate, openOS, storeId, reload: reloadLista, mudarStatus } = useOperacoesV3();
  const pag = pagamentoInfo(os);

  // Toda mudança de status passa pela máquina única (via contexto). Em sucesso,
  // recarrega também a OS aberta para manter Workspace ↔ Kanban sincronizados.
  const onMudarStatus = useCallback(
    async (to: OperacaoStatusV3): Promise<boolean> => {
      const ok = await mudarStatus(os.id, to);
      if (ok) reloadOrdem();
      return ok;
    },
    [mudarStatus, os.id, reloadOrdem],
  );
  const orc = os.orcamento;
  const pecas = orc?.pecas?.length ? orc.pecas : os.pecas ?? [];

  const refresh = useCallback(() => {
    reloadOrdem();
    reloadLista();
  }, [reloadOrdem, reloadLista]);
  const orcActions = useOrcamentoV3(storeId, os.id, refresh);

  // Orçamento real = materializado (não é a prévia sintetizada dos itens da OS).
  const orcReal = orc && orc.sintetizado !== true ? orc : null;
  const podeGerarOrcamento = !orc || orc.sintetizado === true;
  const orcEditavel = !!orcReal && (orcReal.status === "rascunho" || orcReal.status === "enviado");
  const orcAprovado = orcReal?.status === "aprovado";

  const acao = (label: string) => (
    <ButtonV3 variant="subtle" onClick={() => acaoEmConstrucao(label)}>
      {label}
    </ButtonV3>
  );

  const orcamentoAcoes = (
    <div className="flex flex-wrap items-center gap-2">
      {podeGerarOrcamento ? (
        <ButtonV3 variant="primary" disabled={orcActions.pending !== null} onClick={() => orcActions.gerar()}>
          {orcActions.pending === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Gerar orçamento da OS
        </ButtonV3>
      ) : null}
      {orcEditavel ? (
        <ButtonV3 variant="primary" disabled={orcActions.pending !== null} onClick={() => orcActions.enviar()}>
          {orcActions.pending === "enviar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {orcReal?.status === "enviado" ? "Reenviar ao cliente" : "Enviar ao cliente"}
        </ButtonV3>
      ) : null}
      {orcEditavel ? (
        <>
          <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Aprovar orçamento (gera cobrança no Financeiro)")}>
            <CheckCircle2 className="h-4 w-4" />
            Aprovar
          </ButtonV3>
          <ButtonV3 variant="danger" onClick={() => acaoEmConstrucao("Reprovar orçamento (cancela cobrança no Financeiro)")}>
            <XCircle className="h-4 w-4" />
            Reprovar
          </ButtonV3>
        </>
      ) : null}
      {orcAprovado ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Orçamento aprovado
        </span>
      ) : null}
      {orcActions.error ? (
        <p className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {orcActions.error}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonV3 variant="ghost" onClick={() => navigate("fila")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar à fila
        </ButtonV3>
        <ButtonV3 variant="ghost" onClick={() => openOS("")}>
          Trocar OS
        </ButtonV3>
      </div>

      <OSHeaderV3 os={os} />
      <OSCommandBarV3 os={os} onMudarStatus={onMudarStatus} onAcao={acaoEmConstrucao} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Coluna principal — seções na ordem obrigatória */}
        <div className="min-w-0 space-y-3">
          <OSSectionV3
            titulo="1. Identificação / Atendimento"
            tone="info"
            resumo={`${os.cliente?.nome ?? "Cliente"} · ${[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") || os.equipamento?.tipo || "Equipamento"}`}
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KV label="Cliente" value={os.cliente?.nome} />
              <KV label="Documento" value={os.cliente?.documento} />
              <KV label="Telefone" value={os.cliente?.telefone} />
              <KV label="Tipo" value={os.equipamento?.tipo} />
              <KV label="Marca / modelo" value={[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ")} />
              <KV label="Nº de série" value={os.equipamento?.numeroSerie} />
              <KV label="Origem" value={os.origem} />
              <KV
                label="Senha"
                value={os.senhaEquipamento ? `${os.senhaEquipamento}${os.senhaEquipamentoTipo ? ` (${os.senhaEquipamentoTipo})` : ""}` : ""}
              />
              <KV label="Acessórios" value={(os.equipamento?.acessorios ?? []).join(", ")} />
            </dl>
            {os.equipamento?.defeitoRelatado ? (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">Defeito relatado</p>
                <p className="mt-0.5 text-sm text-foreground">{os.equipamento.defeitoRelatado}</p>
              </div>
            ) : null}
            {os.checklist && os.checklist.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Checklist de entrada</p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {os.checklist.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", CHECK_DOT[c.estado])} aria-hidden />
                      <span className="truncate text-foreground">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </OSSectionV3>

          <OSSectionV3
            titulo="2. Diagnóstico"
            tone="info"
            statusVisual={os.status === "diagnostico" ? "em andamento" : undefined}
            acaoPrincipal={acao("Registrar diagnóstico")}
            resumo="Avaliação técnica do equipamento"
            vazio={
              <p className="text-sm text-muted-foreground">
                Diagnóstico estruturado chega na próxima fase. Por ora, use as observações da OS (lateral).
              </p>
            }
          >
            {(os.equipamento?.defeitosComuns?.length ?? 0) > 0 || (os.equipamento?.checklistRecomendado?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {os.equipamento?.defeitosComuns?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Defeitos comuns deste modelo</p>
                    <div className="flex flex-wrap gap-1.5">
                      {os.equipamento.defeitosComuns.map((d) => (
                        <span key={d} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {os.equipamento?.checklistRecomendado?.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Checklist recomendado</p>
                    <div className="flex flex-wrap gap-1.5">
                      {os.equipamento.checklistRecomendado.map((d) => (
                        <span key={d} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="3. Orçamento"
            tone={orc?.status === "aprovado" ? "success" : orc ? "warning" : "neutral"}
            statusVisual={orc ? (orc.sintetizado ? "prévia (não materializado)" : orc.status) : "sem orçamento"}
            resumo={orc ? `Total ${formatBRL(orcamentoTotal(os))}` : "Ainda não há orçamento"}
            acaoPrincipal={orcamentoAcoes}
            vazio={
              <p className="text-sm text-muted-foreground">
                Esta OS ainda não tem orçamento. Use <strong className="font-medium text-foreground">Gerar orçamento da OS</strong> acima
                para materializar um rascunho editável a partir dos itens já lançados.
              </p>
            }
          >
            {orc ? (
              <div className="space-y-3">
                {orc.sintetizado ? (
                  <p className="rounded-lg border border-dashed border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
                    Prévia derivada dos itens da OS — ainda não materializada como orçamento editável.
                  </p>
                ) : null}
                {orc.servicos.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Serviços</p>
                    {orc.servicos.map((s) => (
                      <LinhaItem key={s.id} descricao={s.descricao} valor={servicoSubtotal(s)} />
                    ))}
                  </div>
                ) : null}
                {orc.pecas.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Peças</p>
                    {orc.pecas.map((p) => (
                      <LinhaItem
                        key={p.id}
                        descricao={p.nome}
                        detalhe={`${p.quantidade} × ${formatBRL(p.valorUnitario)}`}
                        valor={pecaSubtotal(p)}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-sm text-muted-foreground">
                    {orc.desconto > 0 ? `Desconto ${formatBRL(orc.desconto)}` : "Total"}
                  </span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">{formatBRL(orcamentoTotal(os))}</span>
                </div>
              </div>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="4. Peças & reserva"
            tone="neutral"
            statusVisual={pecas.length > 0 ? `${pecas.length} item(ns)` : "sem peças"}
            resumo="Peças vinculadas e reserva de estoque"
            vazio={<p className="text-sm text-muted-foreground">Nenhuma peça vinculada. A reserva de estoque por OS chega na próxima fase.</p>}
          >
            {pecas.length > 0 ? (
              <div>
                {pecas.map((p) => (
                  <LinhaItem
                    key={p.id}
                    descricao={p.nome}
                    detalhe={`${p.quantidade} × ${formatBRL(p.valorUnitario)}${p.sku ? ` · SKU ${p.sku}` : ""}`}
                    valor={pecaSubtotal(p)}
                  />
                ))}
                <p className="mt-2 text-xs text-muted-foreground">Reserva/baixa de estoque por OS: a conectar.</p>
              </div>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="5. Financeiro / Pagamento"
            tone="warning"
            statusVisual={pag.estado === "sem-cobranca" ? "sem cobrança" : "pagamento a conectar"}
            resumo={`Total ${formatBRL(pag.total)}`}
            acaoPrincipal={acao("Receber pagamento")}
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KV label="Total da OS" value={formatBRL(pag.total)} />
              <KV label="Forma de cobrança" value={os.faturamentoFormaPagamento ?? os.faturamentoModoCobranca} />
              <KV
                label="Faturamento"
                value={os.faturamentoStatus === "pendente" ? "Conta a receber pendente" : os.faturamentoStatus === "cancelado" ? "Cancelado" : ""}
              />
            </dl>
            {os.faturamentoParcelas && os.faturamentoParcelas.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Parcelas</p>
                {os.faturamentoParcelas.map((parc) => (
                  <LinhaItem
                    key={parc.numero}
                    descricao={`Parcela ${parc.numero}`}
                    detalhe={`Vence ${formatData(parc.vencimentoIso)}`}
                    valor={parc.valor}
                  />
                ))}
              </div>
            ) : null}
            <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              O status real do recebimento (em aberto / parcial / quitado) vive no Financeiro e será conectado depois.
            </p>
          </OSSectionV3>

          <OSSectionV3
            titulo="6. Execução"
            tone={os.status === "em_execucao" ? "primary" : "neutral"}
            statusVisual={os.status === "em_execucao" ? "em andamento" : undefined}
            acaoPrincipal={acao("Atualizar execução")}
            resumo="Reparo e checklist técnico de bancada"
            vazio={<p className="text-sm text-muted-foreground">Sem checklist técnico registrado nesta OS.</p>}
          >
            {os.checklistTecnico && os.checklistTecnico.length > 0 ? (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {os.checklistTecnico.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", c.ok ? "bg-success" : "bg-muted-foreground/40")} aria-hidden />
                    <span className="truncate text-foreground">{c.label}</span>
                  </div>
                ))}
              </div>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="7. Entrega"
            tone={os.status === "entregue" ? "success" : "neutral"}
            statusVisual={os.retirada?.confirmado ? "retirada confirmada" : os.entregueEm ? "entregue" : undefined}
            acaoPrincipal={acao("Registrar entrega")}
            resumo="Retirada e conferência pelo cliente"
            vazio={<p className="text-sm text-muted-foreground">Entrega ainda não registrada.</p>}
          >
            {os.retirada?.confirmado || os.entregueEm ? (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <KV label="Retirado por" value={os.retirada?.retiradoPor} />
                <KV label="Retirado em" value={os.retirada?.retiradoEm ? formatDataHora(os.retirada.retiradoEm) : ""} />
                <KV label="Entregue em" value={os.entregueEm ? formatDataHora(os.entregueEm) : ""} />
                {os.retirada?.observacao ? <KV label="Observação" value={os.retirada.observacao} /> : null}
              </dl>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="8. Garantia"
            tone={os.garantia?.ativa ? "success" : "neutral"}
            statusVisual={os.garantia?.ativa ? "ativa" : undefined}
            acaoPrincipal={acao("Gerar termo de garantia")}
            resumo="Cobertura pós-reparo"
            vazio={<p className="text-sm text-muted-foreground">Sem garantia registrada para esta OS.</p>}
          >
            {os.garantia?.ativa || (os.garantiasOperacionais?.length ?? 0) > 0 ? (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <KV label="Prazo" value={os.garantia?.prazoDias ? `${os.garantia.prazoDias} dias` : ""} />
                <KV label="Início" value={os.garantia?.inicioEm ? formatData(os.garantia.inicioEm) : ""} />
                <KV label="Validade" value={os.garantia?.fimEm ? formatData(os.garantia.fimEm) : ""} />
                {os.garantia?.termo ? <KV label="Termo" value={os.garantia.termo} /> : null}
              </dl>
            ) : undefined}
          </OSSectionV3>
        </div>

        {/* Lateral de contexto */}
        <OSContextRailV3 os={os} onAbrirHistorico={() => navigate("historico")} onAcao={acaoEmConstrucao} />
      </div>

      {/* Rodapé utilitário */}
      <footer className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Imprimir documento da OS")}>
          <Printer className="h-4 w-4" />
          Documento
        </ButtonV3>
        <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Imprimir etiqueta")}>
          <Tag className="h-4 w-4" />
          Etiqueta
        </ButtonV3>
        <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Abrir portal do cliente")}>
          <Globe className="h-4 w-4" />
          Portal do cliente
        </ButtonV3>
        <span className="ml-auto text-xs text-muted-foreground">Visão somente leitura — sem dados de debug.</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function OSWorkspaceV3() {
  const { storeId, selectedOsId, navigate } = useOperacoesV3();
  const { ordem, loading, error, reload } = useOrdemV3(storeId, selectedOsId);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.workspace.titulo} subtitulo={SCREEN_COPY.workspace.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }
  if (!selectedOsId) return <Picker />;
  if (loading && !ordem) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.workspace.titulo} subtitulo={SCREEN_COPY.workspace.subtitulo}>
        <LoadingBlockV3 label="Carregando OS…" />
      </SectionShellV3>
    );
  }
  if (!ordem) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.workspace.titulo} subtitulo={SCREEN_COPY.workspace.subtitulo}>
        <EmptyStateV3
          icon={<FileText className="h-8 w-8" />}
          titulo="OS não encontrada"
          descricao={error ?? "A ordem selecionada não existe nesta unidade ou foi removida."}
          acao={<ButtonV3 variant="outline" onClick={() => navigate("fila")}>Voltar à fila</ButtonV3>}
        />
      </SectionShellV3>
    );
  }
  return <Workspace os={ordem} reloadOrdem={reload} />;
}
