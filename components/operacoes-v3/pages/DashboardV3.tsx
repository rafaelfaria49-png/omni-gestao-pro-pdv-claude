"use client";

import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { SectionShellV3 } from "../components/SectionShellV3";
import { MetricCardV3 } from "../components/MetricCardV3";
import { OSCardV3 } from "../components/OSCardV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL } from "../lib/format";
import { countByStatus, garantiasAtivas, isAtrasada, receitaEstimada } from "../lib/os-derive";

function ListaCurta({
  titulo,
  vazio,
  ordens,
  onOpen,
}: {
  titulo: string;
  vazio: string;
  ordens: ReturnType<typeof useOperacoesV3>["ordens"];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h3>
      {ordens.length > 0 ? (
        <div className="space-y-2">
          {ordens.slice(0, 6).map((os) => (
            <OSCardV3 key={os.id} os={os} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
          {vazio}
        </p>
      )}
    </div>
  );
}

export function DashboardV3() {
  const { ordens, loading, primeiraCarga, storeId, navigate, openOS } = useOperacoesV3();

  const dados = useMemo(() => {
    const counts = countByStatus(ordens);
    const atrasadas = ordens.filter(isAtrasada);
    const aguardando = ordens.filter((o) => o.status === "aguardando_aprovacao");
    return {
      counts,
      atrasadas,
      aguardando,
      garantias: garantiasAtivas(ordens).length,
      receita: receitaEstimada(ordens),
      total: ordens.length,
    };
  }, [ordens]);

  const actions = (
    <ButtonV3 variant="outline" onClick={() => navigate("fila")}>
      Abrir fila de OS
    </ButtonV3>
  );

  let body: ReactNode;
  if (!storeId) {
    body = <NoStoreBlockV3 />;
  } else if (primeiraCarga && loading) {
    body = <LoadingBlockV3 />;
  } else {
    body = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCardV3 label="OS abertas" value={dados.counts.aberta} tone="info" icon={<Inbox className="h-4 w-4" />} />
          <MetricCardV3 label="Aguardando aprovação" value={dados.counts.aguardando_aprovacao} tone="warning" icon={<Clock className="h-4 w-4" />} />
          <MetricCardV3 label="Em execução" value={dados.counts.em_execucao} tone="primary" icon={<Loader className="h-4 w-4" />} />
          <MetricCardV3 label="Prontas" value={dados.counts.pronta} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
          <MetricCardV3 label="Atrasadas" value={dados.atrasadas.length} tone="danger" icon={<AlertTriangle className="h-4 w-4" />} />
          <MetricCardV3 label="Receita estimada" value={formatBRL(dados.receita)} hint="Pipeline de orçamentos (não-canceladas)" icon={<TrendingUp className="h-4 w-4" />} />
          <MetricCardV3 label="Recebido hoje" estado="a-conectar" hint="Vem do Financeiro" icon={<Wallet className="h-4 w-4" />} />
          <MetricCardV3 label="Saldo em aberto" estado="a-conectar" hint="Vem do Financeiro" icon={<PiggyBank className="h-4 w-4" />} />
          <MetricCardV3 label="Garantias ativas" value={dados.garantias} tone="neutral" icon={<ShieldCheck className="h-4 w-4" />} />
        </div>

        {dados.total === 0 ? (
          <EmptyStateV3
            icon={<Inbox className="h-8 w-8" />}
            titulo="Nenhuma ordem de serviço nesta unidade"
            descricao="Quando houver OS cadastradas, os indicadores e listas aparecem aqui automaticamente."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ListaCurta
              titulo="Aguardando aprovação"
              vazio="Nenhuma OS aguardando aprovação."
              ordens={dados.aguardando}
              onOpen={openOS}
            />
            <ListaCurta
              titulo="Atrasadas (SLA estourado)"
              vazio="Nenhuma OS atrasada. 👏"
              ordens={dados.atrasadas}
              onOpen={openOS}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.dashboard.titulo}
      subtitulo={SCREEN_COPY.dashboard.subtitulo}
      actions={storeId ? actions : undefined}
    >
      {body}
    </SectionShellV3>
  );
}
