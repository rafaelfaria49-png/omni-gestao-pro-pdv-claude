"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { derivarPendenciasEntradaV4 } from "@/lib/operacoes-v4/entrada-pendencias";
import {
  ENTRADA_GROUP_IDS,
  deriveEntradaGroupCompletion,
  entradaGroupProgress,
  getEntradaGroup,
  isEntradaGroupDirty,
  isEntradaSectionDirty,
  nextEntradaGroup,
  previousEntradaGroup,
  type EntradaGroupId,
  type EntradaSectionId,
} from "@/lib/operacoes-v4/entrada-workspace";
import {
  toAcessoriosInput,
  toChecklistInput,
  toIdentificacaoInput,
  toProvaEntradaInput,
  type EntradaEditorV4,
} from "@/lib/operacoes-v4/entrada-form";
import { toDadosBasicosInput, type DadosBasicosEditorV4 } from "@/lib/operacoes-v4/dados-basicos-form";
import type { V4Vals } from "../../use-v4-preview";
import { EntradaSectionRail } from "./EntradaSectionRail";
import { EntradaSections } from "./EntradaSections";
import styles from "./entrada-workspace.module.css";

// T03/T04 (OPS-V4-FLUXO-CURTO-001): fatias mescláveis do rascunho.
// Cada chave compara de forma independente: fatia NÃO tocada adota o servidor;
// fatia tocada é preservada e, se o servidor também mudou, vira conflito explícito.
const FATIAS_ED = ["identificacao", "estadoFisico", "avarias", "credenciais", "acessorios", "checklist"] as const;
type FatiaEd = (typeof FATIAS_ED)[number];
const FATIAS_DB = ["defeitoRelatado", "prioridade", "origem", "recebidoPor", "localFisico", "previsaoLocal", "observacoes"] as const;
type FatiaDb = (typeof FATIAS_DB)[number];

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Adota do servidor (`novo`) as chaves NÃO tocadas (iguais à linha de base
 * `salvo`); preserva as tocadas. Devolve o objeto mesclado e se algo mudou.
 */
function mesclarNaoTocadas<T extends Record<string, unknown>>(atual: T, salvo: T, novo: T): { valor: T; mudou: boolean } {
  const base: Record<string, unknown> = { ...atual };
  let mudou = false;
  for (const k of Object.keys(novo)) {
    if (!(k in atual) || !(k in salvo)) continue;
    if (igual(atual[k], salvo[k]) && !igual(atual[k], novo[k])) {
      base[k] = novo[k];
      mudou = true;
    }
  }
  return { valor: base as T, mudou };
}

export function EntradaWorkspace({ v }: { v: V4Vals }) {
  const [active, setActive] = useState<EntradaGroupId>("recepcao");
  const [ed, setEd] = useState<EntradaEditorV4>(() => v.entradaEditorSeed);
  const [db, setDb] = useState<DadosBasicosEditorV4>(() => v.dadosBasicosSeed);
  const [savedEd, setSavedEd] = useState<EntradaEditorV4>(() => v.entradaEditorSeed);
  const [savedDb, setSavedDb] = useState<DadosBasicosEditorV4>(() => v.dadosBasicosSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // T01/T03/T05: quando a semente do servidor muda (detalhe confirmado chegou,
  // refresh ou troca de seleção sem remount), adota as fatias NÃO tocadas e
  // preserva as tocadas. A linha de base (saved*) acompanha o servidor nas
  // fatias adotadas — sem ela, o próximo refresh pareceria conflito.
  const sementeJson = JSON.stringify({ os: v.selectedOsId, ed: v.entradaEditorSeed, db: v.dadosBasicosSeed });
  const sementeAplicadaRef = useRef("");
  useEffect(() => {
    if (sementeAplicadaRef.current === sementeJson) return;
    sementeAplicadaRef.current = sementeJson;
    const novaEd = { ...(v.entradaEditorSeed as unknown as Record<string, unknown>) };
    const novaDb = { ...(v.dadosBasicosSeed as unknown as Record<string, unknown>) };
    setEd((atual) => {
      const r = mesclarNaoTocadas(
        atual as unknown as Record<string, unknown>,
        savedEdRef.current as unknown as Record<string, unknown>,
        novaEd,
      );
      return r.mudou ? (r.valor as unknown as EntradaEditorV4) : atual;
    });
    setDb((atual) => {
      const r = mesclarNaoTocadas(
        atual as unknown as Record<string, unknown>,
        savedDbRef.current as unknown as Record<string, unknown>,
        novaDb,
      );
      return r.mudou ? (r.valor as unknown as DadosBasicosEditorV4) : atual;
    });
    setSavedEd((salvo) => {
      // A linha de base acompanha o servidor nas fatias que o operador NÃO
      // tocou (rascunho == salvo): sem isso, o próximo refresh pareceria conflito.
      const r = mesclarNaoTocadas(
        salvo as unknown as Record<string, unknown>,
        edRef.current as unknown as Record<string, unknown>,
        novaEd,
      );
      return r.mudou ? (r.valor as unknown as EntradaEditorV4) : salvo;
    });
    setSavedDb((salvo) => {
      const r = mesclarNaoTocadas(
        salvo as unknown as Record<string, unknown>,
        dbRef.current as unknown as Record<string, unknown>,
        novaDb,
      );
      return r.mudou ? (r.valor as unknown as DadosBasicosEditorV4) : salvo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sementeJson]);

  // Espelhos para leitura dentro do efeito acima sem religá-lo a cada digitação.
  const edRef = useRef(ed);
  const dbRef = useRef(db);
  const savedEdRef = useRef(savedEd);
  const savedDbRef = useRef(savedDb);
  edRef.current = ed;
  dbRef.current = db;
  savedEdRef.current = savedEd;
  savedDbRef.current = savedDb;

  // T04: fatias tocadas cujo servidor também mudou desde a linha de base.
  const conflitos = useMemo(() => {
    const lista: string[] = [];
    for (const f of FATIAS_ED) {
      if (!igual(ed[f], savedEd[f]) && !igual(v.entradaEditorSeed[f], savedEd[f])) lista.push(fatiaLabel(f));
    }
    for (const f of FATIAS_DB) {
      if (!igual(db[f], savedDb[f]) && !igual(v.dadosBasicosSeed[f], savedDb[f])) lista.push(fatiaLabel(f));
    }
    return lista;
  }, [ed, savedEd, db, savedDb, v.entradaEditorSeed, v.dadosBasicosSeed]);

  function fatiaLabel(f: string): string {
    const mapa: Record<string, string> = {
      identificacao: "identificação",
      estadoFisico: "estado físico",
      avarias: "avarias",
      credenciais: "credenciais",
      acessorios: "acessórios",
      checklist: "checklist",
      defeitoRelatado: "defeito relatado",
      prioridade: "prioridade",
      origem: "origem",
      recebidoPor: "recebido por",
      localFisico: "localização",
      previsaoLocal: "previsão",
      observacoes: "observações",
    };
    return mapa[f] ?? f;
  }

  const completion = useMemo(
    () => deriveEntradaGroupCompletion(derivarPendenciasEntradaV4(v.realOS)),
    [v.realOS],
  );
  const progress = entradaGroupProgress(completion);
  const dirty = Object.fromEntries(
    ENTRADA_GROUP_IDS.map((id) => [id, isEntradaGroupDirty(id, ed, db, savedEd, savedDb)]),
  ) as Record<EntradaGroupId, boolean>;
  const algumDirty = Object.values(dirty).some(Boolean);
  const meta = getEntradaGroup(active);
  const previous = previousEntradaGroup(active);
  const next = nextEntradaGroup(active);

  // T01: salvar exige carga estabelecida (detalhe confirmado da seleção).
  const cargaOk = v.cargaEntradaEstabelecida === true;
  const podeSalvar = cargaOk && !busy && conflitos.length === 0;

  const markSectionSaved = (section: EntradaSectionId) => {
    if (section === "dados-basicos") setSavedDb(db);
    if (section === "identificacao") setSavedEd((current) => ({ ...current, identificacao: ed.identificacao }));
    if (section === "seguranca" || section === "estado-fisico") {
      setSavedEd((current) => ({ ...current, credenciais: ed.credenciais, estadoFisico: ed.estadoFisico, avarias: ed.avarias }));
    }
    if (section === "checklist") setSavedEd((current) => ({ ...current, checklist: ed.checklist }));
    if (section === "acessorios") setSavedEd((current) => ({ ...current, acessorios: ed.acessorios }));
  };

  const persistSection = async (section: EntradaSectionId): Promise<boolean> => {
    if (section === "fotos") return true;
    let saved = false;
    if (section === "dados-basicos") saved = await v.salvarDadosBasicos(toDadosBasicosInput(db));
    if (section === "identificacao") saved = await v.salvarIdentificacao(toIdentificacaoInput(ed));
    if (section === "seguranca" || section === "estado-fisico") saved = await v.salvarProvaEntrada(toProvaEntradaInput(ed));
    if (section === "checklist") saved = await v.salvarChecklist(toChecklistInput(ed));
    if (section === "acessorios") saved = await v.salvarAcessorios(toAcessoriosInput(ed));
    if (!saved) return false;
    markSectionSaved(section);
    return true;
  };

  const saveGroup = async (group: EntradaGroupId): Promise<boolean> => {
    if (busy) return false;
    if (!v.cargaEntradaEstabelecida) {
      setError(
        v.detailLoading
          ? "Aguarde a carga da OS antes de salvar."
          : "A OS não carregou corretamente. Recarregue antes de salvar.",
      );
      return false;
    }
    if (conflitos.length > 0) {
      setError(`O servidor atualizou ${conflitos.join(", ")} enquanto você editava. Descarte suas alterações ou revise antes de salvar.`);
      return false;
    }
    const sections = getEntradaGroup(group).sections.filter((section) =>
      section !== "fotos" && isEntradaSectionDirty(section, ed, db, savedEd, savedDb),
    );
    if (sections.length === 0) return true;
    setBusy(true);
    setError("");
    try {
      for (const section of sections) {
        const saved = await persistSection(section);
        if (!saved) {
          setError("Não foi possível salvar este grupo. Revise os campos e tente novamente.");
          return false;
        }
      }
      return true;
    } catch {
      setError("Não foi possível salvar este grupo. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAndContinue = async () => {
    const saved = await saveGroup(active);
    if (saved && next) setActive(next);
  };

  // T11: descartar volta o rascunho ao dado confirmado do servidor (sem PIN,
  // sem cópia em storage — só estado em memória).
  const descartarAlteracoes = () => {
    setEd(v.entradaEditorSeed);
    setDb(v.dadosBasicosSeed);
    setSavedEd(v.entradaEditorSeed);
    setSavedDb(v.dadosBasicosSeed);
    setError("");
  };

  const selectGroup = (group: EntradaGroupId) => {
    setError("");
    setActive(group);
  };

  return (
    <div className={styles.workspace}>
      <EntradaSectionRail
        active={active}
        completion={completion}
        dirty={dirty}
        completed={progress.completed}
        total={progress.total}
        onSelect={selectGroup}
      />
      <section className={styles.canvas} aria-labelledby={`entrada-title-${active}`}>
        <div className={styles.canvasInner}>
          <header className={styles.sectionHeader}>
            <div>
              <div className={styles.eyebrow}>{String(meta.step).padStart(2, "0")} · {meta.eyebrow}</div>
              <h2 className={styles.sectionTitle} id={`entrada-title-${active}`}>{meta.label}</h2>
              <p className={styles.sectionDescription}>{meta.description}</p>
            </div>
            <span className={cn(styles.stateBadge, dirty[active] ? styles.stateBadgeDirty : completion[active] ? styles.stateBadgeComplete : undefined)}>
              {dirty[active] ? "Alterações não salvas" : completion[active] ? "Concluído" : "Pendente"}
            </span>
          </header>

          {!cargaOk ? (
            <div className={styles.error} role="status">
              {v.detailLoading ? "Carregando dados da OS… o salvamento libera após a carga." : "A OS não carregou corretamente — o salvamento está bloqueado até recarregar."}
            </div>
          ) : null}
          {conflitos.length > 0 ? (
            <div className={styles.error} role="alert">
              O servidor atualizou {conflitos.join(", ")} enquanto você editava. Revise os valores ou descarte suas alterações antes de salvar.
            </div>
          ) : null}

          <div className={styles.formBody}>
            <EntradaSections group={active} v={v} ed={ed} setEd={setEd} db={db} setDb={setDb} />
            {error ? <div className={styles.error} role="alert">{error}</div> : null}
          </div>

          <footer className={styles.actionBar}>
            <div>
              {previous ? <button type="button" className={styles.button} onClick={() => selectGroup(previous)} disabled={busy}>Anterior</button> : null}
              {algumDirty && !busy ? <button type="button" className={styles.button} onClick={descartarAlteracoes}>Descartar alterações</button> : null}
            </div>
            {meta.canSave ? (
              <div className={styles.actionGroup}>
                <span className={styles.saveNote}>Sem salvamento automático</span>
                <button type="button" className={styles.button} onClick={() => void saveGroup(active)} disabled={!podeSalvar} title={!cargaOk ? "Aguarde a carga da OS" : undefined}>{busy ? "Salvando…" : "Salvar"}</button>
                {next ? <button type="button" className={cn(styles.button, styles.buttonPrimary)} onClick={() => void saveAndContinue()} disabled={!podeSalvar} title={!cargaOk ? "Aguarde a carga da OS" : undefined}>{busy ? "Salvando…" : "Salvar e continuar"}</button> : null}
              </div>
            ) : null}
          </footer>
        </div>
      </section>
    </div>
  );
}
