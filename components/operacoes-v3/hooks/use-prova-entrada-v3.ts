"use client";

// ============================================================================
// Operações V3 — SPRINT_3E.1 · estado client da Prova de Entrada
// Envolve as actions side-effect-free com pending/erro. onSuccess recarrega a OS.
// ============================================================================

import { useCallback, useState } from "react";
import type { OrdemServico } from "@/types/os";
import {
  adicionarFotoEntradaV3,
  removerFotoEntradaV3,
  salvarAcessoriosEntradaV3,
  salvarAssinaturaClienteV3,
  salvarIdentificacaoV3,
  salvarProvaEntradaV3,
  type AdicionarFotoEntradaInputV3,
  type SalvarProvaEntradaInputV3,
} from "@/lib/operacoes-v3/prova-entrada-actions";
import type { AcessorioEntradaV3, IdentificacaoV3 } from "@/lib/operacoes-v3/prova-entrada-model";

export type ProvaAcaoV3 = "prova" | "acessorios" | "foto" | "removerFoto" | "identificacao" | "assinatura";

export interface ProvaEntradaV3Actions {
  pending: ProvaAcaoV3 | null;
  error: string | null;
  salvarProva: (input: SalvarProvaEntradaInputV3) => Promise<boolean>;
  salvarAcessorios: (acessorios: AcessorioEntradaV3[]) => Promise<boolean>;
  adicionarFoto: (input: AdicionarFotoEntradaInputV3) => Promise<boolean>;
  removerFoto: (fotoId: string) => Promise<boolean>;
  salvarIdentificacao: (input: IdentificacaoV3) => Promise<boolean>;
  salvarAssinaturaCliente: (dataUrl: string, por?: string) => Promise<boolean>;
}

export function useProvaEntradaV3(
  storeId: string | null,
  osId: string | null,
  onSuccess?: (os: OrdemServico) => void,
): ProvaEntradaV3Actions {
  const [pending, setPending] = useState<ProvaAcaoV3 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (acao: ProvaAcaoV3, fn: (sid: string, id: string) => Promise<OrdemServico>) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setPending(acao);
      setError(null);
      try {
        const updated = await fn(sid, id);
        onSuccess?.(updated);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível salvar a prova de entrada.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [storeId, osId, onSuccess],
  );

  const salvarProva = useCallback((input: SalvarProvaEntradaInputV3) => run("prova", (sid, id) => salvarProvaEntradaV3(sid, id, input)), [run]);
  const salvarAcessorios = useCallback((acessorios: AcessorioEntradaV3[]) => run("acessorios", (sid, id) => salvarAcessoriosEntradaV3(sid, id, acessorios)), [run]);
  const adicionarFoto = useCallback((input: AdicionarFotoEntradaInputV3) => run("foto", (sid, id) => adicionarFotoEntradaV3(sid, id, input)), [run]);
  const removerFoto = useCallback((fotoId: string) => run("removerFoto", (sid, id) => removerFotoEntradaV3(sid, id, fotoId)), [run]);
  const salvarIdentificacao = useCallback((input: IdentificacaoV3) => run("identificacao", (sid, id) => salvarIdentificacaoV3(sid, id, input)), [run]);
  const salvarAssinaturaCliente = useCallback((dataUrl: string, por?: string) => run("assinatura", (sid, id) => salvarAssinaturaClienteV3(sid, id, dataUrl, por)), [run]);

  return { pending, error, salvarProva, salvarAcessorios, adicionarFoto, removerFoto, salvarIdentificacao, salvarAssinaturaCliente };
}
