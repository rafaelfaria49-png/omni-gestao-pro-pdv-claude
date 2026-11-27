"use client";

/**
 * Estado e salvamento da aba PDV e impressão (“Estação de caixa”).
 *
 * Três blocos independentes, como antes — caixa (fluxo, modo inicial, leitor), balança (visor) e impressão —,
 * gravados pela mesma barra, cada um com o seu PUT parcial (sem transação artificial): uma falha parcial é dita
 * como tal e só o bloco recusado continua pendente.
 *
 * Isolamento por unidade: a estação é remontada a cada troca de unidade (`PdvSection`), só edita e grava com as
 * configurações DESTA unidade carregadas (`loaded`) e confere a unidade antes de gravar. A guarda de troca de
 * unidade e de saída com pendências é a da PR #406 (Fase 2) — não há uma segunda infraestrutura aqui.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { usesClientExperience } from "@/lib/navigation/client-experience";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { useStoreBusiness } from "@/lib/use-store-business";
import { experimentalPdvEnabled } from "@/lib/feature-flags";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { defaultPdvImpressaoConfig, type PdvImpressaoConfig } from "@/lib/pdv-impressao-config";
import { configPadrao } from "@/lib/config-empresa";
import { writePdvMainLayout } from "@/lib/pdv-layout-storage";
import { notifyPdvMainLayoutChanged, writePdvClassicLayout } from "@/lib/pdv-classic-layout";
import { writeOmnigestaoPdvModoPreferencia } from "@/lib/omnigestao-pdv-modo";
import { nomeFantasiaOuFallbackUnidade } from "@/lib/store-display-name";
import { changedFields } from "../sections/settings-patch";
import {
  caixaPatch,
  effectiveModo,
  normalizeImpressao,
  PDV_FLOWS,
  readCaixa,
  safePrinterRecord,
  VISOR_FAILED_MSG,
  type CaixaDraft,
  type PdvBlockId,
  type PdvFailure,
  type PrintMode,
  type VisorState,
} from "./pdv-station-model";
import type { ReceiptStore } from "./ReceiptPreview";

const STORE_CHANGED_MSG = "A unidade ativa mudou ou ainda está carregando. Nada foi gravado; confira e salve de novo.";

export function usePdvStation() {
  const permissions = useEnterprisePermissions();
  const client = usesClientExperience(permissions) === true;
  const platform = permissions?.platformAuthority === true;
  const { toast } = useToast();
  const { lojaAtivaId, lojaAtivaRaw, empresaDocumentos, getEnderecoDocumentos } = useLojaAtiva();
  const store = useStoreSettings();
  const business = useStoreBusiness();
  const { hydrated, loaded, settings, refresh, storeId } = store;

  const noLoja = !lojaAtivaId?.trim();
  const lojaNome =
    lojaAtivaId && lojaAtivaRaw ? nomeFantasiaOuFallbackUnidade(lojaAtivaId, lojaAtivaRaw.nomeFantasia) : "Nenhuma unidade";
  const printerConfig = useMemo(() => safePrinterRecord(settings?.printerConfig), [settings?.printerConfig]);

  /*
   * Carregamento. Cada `refresh()` do provider volta `hydrated`/`loaded` para false até a releitura terminar:
   * o esqueleto aparece só antes da PRIMEIRA leitura desta unidade; depois, uma recarga (ex.: após salvar) apenas
   * trava os controles. Leitura que terminou sem dados (`hydrated && !loaded`) é falha: nada fica editável.
   */
  const [everLoaded, setEverLoaded] = useState(loaded);
  if (loaded && !everLoaded) setEverLoaded(true);
  const hasData = everLoaded;
  const initialLoading = !everLoaded && !hydrated;
  const loadFailed = hydrated && !loaded && !noLoja;
  const loading = !loaded && !loadFailed && !noLoja;

  /* ── Bloco “caixa”: baseline confirmado × rascunho (revalidação não apaga rascunho) ── */
  const [caixaSaved, setCaixaSaved] = useState<CaixaDraft>(() => readCaixa(printerConfig, lojaAtivaId));
  const [caixa, setCaixa] = useState<CaixaDraft>(caixaSaved);
  const caixaDirty = caixaPatch(caixaSaved, caixa) !== null;
  const caixaDirtyRef = useRef(false);
  useEffect(() => {
    caixaDirtyRef.current = caixaDirty;
  }, [caixaDirty]);
  useEffect(() => {
    if (!loaded || caixaDirtyRef.current) return;
    const next = readCaixa(printerConfig, lojaAtivaId);
    setCaixaSaved(next);
    setCaixa(next);
  }, [loaded, printerConfig, lojaAtivaId, storeId]);

  /* ── Bloco “impressão” ─────────────────────────────────────────────────── */
  const [impSaved, setImpSaved] = useState<PdvImpressaoConfig>(() => (loaded ? store.impressaoConfig : defaultPdvImpressaoConfig()));
  const [imp, setImp] = useState<PdvImpressaoConfig>(impSaved);
  const impChanges = changedFields(impSaved, imp);
  const impDirty = impChanges !== null;
  const impDirtyRef = useRef(false);
  useEffect(() => {
    impDirtyRef.current = impDirty;
  }, [impDirty]);
  useEffect(() => {
    if (!loaded || impDirtyRef.current) return;
    setImp(store.impressaoConfig);
    setImpSaved(store.impressaoConfig);
  }, [loaded, store.impressaoConfig, lojaAtivaId]);
  const patchImp = <K extends keyof PdvImpressaoConfig>(key: K, value: PdvImpressaoConfig[K]) =>
    setImp((prev) => ({ ...prev, [key]: value }));
  const impPending = (k: keyof PdvImpressaoConfig) => !!impChanges && k in impChanges;

  /* ── Bloco “balança”: salvo e rascunho num só estado, por unidade ─────── */
  const visorFromServer = (): VisorState | null =>
    business.ready && business.storeId
      ? { storeId: business.storeId, savedValue: business.pdvScaleVisorVisible, draft: business.pdvScaleVisorVisible }
      : null;
  const [visorState, setVisorState] = useState<VisorState | null>(visorFromServer);
  if (business.ready && business.storeId && visorState?.storeId !== business.storeId) {
    // Estado derivado no próprio render, como o antigo editor com key={storeId}: o 1º commit com o
    // controle visível já mostra o valor do servidor, e outra unidade nunca herda o rascunho.
    setVisorState(visorFromServer());
  }
  const visorDirty = !!visorState && visorState.draft !== visorState.savedValue;

  /* ── Salvar: blocos independentes, sem fingir atomicidade ─────────────── */
  const [saving, setSaving] = useState<PdvBlockId | null>(null);
  const [failures, setFailures] = useState<PdvFailure[]>([]);
  const [partialSaved, setPartialSaved] = useState(false);
  const [visorSavedNote, setVisorSavedNote] = useState(false);
  const inFlightRef = useRef(false);
  const failureOf = (block: PdvBlockId) => failures.find((f) => f.block === block);

  useEffect(() => {
    // Sincroniza com o servidor sobre o estado mais recente (nunca o de antes do clique); rascunho não é tocado.
    if (saving === "balanca" || !business.ready) return;
    const server = business.pdvScaleVisorVisible;
    const serverStore = business.storeId;
    setVisorState((v) =>
      !v || v.storeId !== serverStore || v.draft !== v.savedValue || (v.savedValue === server && v.draft === server)
        ? v
        : { ...v, savedValue: server, draft: server },
    );
  }, [business.pdvScaleVisorVisible, business.ready, business.storeId, visorDirty, saving]);

  const anyDirty = caixaDirty || impDirty || visorDirty;
  const flowPending = caixa.flow !== caixaSaved.flow;
  const modoPending = caixa.flow === "classico" && caixa.modo !== caixaSaved.modo;
  const scanPending = caixa.scan !== caixaSaved.scan;
  const pendingCount =
    (flowPending ? 1 : 0) + (modoPending ? 1 : 0) + (scanPending ? 1 : 0) + (visorDirty ? 1 : 0) + (impChanges ? Object.keys(impChanges).length : 0);
  const dirtyBlocks: PdvBlockId[] = [
    ...(caixaDirty ? (["caixa"] as const) : []),
    ...(visorDirty ? (["balanca"] as const) : []),
    ...(impDirty ? (["impressao"] as const) : []),
  ];

  /* ── Permissões (mesmas regras da implementação anterior) ─────────────── */
  const visibleFlows = PDV_FLOWS.filter((f) => {
    if (f.id === "next" && !experimentalPdvEnabled) return false;
    if (permissions?.platformAuthority) return true;
    if (f.id === "classico") return true;
    if (f.id === "assistencia") return permissions?.hubs?.operacoes === true;
    return permissions?.modules?.experiments === true;
  });
  const printMode: PrintMode = platform ? "platform" : client && permissions?.modules?.pdv ? "browser" : null;
  const showScale = business.canConfigure;
  const shortcuts = { whatsapp: permissions?.hubs?.whatsapp === true, operacoes: permissions?.hubs?.operacoes === true };

  const busy = !loaded || saving !== null;
  const disabled = busy || noLoja;

  const put = async (lojaHeader: string, body: unknown) => {
    const res = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}/settings`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: lojaHeader },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | { error?: string; ok?: boolean; settings?: { storeId?: string; printerConfig?: Record<string, unknown> } }
      | null;
    if (!res.ok) throw new Error(data?.error || `Falha ao salvar (HTTP ${res.status})`);
    return data;
  };

  const saveBlock = async (block: PdvBlockId, lojaHeader: string) => {
    if (block === "caixa") {
      const draft = caixa;
      const patch = caixaPatch(caixaSaved, draft);
      if (!patch) return;
      await put(lojaHeader, { printerConfig: patch });
      try {
        if (draft.flow === "supermercado") {
          writePdvMainLayout(lojaHeader, "supermercado");
          writeOmnigestaoPdvModoPreferencia("normal", lojaHeader);
        } else if (draft.flow === "next") {
          writePdvMainLayout(lojaHeader, "next");
          writeOmnigestaoPdvModoPreferencia("normal", lojaHeader);
        } else {
          writePdvMainLayout(lojaHeader, "classic");
          writePdvClassicLayout(draft.flow === "assistencia" ? "services" : "lovable", lojaHeader);
          writeOmnigestaoPdvModoPreferencia(draft.flow === "classico" && draft.modo === "rapido" ? "rapido" : "normal", lojaHeader);
        }
        notifyPdvMainLayoutChanged();
      } catch {
        /* espelhos locais: best-effort, como antes */
      }
      setCaixaSaved({ flow: draft.flow, modo: effectiveModo(draft), scan: draft.scan });
      await refresh().catch(() => {});
      return;
    }
    if (block === "balanca") {
      // Sem unidade pronta não há como confirmar a gravação: falha explícita, nunca “salvo” silencioso.
      if (!visorState || !business.ready || !business.canConfigure || business.storeId !== visorState.storeId) {
        throw new Error(VISOR_FAILED_MSG);
      }
      const { storeId: visorStore, draft } = visorState;
      const data = await put(visorStore, { printerConfig: { pdvScaleVisorVisible: draft } }).catch(() => {
        throw new Error(VISOR_FAILED_MSG);
      });
      if (data?.ok !== true || data?.settings?.storeId !== visorStore || data?.settings?.printerConfig?.pdvScaleVisorVisible !== draft) {
        throw new Error(VISOR_FAILED_MSG);
      }
      setVisorState((v) => (v && v.storeId === visorStore ? { ...v, savedValue: draft } : v));
      setVisorSavedNote(true);
      await business.refresh().catch(() => {});
      return;
    }
    // Impressão: primeiro o que foi editado; só esses campos são normalizados e enviados.
    const edited = changedFields(impSaved, imp);
    if (!edited) return;
    const normalized = normalizeImpressao(imp);
    const changes = Object.fromEntries(
      (Object.keys(edited) as Array<keyof PdvImpressaoConfig>).map((key) => [key, normalized[key]]),
    ) as Partial<PdvImpressaoConfig>;
    await put(lojaHeader, {
      printerConfig: { impressao: changes },
      // Rodapé geral só acompanha uma alteração explícita e não vazia do rodapé do cupom.
      ...(changes.rodapeCupom ? { receiptFooter: changes.rodapeCupom } : {}),
    });
    const merged: PdvImpressaoConfig = { ...impSaved, ...changes };
    setImp(merged);
    setImpSaved(merged);
    await refresh().catch(() => {});
  };

  const saveAll = async () => {
    if (inFlightRef.current) return; // dupla submissão: o segundo clique não grava de novo
    const lojaHeader = lojaAtivaId?.trim();
    if (!lojaHeader) {
      toast({ title: "Nenhuma unidade ativa", description: "Defina a unidade ativa na seção Lojas e tente novamente.", variant: "destructive" });
      return;
    }
    const blocks = dirtyBlocks;
    if (!loaded || storeId !== lojaHeader) {
      // Os rascunhos só valem para a unidade cujas configurações estão na tela.
      setFailures(blocks.map((block) => ({ block, message: STORE_CHANGED_MSG })));
      setPartialSaved(false);
      return;
    }
    inFlightRef.current = true;
    const failed: PdvFailure[] = [];
    const ok: PdvBlockId[] = [];
    setVisorSavedNote(false);
    try {
      for (const block of blocks) {
        setSaving(block);
        try {
          await saveBlock(block, lojaHeader);
          ok.push(block);
        } catch (e) {
          failed.push({ block, message: e instanceof Error ? e.message : "Erro inesperado" });
        }
      }
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
    setFailures(failed);
    setPartialSaved(ok.length > 0 && failed.length > 0);
    if (failed.length || !ok.length) return; // A barra explica a falha; sem toast duplicado sobre ela.
    if (ok.length === 1 && ok[0] === "caixa") {
      toast({ title: "PDV atualizado", description: "Recarregue o PDV que estiver aberto para aplicar." });
    } else if (ok.length === 1 && ok[0] === "impressao") {
      toast({ title: "Impressão salva", description: "O PDV desta unidade passará a usar estas preferências." });
    } else if (ok.length > 1) {
      toast({
        title: "Alterações salvas",
        description: ok.includes("caixa")
          ? "Recarregue o PDV que estiver aberto para aplicar o novo layout."
          : "O PDV desta unidade passará a usar estas preferências.",
      });
    }
  };

  const clearFailure = (block: PdvBlockId) => setFailures((f) => f.filter((x) => x.block !== block));
  const undoTela = () => setCaixa((d) => ({ ...d, flow: caixaSaved.flow, modo: caixaSaved.modo }));
  const undoLeitor = () => setCaixa((d) => ({ ...d, scan: caixaSaved.scan }));
  const undoCaixa = () => {
    setCaixa(caixaSaved);
    clearFailure("caixa");
  };
  const setVisorDraft = (v: boolean) => {
    setVisorState((s) => (s ? { ...s, draft: v } : s));
    setVisorSavedNote(false);
    clearFailure("balanca");
  };
  const undoVisor = () => {
    setVisorState((v) => (v ? { ...v, draft: v.savedValue } : v));
    clearFailure("balanca");
  };
  const undoImp = () => {
    setImp(impSaved);
    clearFailure("impressao");
  };
  const discardAll = () => {
    undoCaixa();
    undoVisor();
    undoImp();
    setFailures([]);
    setPartialSaved(false);
  };

  // Mesmas fontes do cupom real do PDV (pdv-classic: documentos da empresa + endereço + logo da unidade).
  const receiptStore: ReceiptStore = {
    nomeFantasia: (empresaDocumentos?.nomeFantasia || "").trim() || configPadrao.empresa.nomeFantasia,
    cnpj: (empresaDocumentos?.cnpj || "").trim() || configPadrao.empresa.cnpj,
    enderecoLinha: getEnderecoDocumentos?.() ?? "",
    logoUrl: lojaAtivaRaw?.logoUrl ?? null,
  };

  return {
    // contexto
    lojaNome,
    noLoja,
    hasLogo: !!lojaAtivaRaw?.logoUrl,
    receiptFooter: settings?.receiptFooter ?? null,
    receiptStore,
    visibleFlows,
    printMode,
    showScale,
    shortcuts,
    // carregamento e travas
    hasData,
    initialLoading,
    loadFailed,
    loading,
    disabled,
    // bloco caixa
    caixa,
    caixaSaved,
    setCaixa,
    flowPending,
    modoPending,
    scanPending,
    undoTela,
    undoLeitor,
    // bloco balança
    visorState,
    visorDirty,
    visorReady: business.ready,
    visorManual: typeof business.blob.pdvScaleVisorVisible === "boolean",
    businessHydrated: business.hydrated,
    visorSavedNote,
    setVisorDraft,
    undoVisor,
    // bloco impressão
    imp,
    impSaved,
    impDirty,
    patchImp,
    impPending,
    undoImp,
    // barra
    saving,
    failures,
    failureOf,
    partialSaved,
    anyDirty,
    pendingCount,
    dirtyBlocks,
    canSave: !saving && anyDirty && !noLoja && loaded,
    saveAll,
    discardAll,
  };
}

export type PdvStationState = ReturnType<typeof usePdvStation>;
