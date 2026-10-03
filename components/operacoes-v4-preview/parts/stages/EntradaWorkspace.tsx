"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { derivarPendenciasEntradaV4 } from "@/lib/operacoes-v4/entrada-pendencias";
import {
  ENTRADA_GROUP_IDS,
  ROTULO_ESTADO_ENTRADA_V4,
  classificarGruposEntradaV4,
  entradaComplementadaV4,
  getEntradaGroup,
  isEntradaGroupDirty,
  isEntradaSectionDirty,
  primeiraAreaEntradaV4,
  type EntradaGroupId,
  type EntradaSectionId,
} from "@/lib/operacoes-v4/entrada-workspace";
import {
  mesclarNaoTocadas,
  toAcessoriosInput,
  toChecklistInput,
  toIdentificacaoInput,
  toProvaEntradaInput,
  type EntradaEditorV4,
} from "@/lib/operacoes-v4/entrada-form";
import { toDadosBasicosInput, type DadosBasicosEditorV4 } from "@/lib/operacoes-v4/dados-basicos-form";
import type { V4Vals } from "../../use-v4-preview";
import type { AcaoSaidaRascunhoV4 } from "../../use-entrada-draft-guard";
import { EntradaSectionRail } from "./EntradaSectionRail";
import { EntradaSections } from "./EntradaSections";
import styles from "./entrada-workspace.module.css";

/** Metadados publicados com o rascunho (R04): sujeira + ações de saída. */
export interface MetaPublicacaoRascunhoV4 {
  sujo: boolean;
  acoes: AcaoSaidaRascunhoV4 | null;
}

// T03/T04 (OPS-V4-FLUXO-CURTO-001): fatias mescláveis do rascunho.
// Cada chave compara de forma independente (ver `mesclarNaoTocadas` em
// lib/operacoes-v4/entrada-form.ts): fatia NÃO tocada adota o servidor;
// fatia tocada é preservada e, se o servidor também mudou, vira conflito.
const FATIAS_ED = ["identificacao", "estadoFisico", "avarias", "credenciais", "acessorios", "checklist"] as const;
type FatiaEd = (typeof FATIAS_ED)[number];
const FATIAS_DB = ["defeitoRelatado", "prioridade", "origem", "recebidoPor", "localFisico", "previsaoLocal", "observacoes"] as const;
type FatiaDb = (typeof FATIAS_DB)[number];

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rascunho do workspace por contexto (R04): sobrevive à troca de OS/loja. */
export interface RascunhoEntradaV4 {
  ed: EntradaEditorV4;
  db: DadosBasicosEditorV4;
  savedEd: EntradaEditorV4;
  savedDb: DadosBasicosEditorV4;
}

export function EntradaWorkspace({
  v,
  rascunhoInicial,
  onRascunhoChange,
}: {
  v: V4Vals;
  /** R04: rascunho salvo da chave loja+OS atual (restaura digitação ao voltar). */
  rascunhoInicial?: RascunhoEntradaV4 | undefined;
  /** R04: publica o rascunho a cada mudança (undefined = chave limpa). */
  onRascunhoChange?:
    | ((rascunho: RascunhoEntradaV4 | undefined, meta?: MetaPublicacaoRascunhoV4) => void)
    | undefined;
}) {
  // C (OPS-V4-FLUXO-CURTO-004): pendências e áreas derivam SÓ da OS real do
  // servidor. A área inicial é a primeira com complemento faltando, decidida
  // uma única vez por instância (chave loja+OS) com a carga estabelecida;
  // escolha manual ou edição congelam a área — refresh nunca a troca.
  const pendencias = useMemo(() => derivarPendenciasEntradaV4(v.realOS), [v.realOS]);
  const grupos = useMemo(() => classificarGruposEntradaV4(pendencias), [pendencias]);
  const cargaInicialPronta = v.cargaEntradaEstabelecida === true && grupos !== null;
  const [active, setActive] = useState<EntradaGroupId>(() =>
    cargaInicialPronta ? primeiraAreaEntradaV4(grupos) : "recepcao",
  );
  const areaDecididaRef = useRef(cargaInicialPronta);
  const [ed, setEd] = useState<EntradaEditorV4>(() => rascunhoInicial?.ed ?? v.entradaEditorSeed);
  const [db, setDb] = useState<DadosBasicosEditorV4>(() => rascunhoInicial?.db ?? v.dadosBasicosSeed);
  const [savedEd, setSavedEd] = useState<EntradaEditorV4>(() => rascunhoInicial?.savedEd ?? v.entradaEditorSeed);
  const [savedDb, setSavedDb] = useState<DadosBasicosEditorV4>(() => rascunhoInicial?.savedDb ?? v.dadosBasicosSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // R04: publica o rascunho para a guarda (stash por loja+OS), com sujeira e
  // ações de saída. Compara por JSON para não republicar sem mudança real.
  // (`dirty`, `salvarTudoParaSaida` e `descartarAlteracoes` vivem abaixo; o
  // efeito só roda pós-render, com tudo inicializado.)
  const rascunhoJson = JSON.stringify({ ed, db, savedEd, savedDb });
  const rascunhoPublicadoRef = useRef("");
  useEffect(() => {
    if (!onRascunhoChange) return;
    if (rascunhoPublicadoRef.current === rascunhoJson) return;
    rascunhoPublicadoRef.current = rascunhoJson;
    onRascunhoChange(
      { ed, db, savedEd, savedDb },
      { sujo: Object.values(dirty).some(Boolean), acoes: { salvar: salvarTudoParaSaida, descartar: descartarAlteracoes } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunhoJson]);

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

  const dirty = Object.fromEntries(
    ENTRADA_GROUP_IDS.map((id) => [id, isEntradaGroupDirty(id, ed, db, savedEd, savedDb)]),
  ) as Record<EntradaGroupId, boolean>;
  const algumDirty = Object.values(dirty).some(Boolean);
  const meta = getEntradaGroup(active);
  const estadoAtivo = grupos?.[active] ?? null;

  // T01: salvar exige carga estabelecida (detalhe confirmado da seleção).
  const cargaOk = v.cargaEntradaEstabelecida === true;
  const podeSalvar = cargaOk && !busy && conflitos.length === 0;

  // C: decide a área inicial quando a carga chega (uma vez). Se o operador já
  // editou antes da carga, a área atual fica.
  useEffect(() => {
    if (areaDecididaRef.current) return;
    if (!cargaOk || !grupos) return;
    areaDecididaRef.current = true;
    if (algumDirty) return;
    setActive(primeiraAreaEntradaV4(grupos));
  }, [cargaOk, grupos, algumDirty]);

  const markSectionSaved = (section: EntradaSectionId) => {
    if (section === "dados-basicos") setSavedDb(db);
    if (section === "identificacao") setSavedEd((current) => ({ ...current, identificacao: ed.identificacao }));
    if (section === "seguranca") setSavedEd((current) => ({ ...current, credenciais: ed.credenciais }));
    if (section === "estado-fisico") setSavedEd((current) => ({ ...current, estadoFisico: ed.estadoFisico, avarias: ed.avarias }));
    if (section === "checklist") setSavedEd((current) => ({ ...current, checklist: ed.checklist }));
    if (section === "acessorios") setSavedEd((current) => ({ ...current, acessorios: ed.acessorios }));
  };

  const persistSection = async (section: EntradaSectionId): Promise<boolean> => {
    if (section === "fotos") return true;
    let saved = false;
    if (section === "dados-basicos") saved = await v.salvarDadosBasicos(toDadosBasicosInput(db));
    // R02: a limpeza explícita é derivada no wrapper (input × semente do
    // servidor) — esta chamada mantém o contrato pinado de cinco handlers.
    if (section === "identificacao") saved = await v.salvarIdentificacao(toIdentificacaoInput(ed));
    // B (GOAL 004): salvar é localizado — Segurança leva só credenciais e
    // Inspeção só estado/avarias; a outra fatia viaja como a linha de base
    // (igual ao servidor), então o wrapper não a inclui.
    if (section === "seguranca") saved = await v.salvarProvaEntrada(toProvaEntradaInput({ ...ed, estadoFisico: savedEd.estadoFisico, avarias: savedEd.avarias }));
    if (section === "estado-fisico") saved = await v.salvarProvaEntrada(toProvaEntradaInput({ ...ed, credenciais: savedEd.credenciais }));
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

  // F/H (GOAL 004): registros explícitos de resposta válida sem alteração —
  // "nenhum acessório" e "estado exibido" (inclusive íntegro). Mesmas guardas
  // do salvar (carga, conflito, busy-lock); a baseline viaja pelo wrapper.
  // Falha mantém a área e o rascunho.
  const registrarExplicito = async (section: "acessorios" | "estado-fisico", gravar: () => Promise<boolean>) => {
    if (busy) return;
    if (!v.cargaEntradaEstabelecida) {
      setError(
        v.detailLoading
          ? "Aguarde a carga da OS antes de salvar."
          : "A OS não carregou corretamente. Recarregue antes de salvar.",
      );
      return;
    }
    if (conflitos.length > 0) {
      setError(`O servidor atualizou ${conflitos.join(", ")} enquanto você editava. Descarte suas alterações ou revise antes de salvar.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!(await gravar())) {
        setError("Não foi possível registrar. Tente novamente.");
        return;
      }
      markSectionSaved(section);
    } catch {
      setError("Não foi possível registrar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const registrarNenhumAcessorio = () =>
    void registrarExplicito("acessorios", () => v.salvarAcessorios(toAcessoriosInput(ed), { registrarSemAlteracao: true }));
  const confirmarEstadoFisico = () =>
    void registrarExplicito("estado-fisico", () =>
      v.salvarProvaEntrada(
        toProvaEntradaInput({ ...savedEd, estadoFisico: ed.estadoFisico, avarias: ed.avarias }),
        { confirmarEstadoFisico: true },
      ),
    );

  // T11: descartar volta o rascunho ao dado confirmado do servidor (sem PIN,
  // sem cópia em storage — só estado em memória).
  const descartarAlteracoes = () => {
    setEd(v.entradaEditorSeed);
    setDb(v.dadosBasicosSeed);
    setSavedEd(v.entradaEditorSeed);
    setSavedDb(v.dadosBasicosSeed);
    setError("");
  };

  // R04: salva TODOS os grupos sujos (a saída com edição suja persiste tudo,
  // não só o grupo visível). Falha recuperável: mantém o rascunho e o erro.
  const salvarTudoParaSaida = async (): Promise<boolean> => {
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
    setBusy(true);
    setError("");
    try {
      for (const group of ENTRADA_GROUP_IDS) {
        const sections = getEntradaGroup(group).sections.filter((section) =>
          section !== "fotos" && isEntradaSectionDirty(section, edRef.current, dbRef.current, savedEdRef.current, savedDbRef.current),
        );
        for (const section of sections) {
          const saved = await persistSection(section);
          if (!saved) {
            setError("Não foi possível salvar. Revise os campos e tente novamente.");
            return false;
          }
        }
      }
      return true;
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // B: navegação livre — trocar de área é imediato (o rascunho fica no pai) e
  // congela a escolha (C: refresh não troca a área).
  const selectGroup = (group: EntradaGroupId) => {
    areaDecididaRef.current = true;
    setError("");
    setActive(group);
  };

  return (
    <div className={styles.workspace}>
      <EntradaSectionRail
        active={active}
        grupos={grupos}
        dirty={dirty}
        complementada={entradaComplementadaV4(grupos)}
        onSelect={selectGroup}
      />
      <section className={styles.canvas} aria-labelledby={`entrada-title-${active}`}>
        <div className={styles.canvasInner}>
          <header className={styles.sectionHeader}>
            <div>
              <div className={styles.eyebrow}>{meta.eyebrow}</div>
              <h2 className={styles.sectionTitle} id={`entrada-title-${active}`}>{meta.label}</h2>
              <p className={styles.sectionDescription}>{meta.description}</p>
            </div>
            {dirty[active] ? (
              <span className={cn(styles.stateBadge, styles.stateBadgeDirty)}>Alterações não salvas</span>
            ) : estadoAtivo ? (
              <span
                className={cn(
                  styles.stateBadge,
                  estadoAtivo === "registrado" && styles.stateBadgeComplete,
                  estadoAtivo === "falta_complementar" && styles.stateBadgePending,
                )}
              >
                {ROTULO_ESTADO_ENTRADA_V4[estadoAtivo]}
              </span>
            ) : null}
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
            <EntradaSections group={active}
              v={v}
              ed={ed}
              setEd={setEd}
              db={db}
              setDb={setDb}
              pendencias={pendencias}
              acessoriosSujos={isEntradaSectionDirty("acessorios", ed, db, savedEd, savedDb)}
              estadoFisicoSujo={isEntradaSectionDirty("estado-fisico", ed, db, savedEd, savedDb)}
              podeRegistrar={podeSalvar}
              onRegistrarNenhumAcessorio={registrarNenhumAcessorio}
              onConfirmarEstadoFisico={confirmarEstadoFisico}
            />
            {error ? <div className={styles.error} role="alert">{error}</div> : null}
          </div>

          <footer className={styles.actionBar}>
            <div>
              {algumDirty && !busy ? <button type="button" className={styles.button} onClick={descartarAlteracoes}>Descartar alterações</button> : null}
            </div>
            {meta.canSave ? (
              <div className={styles.actionGroup}>
                <span className={styles.saveNote}>Sem salvamento automático</span>
                <button
                  type="button"
                  className={cn(styles.button, styles.buttonPrimary)}
                  onClick={() => void saveGroup(active)}
                  disabled={!podeSalvar || !dirty[active]}
                  title={!cargaOk ? "Aguarde a carga da OS" : !dirty[active] ? "Nada a salvar nesta área" : undefined}
                >
                  {busy ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            ) : null}
          </footer>
        </div>
      </section>
    </div>
  );
}
