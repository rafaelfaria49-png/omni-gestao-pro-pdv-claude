"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Camera, FileText, Globe, History, ListChecks, Pencil, Plus, Printer, Search, ShieldCheck, Tag } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { OSHeaderV3 } from "../components/OSHeaderV3";
import { OSCommandBarV3 } from "../components/OSCommandBarV3";
import { OSContextRailV3 } from "../components/OSContextRailV3";
import { OSSectionV3 } from "../components/OSSectionV3";
import { OSCardV3 } from "../components/OSCardV3";
import { OSTimelineV3 } from "../components/OSTimelineV3";
import { ChecklistEntradaV3 } from "../components/ChecklistEntradaV3";
import { SenhaAcessoriosV3 } from "../components/SenhaAcessoriosV3";
import { DiagnosticoTecnicoV3 } from "../components/DiagnosticoTecnicoV3";
import { ServicosExecutadosV3 } from "../components/ServicosExecutadosV3";
import { AnexosV3 } from "../components/AnexosV3";
import { GarantiaOSV3 } from "../components/GarantiaOSV3";
import { OSHistoricoV3 } from "../components/OSHistoricoV3";
import { OrcamentoPanelV3 } from "../components/OrcamentoPanelV3";
import { PrintPreviewV3 } from "../components/print/PrintPreviewV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import type { OperacaoStatusV3 } from "@/lib/operacoes-v3/status-machine";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import type { EmpresaPrintInputV3 } from "@/lib/operacoes-v3/print-model";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { useOrdemV3 } from "../hooks/use-ordem-v3";
import { useWorkspaceV3 } from "../hooks/use-workspace-v3";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL, formatData, formatDataHora } from "../lib/format";
import { matchOrdem, pagamentoInfo } from "../lib/os-derive";

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

// ---------------------------------------------------------------------------

function Picker() {
  const { ordens, loading, primeiraCarga, openOS, navigate, abrirNovaOS } = useOperacoesV3();
  const [q, setQ] = useState("");
  const lista = useMemo(() => ordens.filter((o) => matchOrdem(o, q)).slice(0, 24), [ordens, q]);

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.workspace.titulo}
      subtitulo={SCREEN_COPY.workspace.subtitulo}
      actions={
        <>
          <ButtonV3 variant="outline" onClick={() => navigate("fila")}>
            Ver fila completa
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={abrirNovaOS}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova OS
          </ButtonV3>
        </>
      }
    >
      <div className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Selecione uma OS para abrir o prontuário…"
          />
        </div>
      </div>
      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : lista.length === 0 ? (
        <EmptyStateV3
          icon={<FileText className="h-8 w-8" />}
          titulo="Selecione uma ordem de serviço"
          descricao="Escolha uma OS na fila ou busque acima para abrir o prontuário completo do equipamento."
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
  const { acaoEmConstrucao, navigate, openOS, storeId, reload: reloadLista, mudarStatus, notificar } = useOperacoesV3();
  const { empresaDocumentos } = useLojaAtiva();
  const pag = pagamentoInfo(os);
  const recepcao = lerRecepcaoV3(os);
  const [printOpen, setPrintOpen] = useState(false);

  // Dados da empresa para o cabeçalho do documento (unidade ativa, com fallback honesto no helper).
  const empresaPrint = useMemo<EmpresaPrintInputV3>(
    () => ({
      nomeFantasia: empresaDocumentos.nomeFantasia,
      razaoSocial: empresaDocumentos.razaoSocial,
      cnpj: empresaDocumentos.cnpj,
      endereco: empresaDocumentos.endereco,
      contato: empresaDocumentos.contato,
      logoUrl: empresaDocumentos.identidadeVisual?.logoUrl,
      responsavel: recepcao.recebidoPor,
    }),
    [empresaDocumentos, recepcao.recebidoPor],
  );

  const refresh = useCallback(() => {
    reloadOrdem();
    reloadLista();
  }, [reloadOrdem, reloadLista]);

  const wsActions = useWorkspaceV3(storeId, os.id, () => refresh());

  // Toda mudança de status passa pela máquina única (via contexto).
  const onMudarStatus = useCallback(
    async (to: OperacaoStatusV3): Promise<boolean> => {
      const ok = await mudarStatus(os.id, to);
      if (ok) reloadOrdem();
      return ok;
    },
    [mudarStatus, os.id, reloadOrdem],
  );

  const irPara = (id: string) =>
    typeof document !== "undefined" && document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const acao = (label: string) => (
    <ButtonV3 variant="subtle" onClick={() => acaoEmConstrucao(label)}>
      {label}
    </ButtonV3>
  );

  // Ações rápidas do cabeçalho (item 2) — navegam dentro do próprio prontuário.
  const quickActions = (
    <>
      <ButtonV3 variant="outline" onClick={() => irPara("checklist")}>
        <Pencil className="h-4 w-4" aria-hidden /> Editar
      </ButtonV3>
      <ButtonV3 variant="outline" onClick={() => setPrintOpen(true)}>
        <Printer className="h-4 w-4" aria-hidden /> Imprimir
      </ButtonV3>
      <ButtonV3 variant="outline" onClick={() => irPara("anexos")}>
        <Camera className="h-4 w-4" aria-hidden /> Anexos
      </ButtonV3>
      <ButtonV3 variant="outline" onClick={() => irPara("garantia")}>
        <ShieldCheck className="h-4 w-4" aria-hidden /> Garantia
      </ButtonV3>
      <ButtonV3 variant="outline" onClick={() => irPara("historico")}>
        <History className="h-4 w-4" aria-hidden /> Histórico
      </ButtonV3>
    </>
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

      <OSHeaderV3 os={os} actions={quickActions} />
      <OSCommandBarV3 os={os} onMudarStatus={onMudarStatus} onAcao={acaoEmConstrucao} />
      <OSTimelineV3 os={os} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Coluna principal — prontuário do equipamento */}
        <div className="min-w-0 space-y-3">
          <OSSectionV3
            titulo="Identificação / Atendimento"
            tone="info"
            resumo={`${os.cliente?.nome ?? "Cliente"} · ${[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ") || os.equipamento?.tipo || "Equipamento"}`}
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KV label="Cliente" value={os.cliente?.nome} />
              <KV label="Documento" value={os.cliente?.documento} />
              <KV label="Telefone" value={os.cliente?.telefone} />
              <KV label="E-mail" value={os.cliente?.email} />
              <KV label="Tipo" value={os.equipamento?.tipo} />
              <KV label="Marca / modelo" value={[os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ")} />
              <KV label="Nº de série / IMEI" value={os.equipamento?.numeroSerie} />
              <KV label="Origem" value={recepcao.origem ?? os.origem} />
              <KV label="Recebido por" value={recepcao.recebidoPor} />
            </dl>
            {os.equipamento?.defeitoRelatado ? (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">Defeito relatado</p>
                <p className="mt-0.5 text-sm text-foreground">{os.equipamento.defeitoRelatado}</p>
              </div>
            ) : null}
          </OSSectionV3>

          {/* Checklist de entrada (item 4) — editável + persistível */}
          <ChecklistEntradaV3
            os={os}
            storeId={storeId}
            onChanged={refresh}
            salvar={wsActions.salvarChecklist}
            pending={wsActions.pending === "checklist"}
            notificar={notificar}
          />

          {/* Senha + acessórios (item 5) — editável + persistível */}
          <SenhaAcessoriosV3
            os={os}
            storeId={storeId}
            onChanged={refresh}
            salvar={wsActions.salvarSenhaAcessorios}
            pending={wsActions.pending === "senha"}
            notificar={notificar}
          />

          {/* Diagnóstico técnico (item 6) — editável + persistível */}
          <DiagnosticoTecnicoV3
            os={os}
            storeId={storeId}
            onChanged={refresh}
            salvar={wsActions.salvarDiagnostico}
            pending={wsActions.pending === "diagnostico"}
            notificar={notificar}
          />

          {/* Orçamento — área comercial (Fase 1C anterior) */}
          <div id="orcamento">
            <OrcamentoPanelV3
              os={os}
              storeId={storeId}
              onChanged={refresh}
              onIniciarServico={() => onMudarStatus("em_execucao")}
              notificar={notificar}
            />
          </div>

          {/* Serviços executados (item 7) — somente leitura, sem custo interno */}
          <ServicosExecutadosV3 os={os} />

          <OSSectionV3
            titulo="Financeiro / Pagamento"
            tone="warning"
            statusVisual={pag.estado === "sem-cobranca" ? "sem cobrança" : "recebimento no PDV de Serviço"}
            resumo={`Total ${formatBRL(pag.total)}`}
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
                  <LinhaItem key={parc.numero} descricao={`Parcela ${parc.numero}`} detalhe={`Vence ${formatData(parc.vencimentoIso)}`} valor={parc.valor} />
                ))}
              </div>
            ) : null}
            <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              O recebimento real (PIX/dinheiro/cartão, parcial e quitação) é feito no PDV de Serviço e baixado no Financeiro — conectado em fase futura.
            </p>
          </OSSectionV3>

          <OSSectionV3
            titulo="Execução"
            tone={os.status === "em_execucao" ? "primary" : "neutral"}
            statusVisual={os.status === "em_execucao" ? "em andamento" : undefined}
            resumo="Checklist técnico de bancada (pós-reparo)"
            vazio={<p className="text-sm text-muted-foreground">Sem checklist técnico registrado nesta OS.</p>}
          >
            {os.checklistTecnico && os.checklistTecnico.length > 0 ? (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {os.checklistTecnico.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-success" : "bg-muted-foreground/40"}`} aria-hidden />
                    <span className="truncate text-foreground">{c.label}</span>
                  </div>
                ))}
              </div>
            ) : undefined}
          </OSSectionV3>

          <OSSectionV3
            titulo="Entrega"
            tone={os.status === "entregue" ? "success" : "neutral"}
            statusVisual={os.retirada?.confirmado ? "retirada confirmada" : os.entregueEm ? "entregue" : undefined}
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

          {/* Garantia (item 9) */}
          <GarantiaOSV3 os={os} onAcao={acaoEmConstrucao} />

          {/* Fotos & anexos (item 8) — estrutura MVP */}
          <AnexosV3 os={os} onAcao={acaoEmConstrucao} />

          {/* Histórico completo (item 10) — auditável */}
          <OSHistoricoV3 os={os} />
        </div>

        {/* Lateral de contexto */}
        <OSContextRailV3 os={os} onAbrirHistorico={() => navigate("historico")} onAcao={acaoEmConstrucao} />
      </div>

      {/* Rodapé utilitário */}
      <footer className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <ButtonV3 variant="outline" onClick={() => setPrintOpen(true)}>
          <Printer className="h-4 w-4" />
          Imprimir OS
        </ButtonV3>
        <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Imprimir etiqueta")}>
          <Tag className="h-4 w-4" />
          Etiqueta
        </ButtonV3>
        <ButtonV3 variant="outline" onClick={() => acaoEmConstrucao("Abrir portal do cliente")}>
          <Globe className="h-4 w-4" />
          Portal do cliente
        </ButtonV3>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />
          Prontuário do equipamento — tudo da OS em uma tela.
        </span>
      </footer>

      <PrintPreviewV3 open={printOpen} os={os} empresa={empresaPrint} onClose={() => setPrintOpen(false)} />
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
