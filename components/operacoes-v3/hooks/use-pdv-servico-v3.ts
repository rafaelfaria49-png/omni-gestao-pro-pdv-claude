"use client";

// ============================================================================
// Operações V3 — Fase 2A/2B · estado do PDV de Serviço (client)
// ----------------------------------------------------------------------------
// Carrega o pagamento da OS (saldo/status + sessão de caixa) e expõe `receber`
// (com split + intenção), `estornar` (correção do último recebimento) e o
// `ultimoRecibo` para impressão do comprovante. Toda a lógica financeira fica no
// servidor (`pdv-servico-actions`). `registrarMisto` = pagamento imediato + saldo
// a prazo numa única confirmação, com `operacaoId` estável por confirmação.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estornarRecebimentoOSV3,
  lerPagamentoOSV3,
  receberOSV3,
  registrarRecebimentoMistoOSV3,
  type CaixaSessaoV3,
  type EstornarRecebimentoInputV3,
  type ReceberOSInputV3,
  type RegistrarRecebimentoMistoInputV3,
  type RegistrarRecebimentoMistoResultV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { aPrazoVisivelV3, type APrazoV3, type ComprovanteReciboV3, type PagamentoV3 } from "@/lib/operacoes-v3/payment-model";
import { conteudoRecebimentoCanonicoV3, gerarOperacaoIdV3 } from "@/lib/operacoes-v3/recebimento-misto-model";

export interface PdvServicoState {
  pagamento: PagamentoV3 | null;
  sessao: CaixaSessaoV3 | null;
  loading: boolean;
  recebendo: boolean;
  estornando: boolean;
  error: string | null;
  ultimoRecibo: ComprovanteReciboV3 | null;
  reload: () => void;
  receber: (input: ReceberOSInputV3) => Promise<boolean>;
  estornar: (input: EstornarRecebimentoInputV3) => Promise<boolean>;
  limparRecibo: () => void;
}

/** Dados de UMA confirmação mista (a `operacaoId` é do hook, estável por confirmação). */
export type DadosRecebimentoMistoV3 = Omit<RegistrarRecebimentoMistoInputV3, "operacaoId">;

/** Confirmação cujo resultado é DESCONHECIDO (erro de transporte): só pode ser reenviada com a mesma chave. */
export interface PendenciaRecebimentoMistoV3 {
  key: string;
  operacaoId: string;
  input: RegistrarRecebimentoMistoInputV3;
}

export type RegistroMistoResultadoUIV3 =
  | { status: "ok"; resultado: Extract<RegistrarRecebimentoMistoResultV3, { ok: true }> }
  | { status: "recusado"; code: string; mensagem: string; saldoAtual?: number }
  | { status: "incerto"; mensagem: string }
  | { status: "em_andamento" };

/** Superfície da V3 (aditiva). A V4 continua consumindo só `PdvServicoState`. */
export interface PdvServicoV3Completo extends PdvServicoState {
  /** Saldo a prazo PERSISTIDO na OS (lido do servidor), quando ainda há saldo. */
  aPrazo: APrazoV3 | null;
  registrandoMisto: boolean;
  pendenciaMisto: PendenciaRecebimentoMistoV3 | null;
  registrarMisto: (dados: DadosRecebimentoMistoV3) => Promise<RegistroMistoResultadoUIV3>;
}

export function projetarLeituraAtualPdvServicoV3(input: {
  targetKey: string | null;
  loadedKey: string | null;
  errorKey: string | null;
  pagamento: PagamentoV3 | null;
  sessao: CaixaSessaoV3 | null;
  loading: boolean;
  error: string | null;
}): Pick<PdvServicoState, "pagamento" | "sessao" | "loading" | "error"> {
  const carregadoParaAlvo = input.targetKey !== null && input.loadedKey === input.targetKey;
  const erroDoAlvo = input.targetKey !== null && input.errorKey === input.targetKey ? input.error : null;
  const carregandoAlvo = input.targetKey !== null && (input.loading || (!carregadoParaAlvo && input.errorKey !== input.targetKey));
  return {
    pagamento: carregadoParaAlvo ? input.pagamento : null,
    sessao: carregadoParaAlvo ? input.sessao : null,
    loading: carregandoAlvo,
    error: erroDoAlvo,
  };
}

export function usePdvServicoV3(storeId: string | null, osId: string | null): PdvServicoV3Completo {
  const sidAtual = (storeId ?? "").trim();
  const osIdAtual = (osId ?? "").trim();
  const targetKey = sidAtual && osIdAtual ? JSON.stringify([sidAtual, osIdAtual]) : null;
  const [pagamento, setPagamento] = useState<PagamentoV3 | null>(null);
  const [sessao, setSessao] = useState<CaixaSessaoV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [estornando, setEstornando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoRecibo, setUltimoRecibo] = useState<ComprovanteReciboV3 | null>(null);
  const [reciboKey, setReciboKey] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [aPrazo, setAPrazo] = useState<APrazoV3 | null>(null);
  const [registrandoMisto, setRegistrandoMisto] = useState(false);
  // Confirmações mistas com resultado DESCONHECIDO, uma por loja/OS: trocar de OS (ou ter
  // outra incerteza em outra OS) nunca descarta a pendência desta.
  const [pendenciasMisto, setPendenciasMisto] = useState<Record<string, PendenciaRecebimentoMistoV3>>({});
  const reqRef = useRef(0);
  const activeKeyRef = useRef(targetKey);
  // Travas SÍNCRONAS (antes do primeiro await): duplo clique nunca dispara 2 envios.
  const recebendoRef = useRef(false);
  const mistoEmVooRef = useRef(false);
  const pendenciasMistoRef = useRef<Record<string, PendenciaRecebimentoMistoV3>>({});
  // Recebimentos sem resultado confirmado, por loja/OS + conteúdo ECONÔMICO (o mesmo do
  // servidor: forma única e split iguais são o mesmo recebimento): reenviar reaproveita a
  // chave — se a tentativa original gravou (resposta perdida), o servidor devolve o já
  // gravado. Só o sucesso DAQUELE conteúdo libera a chave; outro recebimento no meio não.
  const receberPendentesRef = useRef(new Map<string, string>());
  // Saldo que a tela mostra para a OS carregada: vai junto do recebimento (concorrência
  // otimista) — gravar sobre um saldo que o operador não viu é recusado no servidor.
  const saldoVistoRef = useRef<{ key: string; saldo: number } | null>(null);
  // Atualização síncrona no render: a primeira renderização da OS B já mascara
  // qualquer snapshot que ainda pertença à OS A, antes mesmo de o effect rodar.
  activeKeyRef.current = targetKey;
  saldoVistoRef.current = loadedKey !== null && pagamento ? { key: loadedKey, saldo: pagamento.saldo } : null;

  const definirPendenciaMisto = useCallback((key: string, pendencia: PendenciaRecebimentoMistoV3 | null) => {
    const proximas = { ...pendenciasMistoRef.current };
    if (pendencia) proximas[key] = pendencia;
    else delete proximas[key];
    pendenciasMistoRef.current = proximas;
    setPendenciasMisto(proximas);
  }, []);

  useEffect(() => {
    const sid = sidAtual;
    const id = osIdAtual;
    const reqId = ++reqRef.current;
    setPagamento(null);
    setSessao(null);
    setAPrazo(null);
    setLoadedKey(null);
    setErrorKey(null);
    setError(null);
    if (!sid || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    lerPagamentoOSV3(sid, id)
      .then((res) => {
        if (reqRef.current !== reqId || activeKeyRef.current !== targetKey) return;
        const { sessao: s, aPrazo: ap, ...pag } = res;
        setPagamento(pag);
        setSessao(s);
        setAPrazo(ap ?? null);
        setLoadedKey(targetKey);
        setLoading(false);
      })
      .catch((e) => {
        if (reqRef.current !== reqId || activeKeyRef.current !== targetKey) return;
        setPagamento(null);
        setSessao(null);
        setAPrazo(null);
        setLoadedKey(null);
        setErrorKey(targetKey);
        setError(e instanceof Error ? e.message : "Falha ao carregar o pagamento da OS.");
        setLoading(false);
      });
  }, [sidAtual, osIdAtual, targetKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const limparRecibo = useCallback(() => setUltimoRecibo(null), []);

  const receber = useCallback(
    async (input: ReceberOSInputV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      // Duplo clique: o 2º chamado volta antes de qualquer await (sem 2º recebimento).
      if (recebendoRef.current) return false;
      recebendoRef.current = true;
      const key = JSON.stringify([sid, id]);
      const conteudo = JSON.stringify([sid, id, conteudoRecebimentoCanonicoV3(input)]);
      const operacaoId = input.operacaoId ?? receberPendentesRef.current.get(conteudo) ?? gerarOperacaoIdV3();
      const saldoEsperado = input.saldoEsperado ?? (saldoVistoRef.current?.key === key ? saldoVistoRef.current.saldo : undefined);
      setRecebendo(true);
      setError(null);
      try {
        const res = await receberOSV3(sid, id, { ...input, operacaoId, saldoEsperado });
        receberPendentesRef.current.delete(conteudo);
        if (activeKeyRef.current === key) {
          setPagamento(res.pagamento);
          // O servidor reconcilia o "a prazo" com o saldo real: a tela acompanha.
          setAPrazo(aPrazoVisivelV3(res.os, res.pagamento.saldo));
          setLoadedKey(key);
          setErrorKey(null);
          setUltimoRecibo(res.recibo);
          setReciboKey(key);
        }
        return true;
      } catch (e) {
        receberPendentesRef.current.set(conteudo, operacaoId);
        if (activeKeyRef.current === key) {
          setErrorKey(key);
          setError(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.");
        }
        // Resultado incerto ou saldo mudou: relê o saldo REAL (mantendo o erro na tela) para o
        // operador ver se o recebimento entrou antes de confirmar de novo.
        lerPagamentoOSV3(sid, id)
          .then((atual) => {
            if (activeKeyRef.current !== key) return;
            const { sessao: s, aPrazo: ap, ...pag } = atual;
            setPagamento(pag);
            setSessao(s);
            setAPrazo(ap ?? null);
            setLoadedKey(key);
          })
          .catch(() => undefined);
        return false;
      } finally {
        recebendoRef.current = false;
        setRecebendo(false);
      }
    },
    [storeId, osId],
  );

  const registrarMisto = useCallback(
    async (dados: DadosRecebimentoMistoV3): Promise<RegistroMistoResultadoUIV3> => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return { status: "recusado", code: "entrada_invalida", mensagem: "Selecione a OS." };
      // Trava síncrona ANTES do primeiro await: o 2º clique nunca chega ao servidor.
      if (mistoEmVooRef.current) return { status: "em_andamento" };
      mistoEmVooRef.current = true;
      const key = JSON.stringify([sid, id]);
      // Resultado anterior DESCONHECIDO nesta OS: reenvia exatamente a mesma operação
      // (mesma chave) para reconciliar — nunca gera chave nova por conta própria.
      const pendente = pendenciasMistoRef.current[key] ?? null;
      const input: RegistrarRecebimentoMistoInputV3 = pendente ? pendente.input : { ...dados, operacaoId: gerarOperacaoIdV3() };
      setRegistrandoMisto(true);
      setError(null);
      try {
        const res = await registrarRecebimentoMistoOSV3(sid, id, input);
        // A chave de uma operação incerta só é liberada quando o servidor dá o resultado
        // TERMINAL dela: gravada (ok) ou recusada de vez (`naoRegistrada`). Recusa sem
        // conferência (sessão, permissão, conflito transitório) mantém a pendência.
        if ((res.ok || res.naoRegistrada) && pendenciasMistoRef.current[key]?.operacaoId === input.operacaoId) {
          definirPendenciaMisto(key, null);
        }
        if (!res.ok) {
          if (activeKeyRef.current === key) {
            setErrorKey(key);
            setError(res.mensagem);
          }
          return { status: "recusado", code: res.code, mensagem: res.mensagem, saldoAtual: res.saldoAtual };
        }
        if (activeKeyRef.current === key) {
          setPagamento(res.pagamento);
          setAPrazo(aPrazoVisivelV3({ aPrazoV3: res.aPrazo }, res.pagamento.saldo));
          setLoadedKey(key);
          setErrorKey(null);
          setUltimoRecibo(res.recibo);
          setReciboKey(key);
        }
        return { status: "ok", resultado: res };
      } catch {
        definirPendenciaMisto(key, { key, operacaoId: input.operacaoId, input });
        const mensagem =
          "Não foi possível confirmar se o registro foi gravado. Reenvie a MESMA operação para verificar — não haverá lançamento em dobro.";
        if (activeKeyRef.current === key) {
          setErrorKey(key);
          setError(mensagem);
        }
        return { status: "incerto", mensagem };
      } finally {
        mistoEmVooRef.current = false;
        setRegistrandoMisto(false);
      }
    },
    [storeId, osId, definirPendenciaMisto],
  );

  const estornar = useCallback(
    async (input: EstornarRecebimentoInputV3) => {
      const sid = (storeId ?? "").trim();
      const id = (osId ?? "").trim();
      if (!sid || !id) return false;
      setEstornando(true);
      setError(null);
      try {
        const res = await estornarRecebimentoOSV3(sid, id, input);
        const key = JSON.stringify([sid, id]);
        if (activeKeyRef.current === key) {
          setPagamento(res.pagamento);
          setAPrazo(aPrazoVisivelV3(res.os, res.pagamento.saldo));
          setLoadedKey(key);
          setErrorKey(null);
        }
        return true;
      } catch (e) {
        if (activeKeyRef.current === JSON.stringify([sid, id])) {
          setErrorKey(JSON.stringify([sid, id]));
          setError(e instanceof Error ? e.message : "Não foi possível estornar o recebimento.");
        }
        return false;
      } finally {
        setEstornando(false);
      }
    },
    [storeId, osId],
  );

  const leituraAtual = projetarLeituraAtualPdvServicoV3({ targetKey, loadedKey, errorKey, pagamento, sessao, loading, error });
  const carregadoParaAlvo = targetKey !== null && loadedKey === targetKey;
  return {
    pagamento: leituraAtual.pagamento,
    sessao: leituraAtual.sessao,
    loading: leituraAtual.loading,
    recebendo,
    estornando,
    error: leituraAtual.error,
    // Comprovante pertence à OS em que foi emitido: trocar de OS/loja nunca o reaproveita.
    ultimoRecibo: targetKey !== null && reciboKey === targetKey ? ultimoRecibo : null,
    reload,
    receber,
    estornar,
    limparRecibo,
    aPrazo: carregadoParaAlvo ? aPrazo : null,
    registrandoMisto,
    pendenciaMisto: targetKey !== null ? (pendenciasMisto[targetKey] ?? null) : null,
    registrarMisto,
  };
}
