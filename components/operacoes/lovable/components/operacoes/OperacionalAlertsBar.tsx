"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import type { ProdutoDTO } from "@/app/actions/cadastros";
import { normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import { cn } from "@/lib/utils";

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export function OperacionalAlertsBar({
  os,
  produtosCatalogo = [],
}: {
  os: OrdemServico;
  produtosCatalogo?: ProdutoDTO[];
}) {
  const st = normalizeOperacaoStatus(os.status);

  const alerts = useMemo(() => {
    const out: { key: string; tone: "warn" | "danger"; text: string }[] = [];

    if (st === "aguardando_aprovacao" && os.orcamento?.status === "enviado") {
      out.push({ key: "orc-pend", tone: "warn", text: "Orçamento enviado — aguardando resposta do cliente." });
    }

    if (st === "aguardando_peca") {
      out.push({ key: "ag-peca", tone: "warn", text: "Serviço pausado aguardando peça." });
    }

    const refParada = os.atualizadoEm || os.criadoEm;
    const idle = daysSince(refParada);
    if (idle >= 7 && (st === "em_execucao" || st === "aguardando_peca" || st === "diagnostico")) {
      out.push({ key: "idle", tone: "warn", text: `Sem movimento há ${idle} dias — verifique SLA.` });
    }

    if (st === "pronta") {
      const d = daysSince(os.atualizadoEm || os.criadoEm);
      if (d >= 3) {
        out.push({ key: "pronta", tone: "warn", text: `OS pronta há ${d} dias — retirada/entrega pendente.` });
      }
      if (!os.retirada?.confirmado) {
        out.push({ key: "pronta-sem-retirada", tone: "warn", text: "OS pronta — retirada ainda não confirmada." });
      }
    }

    if (["em_execucao", "pronta"].includes(st)) {
      const tech = os.checklistTecnico ?? [];
      if (tech.length === 0) {
        out.push({ key: "chk-tech-empty", tone: "warn", text: "Checklist técnico não preenchido — salve na seção técnica." });
      } else if (tech.some((x) => !x.ok)) {
        out.push({ key: "chk-tech-inc", tone: "warn", text: "Checklist técnico com itens pendentes." });
      }
    }

    if (["em_execucao", "pronta", "entregue", "aprovado", "aguardando_peca"].includes(st) && (os.anexos?.length ?? 0) === 0) {
      out.push({ key: "sem-anexo", tone: "warn", text: "Nenhum anexo na OS — considere registrar fotos/comprovantes." });
    }

    const garantias = os.garantiasOperacionais ?? [];
    if (garantias.some((x) => x.status === "expirada")) {
      out.push({ key: "gar-db-exp", tone: "danger", text: "Existe registro de garantia operacional expirada no banco." });
    }

    const gDb = garantias.find((x) => x.status === "ativa");
    if (gDb) {
      const left = daysUntil(gDb.dataFim);
      if (left !== null && left <= 7 && left >= 0) {
        out.push({ key: "gar-venc", tone: "warn", text: `Garantia operacional (banco) vence em ${left} dia(s).` });
      }
    } else if (os.garantia.ativa && os.garantia.fimEm) {
      const left = daysUntil(os.garantia.fimEm);
      if (left !== null && left <= 7 && left >= 0) {
        out.push({ key: "gar-payload", tone: "warn", text: `Garantia (payload) vence em ${left} dia(s).` });
      }
      if (left !== null && left < 0) {
        out.push({ key: "gar-payload-exp", tone: "danger", text: "Garantia (payload) expirada — verifique retorno." });
      }
    }

    for (const p of os.orcamento?.pecas ?? []) {
      const pid = (p.produtoId ?? "").trim();
      if (!pid) continue;
      const cat = produtosCatalogo.find((x) => x.id === pid);
      if (!cat) continue;
      if (cat.estoque < p.quantidade) {
        out.push({
          key: `est-${p.id}`,
          tone: "danger",
          text: `Estoque: “${p.nome}” precisa ${p.quantidade}, disponível ${cat.estoque}.`,
        });
      }
    }

    return out;
  }, [os, produtosCatalogo, st]);

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Alertas operacionais
      </div>
      <ul className="space-y-2 text-xs">
        {alerts.map((a) => (
          <li
            key={a.key}
            className={cn(
              "rounded-md border px-2 py-1.5",
              a.tone === "danger"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-amber-500/25 bg-amber-500/5 text-foreground/90",
            )}
          >
            {a.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
