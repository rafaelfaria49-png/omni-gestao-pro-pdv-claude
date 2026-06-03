"use client";

import { useMemo } from "react";
import { Plus, Wrench } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { EmptyStateV3 } from "../components/EmptyStateV3";
import { ButtonV3 } from "../components/UiV3";
import { LoadingBlockV3, NoStoreBlockV3 } from "../components/ScreenStateV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL } from "../lib/format";

interface ServicoAgregado {
  descricao: string;
  ocorrencias: number;
  somaValor: number;
}

function agregarServicos(ordens: OrdemServico[]): ServicoAgregado[] {
  const map = new Map<string, ServicoAgregado>();
  const add = (descricao: string, valor: number) => {
    const nome = descricao.trim();
    if (!nome) return;
    const key = nome.toLowerCase();
    const cur = map.get(key) ?? { descricao: nome, ocorrencias: 0, somaValor: 0 };
    cur.ocorrencias += 1;
    cur.somaValor += Number.isFinite(valor) ? valor : 0;
    map.set(key, cur);
  };
  for (const os of ordens) {
    for (const s of os.orcamento?.servicos ?? []) add(s.descricao, s.valor ?? 0);
    for (const s of os.servicosCatalogo ?? []) add(s.descricao, s.valorVenda ?? 0);
  }
  return [...map.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
}

export function ServicosV3() {
  const { ordens, loading, primeiraCarga, storeId, acaoEmConstrucao } = useOperacoesV3();
  const servicos = useMemo(() => agregarServicos(ordens), [ordens]);

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY.servicos.titulo} subtitulo={SCREEN_COPY.servicos.subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  const actions = (
    <ButtonV3 variant="primary" onClick={() => acaoEmConstrucao("Cadastrar serviço")}>
      <Plus className="h-4 w-4" />
      Novo serviço
    </ButtonV3>
  );

  return (
    <SectionShellV3
      titulo={SCREEN_COPY.servicos.titulo}
      subtitulo={SCREEN_COPY.servicos.subtitulo}
      badge={<ConstructionBadgeV3 variant="conectar" label="Catálogo a conectar" />}
      actions={actions}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Lista <strong>real</strong> de serviços observados nas OS desta unidade. O catálogo oficial e o CRUD
        (criar/editar/excluir) ficam <strong>a conectar</strong> — o botão acima é um placeholder honesto.
      </p>

      {primeiraCarga && loading ? (
        <LoadingBlockV3 />
      ) : servicos.length === 0 ? (
        <EmptyStateV3
          icon={<Wrench className="h-8 w-8" />}
          titulo="Nenhum serviço observado ainda"
          descricao="Conforme as OS recebem serviços, eles aparecem agregados aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Serviço</th>
                <th className="px-3 py-2 text-right font-medium">Ocorrências</th>
                <th className="px-3 py-2 text-right font-medium">Valor médio</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={s.descricao} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-foreground">{s.descricao}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.ocorrencias}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                    {s.ocorrencias > 0 ? formatBRL(s.somaValor / s.ocorrencias) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShellV3>
  );
}
