import { useEffect, useRef, useState } from "react";

// ============================================================================
// Operações V4 — OPS-V4-FLUXO-CURTO-001 / R04 · guarda de rascunho da Entrada.
// ----------------------------------------------------------------------------
// O rascunho sujo vive em MEMÓRIA da sessão (Map por chave loja+OS detido pelo
// hook `useV4Preview`, que desmonta ao sair da V4) — nunca em storage genérico,
// nunca com PIN/dados pessoais persistidos. As saídas REAIS (trocar OS, limpar
// seleção, trocar loja) passam por `solicitarSaida`: sem sujeira a saída é
// imediata ("livre"); com sujeira a saída BLOQUEIA e abre o pêndulo
// salvar/descartar/cancelar. Cancelar impede a saída; salvar captura o alvo
// original (closures das ações registradas) e só libera a saída após sucesso.
// `limparTudo` é chamado ao perder loja/sessão. Sem React aqui embaixo (puro +
// inscritos); o hook só religa o render.
// ============================================================================

export interface AcaoSaidaRascunhoV4 {
  /** Persiste o rascunho da chave (captura o alvo original). `true` = saiu do sujo. */
  salvar: () => Promise<boolean>;
  /** Descarta o rascunho da chave (volta ao servidor). */
  descartar: () => void;
}

export interface RascunhoGuardadoV4<T = unknown> {
  rascunho: T;
  sujo: boolean;
  acoes: AcaoSaidaRascunhoV4 | null;
}

export interface SaidaPendenteV4 {
  chave: string;
  descricao: string;
}

interface PendenteInterno {
  chave: string;
  descricao: string;
  sair: () => void;
  salvar: (() => Promise<boolean>) | null;
  descartar: (() => void) | null;
}

export interface GuardaRascunhosV4<T = unknown> {
  obter(chave: string): RascunhoGuardadoV4<T> | undefined;
  publicar(chave: string, rascunho: T, sujo: boolean, acoes?: AcaoSaidaRascunhoV4 | null): void;
  limpar(chave: string): void;
  limparTudo(): void;
  sujo(chave: string): boolean;
  temSujo(): boolean;
  readonly pendente: SaidaPendenteV4 | null;
  solicitarSaida(sair: () => void, opts?: { chave?: string; descricao?: string }): "livre" | "bloqueada";
  confirmarSalvamento(): Promise<"saiu" | "aguardando">;
  confirmarDescarte(): "saiu" | "aguardando";
  cancelarSaida(): void;
}

/**
 * Puro: T11 — sair da etapa Entrada para outra etapa com rascunho sujo exige
 * o pêndulo salvar/descartar/cancelar. Qualquer outro deslocamento (entrar na
 * Entrada, navegar entre demais etapas, permanecer) nunca exige a guarda.
 */
export function saidaEtapaExigeGuardaV4(etapaAtual: string, etapaDestino: string): boolean {
  return (etapaAtual ?? "").trim() === "entrada" && (etapaDestino ?? "").trim() !== "entrada";
}

/** Puro (sem React): Map por chave + pêndulo de saída com inscritos. */
export function criarGuardaRascunhos<T = unknown>(): GuardaRascunhosV4<T> & {  subscribe: (fn: () => void) => () => void;
} {
  const rascunhos = new Map<string, RascunhoGuardadoV4<T>>();
  let pendente: PendenteInterno | null = null;
  const ouvintes = new Set<() => void>();
  const emitir = () => {
    for (const fn of Array.from(ouvintes)) {
      try {
        fn();
      } catch {
        /* ouvinte nunca quebra a guarda */
      }
    }
  };

  const chaveSujas = (): string | null => {
    for (const [chave, g] of rascunhos) {
      if (g.sujo) return chave;
    }
    return null;
  };

  const api = {
    obter(chave: string): RascunhoGuardadoV4<T> | undefined {
      return rascunhos.get(chave);
    },
    publicar(chave: string, rascunho: T, sujo: boolean, acoes?: AcaoSaidaRascunhoV4 | null): void {
      const anterior = rascunhos.get(chave);
      const mesmasAcoes = (anterior?.acoes ?? null) === (acoes ?? null);
      if (anterior && anterior.sujo === sujo && mesmasAcoes) {
        anterior.rascunho = rascunho;
        return;
      }
      rascunhos.set(chave, { rascunho, sujo, acoes: acoes ?? null });
      emitir();
    },
    limpar(chave: string): void {
      if (rascunhos.delete(chave)) emitir();
    },
    limparTudo(): void {
      const tinha = rascunhos.size > 0 || pendente !== null;
      rascunhos.clear();
      pendente = null;
      if (tinha) emitir();
    },
    sujo(chave: string): boolean {
      return rascunhos.get(chave)?.sujo === true;
    },
    temSujo(): boolean {
      return chaveSujas() !== null;
    },
    get pendente(): SaidaPendenteV4 | null {
      return pendente ? { chave: pendente.chave, descricao: pendente.descricao } : null;
    },
    solicitarSaida(sair: () => void, opts?: { chave?: string; descricao?: string }): "livre" | "bloqueada" {
      const chave = (opts?.chave ?? "").trim() || chaveSujas() || "";
      const descricao = (opts?.descricao ?? "").trim() || "sair da edição";
      // Sem sujeira (ou chave limpa): saída imediata, sem pêndulo.
      if (!chave || !rascunhos.get(chave)?.sujo) {
        // Troca o pêndulo anterior (se houver) — a saída nova supera a antiga.
        if (pendente !== null) {
          pendente = null;
          emitir();
        }
        sair();
        return "livre";
      }
      const g = rascunhos.get(chave);
      // Pêndulo aberto: Cancelar impede a saída; salvar/descartar decidem.
      pendente = {
        chave,
        descricao,
        sair,
        salvar: g?.acoes?.salvar ?? null,
        descartar: g?.acoes?.descartar ?? null,
      };
      emitir();
      return "bloqueada";
    },
    async confirmarSalvamento(): Promise<"saiu" | "aguardando"> {
      const p = pendente;
      if (!p) return "aguardando";
      // Sem ação de salvar registrada: permanece pendente (descarte/cancele).
      if (!p.salvar) return "aguardando";
      const ok = await p.salvar();
      if (!ok) return "aguardando";
      // Salvo com sucesso: o rascunho persistido é descartado da guarda e a
      // saída original (alvo capturado) é liberada.
      rascunhos.delete(p.chave);
      pendente = null;
      emitir();
      p.sair();
      return "saiu";
    },
    confirmarDescarte(): "saiu" | "aguardando" {
      const p = pendente;
      if (!p) return "aguardando";
      try {
        p.descartar?.();
      } catch {
        /* descarte best-effort; a saída segue */
      }
      rascunhos.delete(p.chave);
      pendente = null;
      emitir();
      p.sair();
      return "saiu";
    },
    cancelarSaida(): void {
      if (pendente === null) return;
      // Cancelar IMPEDE a saída: nada é salvo, nada é descartado, nada roda.
      pendente = null;
      emitir();
    },
    subscribe(fn: () => void): () => void {
      ouvintes.add(fn);
      return () => {
        ouvintes.delete(fn);
      };
    },
  };
  return api;
}

/** Hook: detém a guarda na sessão do componente (limpa ao desmontar). */
export function useGuardaRascunhos<T = unknown>(): GuardaRascunhosV4<T> {
  const ref = useRef<ReturnType<typeof criarGuardaRascunhos<T>> | null>(null);
  if (ref.current === null) ref.current = criarGuardaRascunhos<T>();
  const [, setVersao] = useState(0);
  useEffect(() => {
    const guarda = ref.current;
    if (!guarda) return;
    return guarda.subscribe(() => setVersao((v) => v + 1));
  }, []);
  return ref.current;
}
