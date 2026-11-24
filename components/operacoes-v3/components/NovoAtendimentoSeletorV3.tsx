"use client";

// ============================================================================
// Operações V3 — seletor "Novo atendimento" (GOAL OPERACOES-V3-NOVA-OS-SELETOR-003)
// ----------------------------------------------------------------------------
// Aberto pelo "Nova OS" da V3. Só escolhe o fluxo — não persiste nada:
//   • Nova OS            → modal Nova OS Enterprise (inalterado);
//   • Orçamento          → o mesmo modal em modo orçamento (pré-OS, sem recebimento);
//   • Retorno / Garantia → localizar a OS original e abrir o retorno vinculado.
// Mesma linguagem visual do launcher da V4, com os tokens da V3.
// ============================================================================

import { useEffect, useRef, useState, type KeyboardEvent as TecladoEvent } from "react";
import { ArrowRight, FileText, RotateCcw, Wrench, X } from "lucide-react";
import {
  NOVO_ATENDIMENTO_COPY_V3,
  NOVO_ATENDIMENTO_OPCOES_V3,
  type NovoAtendimentoModalidadeV3,
} from "@/lib/operacoes-v3/novo-atendimento-seletor";
import styles from "../operacoes-v3-skin.module.css";

const ICONES: Record<NovoAtendimentoModalidadeV3, typeof Wrench> = {
  os: Wrench,
  orcamento: FileText,
  retorno: RotateCcw,
};

const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  onEscolher: (id: NovoAtendimentoModalidadeV3) => void;
}

export function NovoAtendimentoSeletorV3({ open, onClose, onEscolher }: Props) {
  if (!open) return null;
  return <SeletorConteudo onClose={onClose} onEscolher={onEscolher} />;
}

function SeletorConteudo({ onClose, onEscolher }: Omit<Props, "open">) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const primeiroRef = useRef<HTMLButtonElement>(null);
  // Gatilho ("Nova OS") lido antes do foco entrar aqui: fechar devolve o foco a ele.
  const [gatilho] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const escolhido = useRef(false);

  useEffect(() => {
    primeiroRef.current?.focus();
    return () => {
      if (!escolhido.current && gatilho?.isConnected) gatilho.focus();
    };
  }, [gatilho]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tab/Shift+Tab circulam só dentro do seletor.
  const teclado = (e: TecladoEvent<HTMLDivElement>) => {
    const d = dialogoRef.current;
    if (e.key !== "Tab" || !d) return;
    const itens = Array.from(d.querySelectorAll<HTMLElement>(FOCAVEIS));
    if (!itens.length) return;
    const primeiro = itens[0]!;
    const ultimo = itens[itens.length - 1]!;
    const ativo = document.activeElement;
    if (!ativo || !itens.includes(ativo as HTMLElement)) {
      e.preventDefault();
      (e.shiftKey ? ultimo : primeiro).focus();
    } else if (e.shiftKey && ativo === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && ativo === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  const escolher = (id: NovoAtendimentoModalidadeV3) => {
    escolhido.current = true;
    onEscolher(id);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-label="Fechar" tabIndex={-1} className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="v3-novo-atendimento-titulo"
        aria-describedby="v3-novo-atendimento-sub"
        onKeyDown={teclado}
        className={`${styles.popIn} relative flex max-h-[92vh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-[420px] sm:rounded-2xl`}
      >
        <header className="flex flex-none items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id="v3-novo-atendimento-titulo" className="text-base font-bold tracking-tight text-foreground">
              {NOVO_ATENDIMENTO_COPY_V3.titulo}
            </h2>
            <p id="v3-novo-atendimento-sub" className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              {NOVO_ATENDIMENTO_COPY_V3.subtitulo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex min-w-0 flex-col gap-2 overflow-y-auto p-3">
          {NOVO_ATENDIMENTO_OPCOES_V3.map((opcao, i) => {
            const Icone = ICONES[opcao.id];
            return (
              <button
                key={opcao.id}
                ref={i === 0 ? primeiroRef : undefined}
                type="button"
                data-opcao={opcao.id}
                onClick={() => escolher(opcao.id)}
                className="group flex w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span aria-hidden className="w-1 flex-none bg-primary/35 group-hover:bg-primary" />
                <span className="flex min-w-0 flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
                  <span className="inline-flex h-[18px] self-start items-center rounded-full bg-primary/10 px-[7px] text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
                    {opcao.chip}
                  </span>
                  <span className="flex min-w-0 items-baseline justify-between gap-2.5">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-bold tracking-tight text-foreground">
                      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{opcao.titulo}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">{opcao.descricao}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
