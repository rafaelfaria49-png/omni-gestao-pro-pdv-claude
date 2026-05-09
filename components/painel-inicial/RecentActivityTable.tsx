"use client";

import Link from "next/link";
import { ArrowUpRight, ShoppingBag, Wrench } from "lucide-react";
import { DemoBadge } from "@/components/painel-inicial/DemoBadge";

type Row = {
  id: string;
  type: "venda" | "os";
  client: string;
  desc: string;
  value: string;
  status: "Concluída" | "Em andamento" | "Aguardando";
  time: string;
};

const rows: Row[] = [
  { id: "V-2841", type: "venda", client: "Marcos Almeida", desc: "Notebook Dell + Mouse", value: "R$ 4.890,00", status: "Concluída", time: "agora" },
  { id: "OS-1132", type: "os", client: "Padaria Bela Vista", desc: "Manutenção forno industrial", value: "R$ 1.250,00", status: "Em andamento", time: "12 min" },
  { id: "V-2840", type: "venda", client: "Júlia Mendes", desc: "Smartphone Galaxy A55", value: "R$ 2.199,00", status: "Concluída", time: "28 min" },
  { id: "OS-1131", type: "os", client: "Auto Posto Central", desc: "Instalação de câmeras", value: "R$ 3.480,00", status: "Aguardando", time: "1 h" },
  { id: "V-2839", type: "venda", client: "Carla Souza", desc: "Kit Home Office", value: "R$ 980,00", status: "Concluída", time: "2 h" },
];

const statusStyle: Record<Row["status"], string> = {
  "Concluída": "bg-success/10 text-success border-success/20",
  "Em andamento": "bg-primary/10 text-foreground border-border",
  "Aguardando": "bg-warning/15 text-warning border-warning/25",
};

export function RecentActivityTable() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-semibold text-[14px] tracking-tight">
              Atividades Recentes
            </h3>
            <DemoBadge>Exemplo</DemoBadge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Linhas fictícias — use Histórico de Vendas para dados reais
          </p>
        </div>
        <Link
          href="/dashboard/vendas-arquivo-geral"
          className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
        >
          Histórico de vendas <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.type === "venda" ? ShoppingBag : Wrench;
          return (
            <div
              key={r.id}
              className="px-5 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <div
                className={[
                  "h-7 w-7 rounded-md grid place-items-center shrink-0 border",
                  r.type === "venda"
                    ? "bg-muted border-border text-foreground"
                    : "bg-accent border-border text-accent-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13px] truncate">{r.client}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {r.id}
                  </span>
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                  {r.desc}
                </div>
              </div>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusStyle[r.status]}`}
              >
                {r.status}
              </span>
              <div className="text-right shrink-0 w-24">
                <div className="font-display font-semibold text-[12.5px] tabular-nums">
                  {r.value}
                </div>
                <div className="text-[10.5px] text-muted-foreground">{r.time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
