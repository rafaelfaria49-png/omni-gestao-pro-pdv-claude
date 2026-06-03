"use client";

import type { ReactNode } from "react";
import { Activity, History, MessageCircle, Paperclip, StickyNote } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { formatRelativo } from "../lib/format";
import { ConstructionBadgeV3 } from "./ConstructionBadgeV3";
import { ButtonV3 } from "./UiV3";

function RailCard({
  icon,
  titulo,
  badge,
  children,
}: {
  icon: ReactNode;
  titulo: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{titulo}</h4>
        {badge}
      </div>
      {children}
    </div>
  );
}

function RailEmpty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Lateral de contexto da OS: timeline, comunicação, anexos, observações, histórico. */
export function OSContextRailV3({
  os,
  onAbrirHistorico,
  onAcao,
}: {
  os: OrdemServico;
  onAbrirHistorico?: () => void;
  onAcao: (label: string) => void;
}) {
  const timeline = [...(os.timeline ?? [])].reverse().slice(0, 12);
  const anexos = os.anexos ?? [];
  const observacoes = os.observacoes ?? [];

  return (
    <aside className="space-y-3">
      <RailCard icon={<Activity className="h-4 w-4" />} titulo="Linha do tempo">
        {timeline.length > 0 ? (
          <ol className="space-y-3">
            {timeline.map((ev) => (
              <li key={ev.id} className="relative pl-4">
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                <p className="text-xs text-foreground">{ev.conteudo}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {ev.autor} · {formatRelativo(ev.criadoEm)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <RailEmpty>Sem eventos registrados ainda.</RailEmpty>
        )}
      </RailCard>

      <RailCard
        icon={<MessageCircle className="h-4 w-4" />}
        titulo="Comunicação"
        badge={<ConstructionBadgeV3 />}
      >
        <RailEmpty>O envio de WhatsApp/SMS pela OS chega na próxima fase.</RailEmpty>
        <ButtonV3 variant="subtle" className="mt-2 w-full" onClick={() => onAcao("Enviar mensagem ao cliente")}>
          Enviar mensagem
        </ButtonV3>
      </RailCard>

      <RailCard icon={<Paperclip className="h-4 w-4" />} titulo={`Anexos (${anexos.length})`}>
        {anexos.length > 0 ? (
          <ul className="space-y-1.5">
            {anexos.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs text-foreground">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{a.nome}</span>
              </li>
            ))}
          </ul>
        ) : (
          <RailEmpty>Nenhum anexo nesta OS.</RailEmpty>
        )}
      </RailCard>

      <RailCard icon={<StickyNote className="h-4 w-4" />} titulo={`Observações (${observacoes.length})`}>
        {observacoes.length > 0 ? (
          <ul className="space-y-2">
            {observacoes.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-md border border-border bg-muted/30 p-2 text-xs text-foreground">
                <p className="whitespace-pre-wrap">{o.conteudo}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {o.autor}
                  {o.interna ? " · interna" : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <RailEmpty>Nenhuma observação registrada.</RailEmpty>
        )}
      </RailCard>

      <RailCard
        icon={<History className="h-4 w-4" />}
        titulo="Histórico do cliente"
        badge={<ConstructionBadgeV3 variant="conectar" />}
      >
        <RailEmpty>Veja todas as OS deste cliente na tela de Histórico.</RailEmpty>
        <ButtonV3 variant="outline" className="mt-2 w-full" onClick={() => onAbrirHistorico?.()}>
          Abrir histórico do cliente
        </ButtonV3>
      </RailCard>
    </aside>
  );
}
