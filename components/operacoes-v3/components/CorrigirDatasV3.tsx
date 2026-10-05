"use client";

// ============================================================================
// Operações V3/V4 — "Corrigir datas" (estado compartilhado + modal da V3)
// (GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001)
// ----------------------------------------------------------------------------
// O estado/validação vivem em `useCorrigirDatas` (V3 e V4 usam o mesmo); cada
// versão desenha o próprio modal. A baseline (o que o operador VIU) é capturada
// ao abrir — recarga da OS no meio não troca a referência em silêncio: o
// servidor devolve conflito e o formulário continua aberto com os dados.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertCircle, CalendarClock, Loader2, ShieldCheck, X } from "lucide-react";
import type { OrdemServico } from "@/types/os";
import { corrigirDatasOSV3 } from "@/lib/operacoes-v3/datas-correcao-actions";
import {
  camposCorrigiveisV3,
  planejarCorrecaoDatasV3,
  MOTIVO_MAX_V3,
  type CampoCorrecaoDataV3,
  type CampoCorrigivelV3,
  type CorrecaoDatasInputV3,
  type ImpactoGarantiaV3,
  type NovaDataCorrecaoV3,
} from "@/lib/operacoes-v3/datas-correcao-model";
import {
  campoDeDataLidaV3,
  campoVazioV3,
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  formatarDiaDeIsoNaLojaV3,
  hojeNaLojaV3,
  montarDataOperacionalV3,
  type CampoDataOperacionalV3,
} from "@/lib/operacoes-v3/datas-operacionais-model";
import { ButtonV3 } from "./UiV3";
import { DataOperacionalCampoV3, type EstilosDataOperacionalCampo } from "./DataOperacionalCampoV3";

type Valores = Partial<Record<CampoCorrecaoDataV3, CampoDataOperacionalV3>>;

function novaData(def: CampoCorrigivelV3, campo: CampoDataOperacionalV3): { ok: true; valor: NovaDataCorrecaoV3 | null } | { ok: false; mensagem: string } {
  if (!campo.dia.trim() && !campo.hora.trim()) {
    return def.permiteLimpar ? { ok: true, valor: null } : { ok: false, mensagem: `Informe a ${def.rotulo.toLowerCase()}.` };
  }
  if (def.campo === "validoAte") {
    const iso = fimDoDiaLojaIsoV3(campo.dia);
    return iso ? { ok: true, valor: { iso, meta: { precisao: "dia", dia: campo.dia } } } : { ok: false, mensagem: "Data inválida. Use um dia real do calendário." };
  }
  const r = montarDataOperacionalV3(def.permiteHora ? campo : { dia: campo.dia, hora: "" });
  return r.ok ? { ok: true, valor: r.valor } : { ok: false, mensagem: r.mensagem };
}

export interface CorrigirDatasEstado {
  campos: CampoCorrigivelV3[];
  atendimentoRapido: boolean;
  valores: Valores;
  alterar: (campo: CampoCorrecaoDataV3, v: CampoDataOperacionalV3) => void;
  limpar: (campo: CampoCorrecaoDataV3) => void;
  motivo: string;
  setMotivo: (m: string) => void;
  confirmarGarantia: boolean;
  setConfirmarGarantia: (v: boolean) => void;
  erros: Partial<Record<CampoCorrecaoDataV3 | "motivo", string>>;
  erroGeral: string | null;
  garantia: ImpactoGarantiaV3 | null;
  alterados: CampoCorrecaoDataV3[];
  busy: boolean;
  refs: Partial<Record<CampoCorrecaoDataV3 | "motivo" | "confirmarGarantia", RefObject<HTMLInputElement | HTMLTextAreaElement | null>>>;
  salvar: () => Promise<boolean>;
}

/** Estado do formulário "Corrigir datas" (mesmo para V3 e V4). */
export function useCorrigirDatas(params: { os: OrdemServico; storeId: string | null; onSalvo: () => void }): CorrigirDatasEstado {
  const { os, storeId, onSalvo } = params;
  // Baseline do que o operador viu ao abrir (trava otimista por campo).
  const [baseline] = useState(() => camposCorrigiveisV3(os));
  // Horário de registro LEGADO (sem metadata) é o momento em que o sistema gravou,
  // não um horário confirmado: trocar o dia o descarta (como o horário automático).
  const [valores, setValores] = useState<Valores>(() =>
    Object.fromEntries(
      baseline.campos.map((c) => [
        c.campo,
        { ...campoDeDataLidaV3(c.atual), horaAutomatica: c.atual?.origem === "legado" && c.atual.precisao === "data_hora" },
      ]),
    ) as Valores,
  );
  const [tocados, setTocados] = useState<Set<CampoCorrecaoDataV3>>(() => new Set());
  const [motivo, setMotivo] = useState("");
  const [confirmarGarantia, setConfirmarGarantia] = useState(false);
  // Impacto na garantia que só o servidor enxerga (linhas reais de garantia, ou
  // uma garantia criada depois que a janela abriu): passa a ser exibido aqui.
  const [garantiaServidor, setGarantiaServidor] = useState<ImpactoGarantiaV3 | null>(null);
  const [erros, setErros] = useState<CorrigirDatasEstado["erros"]>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refs = {
    dataEntrada: useRef<HTMLInputElement>(null),
    previsaoEntrega: useRef<HTMLInputElement>(null),
    dataEntrega: useRef<HTMLInputElement>(null),
    dataProposta: useRef<HTMLInputElement>(null),
    validoAte: useRef<HTMLInputElement>(null),
    motivo: useRef<HTMLTextAreaElement>(null),
    confirmarGarantia: useRef<HTMLInputElement>(null),
  };

  const porCampo = useMemo(() => new Map(baseline.campos.map((c) => [c.campo, c])), [baseline]);

  /** Monta o input só com os campos tocados que mudaram de fato. */
  const montarInput = (
    confirmar: boolean,
    assinaturaImpacto?: string,
  ): { input: CorrecaoDatasInputV3; erros: CorrigirDatasEstado["erros"] } => {
    const alteracoes: CorrecaoDatasInputV3["alteracoes"] = {};
    const esperados: CorrecaoDatasInputV3["esperados"] = {};
    const errosCampo: CorrigirDatasEstado["erros"] = {};
    for (const campo of tocados) {
      const def = porCampo.get(campo);
      const v = valores[campo];
      if (!def || !v) continue;
      const r = novaData(def, v);
      if (!r.ok) {
        errosCampo[campo] = r.mensagem;
        continue;
      }
      alteracoes[campo] = r.valor;
      esperados[campo] = def.esperado;
    }
    return {
      input: {
        alteracoes,
        esperados,
        motivo,
        confirmarImpactoGarantia: confirmar,
        ...(confirmar && assinaturaImpacto ? { assinaturaImpactoGarantia: assinaturaImpacto } : {}),
      },
      erros: errosCampo,
    };
  };

  // Prévia local (mesmas regras do servidor) — impacto na garantia e erros por campo.
  const previa = useMemo(() => {
    const { input, erros: errosCampo } = montarInput(true);
    if (Object.keys(errosCampo).length > 0 || Object.keys(input.alteracoes).length === 0) return { plano: null, errosCampo };
    const plano = planejarCorrecaoDatasV3(os, { ...input, motivo: motivo.trim().length >= 3 ? motivo : "previa" }, {
      agora: new Date(),
      operador: "",
      operadorId: "",
    });
    return { plano, errosCampo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, valores, tocados, motivo]);

  const garantiaLocal = previa.plano ? (previa.plano.ok ? previa.plano.garantia : previa.plano.garantia ?? null) : null;
  const garantia = garantiaServidor?.temImpacto ? garantiaServidor : garantiaLocal;
  const alterados = previa.plano?.ok ? previa.plano.diff.map((d) => d.campo) : [...tocados];
  // Regra violada aparece ao vivo junto do campo (mesma mensagem do servidor).
  const erroRegra =
    previa.plano && !previa.plano.ok && previa.plano.tipo !== "confirmacao" && previa.plano.campo
      ? { [previa.plano.campo]: previa.plano.mensagem }
      : {};

  const focar = (campo: string) => {
    const ref = refs[campo as keyof typeof refs];
    requestAnimationFrame(() => ref?.current?.focus());
  };

  const salvar = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    setErroGeral(null);
    const sid = (storeId ?? "").trim();
    if (!sid) {
      setErroGeral("Selecione uma loja ativa para corrigir datas.");
      return false;
    }
    // A confirmação leva a assinatura do impacto EXIBIDO: o servidor só aplica esse impacto.
    const { input, erros: errosCampo } = montarInput(confirmarGarantia, garantia?.assinatura);
    if (Object.keys(errosCampo).length > 0) {
      setErros(errosCampo);
      focar(Object.keys(errosCampo)[0]!);
      return false;
    }
    if (motivo.trim().length < 3) {
      setErros({ motivo: "Informe o motivo da correção (mínimo de 3 caracteres)." });
      focar("motivo");
      return false;
    }
    // Mesmas regras do servidor antes de enviar (campo certo + foco).
    const local = planejarCorrecaoDatasV3(os, input, { agora: new Date(), operador: "", operadorId: "" });
    if (!local.ok && local.tipo === "confirmacao") {
      // Confirmação pertence à caixa da garantia (não a um campo de data).
      setErros({});
      setErroGeral(local.mensagem);
      focar("confirmarGarantia");
      return false;
    }
    if (!local.ok && local.tipo !== "conflito") {
      if (local.campo) {
        setErros({ [local.campo]: local.mensagem });
        focar(local.campo);
      } else {
        setErros({});
      }
      setErroGeral(local.mensagem);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setErros({});
    try {
      const r = await corrigirDatasOSV3(sid, os.id, input);
      if (!r.ok) {
        if (r.tipo === "confirmacao") {
          // O servidor viu impacto diferente do confirmado (linhas reais, ou mudança no
          // meio): mostra-o e pede uma confirmação NOVA — a anterior não vale para ele.
          if (r.garantia) setGarantiaServidor(r.garantia);
          setConfirmarGarantia(false);
          setErroGeral(r.mensagem);
          focar("confirmarGarantia");
          return false;
        }
        if (r.campo) {
          setErros({ [r.campo]: r.mensagem });
          focar(r.campo);
        }
        setErroGeral(r.mensagem);
        return false;
      }
      onSalvo();
      return true;
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Não foi possível corrigir as datas.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    campos: baseline.campos,
    atendimentoRapido: baseline.atendimentoRapido,
    valores,
    alterar: (campo, v) => {
      setValores((atual) => ({ ...atual, [campo]: v }));
      setTocados((t) => new Set(t).add(campo));
      // Remove a chave (um `undefined` mascararia o erro de regra calculado ao vivo).
      setErros((e) => {
        const resto = { ...e };
        delete resto[campo];
        return resto;
      });
      if (campo === "dataEntrega") {
        setConfirmarGarantia(false);
        setGarantiaServidor(null);
      }
    },
    limpar: (campo) => {
      setValores((atual) => ({ ...atual, [campo]: campoVazioV3() }));
      setTocados((t) => new Set(t).add(campo));
    },
    motivo,
    setMotivo: (m) => {
      setMotivo(m);
      setErros((e) => {
        const resto = { ...e };
        delete resto.motivo;
        return resto;
      });
    },
    confirmarGarantia,
    setConfirmarGarantia,
    erros: Object.fromEntries(
      Object.entries({ ...erroRegra, ...previa.errosCampo, ...erros }).filter(([, m]) => !!m),
    ) as CorrigirDatasEstado["erros"],
    erroGeral,
    garantia,
    alterados,
    busy,
    refs: refs as CorrigirDatasEstado["refs"],
    salvar,
  };
}

/** Texto curto do impacto na garantia (mesmo nas duas versões). */
export function resumoImpactoGarantia(g: ImpactoGarantiaV3 | null): string[] {
  if (!g?.temImpacto) return [];
  const linhas: string[] = [];
  if (g.inicioAntes || g.inicioDepois) {
    linhas.push(`Início: ${formatarDiaDeIsoNaLojaV3(g.inicioAntes) || "—"} → ${formatarDiaDeIsoNaLojaV3(g.inicioDepois) || "—"}`);
  }
  if (g.vencimentoAntes || g.vencimentoDepois) {
    linhas.push(`Vencimento: ${formatarDiaDeIsoNaLojaV3(g.vencimentoAntes) || "—"} → ${formatarDiaDeIsoNaLojaV3(g.vencimentoDepois) || "—"}`);
  }
  if (g.payloadDeslocado || g.linhas.length > 0) linhas.push("A garantia registrada na entrega é ajustada junto, com o mesmo prazo.");
  return linhas;
}

// ----------------------------------------------------------------------------
// Corpo do formulário (campos + garantia + motivo) — parametrizado por estilos
// ----------------------------------------------------------------------------

export function CorrigirDatasCampos({
  estado,
  idPrefixo,
  estilosCampo,
  renderAtual,
}: {
  estado: CorrigirDatasEstado;
  idPrefixo: string;
  estilosCampo?: EstilosDataOperacionalCampo;
  renderAtual?: (texto: string) => React.ReactNode;
}) {
  const hoje = hojeNaLojaV3();
  return (
    <>
      {estado.campos.map((c) => {
        const valor = estado.valores[c.campo] ?? campoVazioV3();
        const atualTexto = c.campo === "validoAte" && c.atual ? formatarDiaDeIsoNaLojaV3(c.atual.iso) : formatarDataOperacionalV3(c.atual);
        const fato = c.campo === "dataEntrada" || c.campo === "dataEntrega" || c.campo === "dataProposta";
        return (
          <div key={c.campo} style={{ minWidth: 0 }}>
            <DataOperacionalCampoV3
              ref={estado.refs[c.campo] as RefObject<HTMLInputElement>}
              id={`${idPrefixo}-${c.campo}`}
              rotulo={c.rotulo}
              ajuda={c.ajuda}
              permitirHora={c.permiteHora}
              maxDia={fato ? hoje : undefined}
              valor={valor}
              onChange={(v) => estado.alterar(c.campo, v)}
              erro={estado.erros[c.campo] ?? null}
              estilos={estilosCampo}
            />
            {renderAtual ? renderAtual(`Valor atual: ${atualTexto || "não registrada"}`) : null}
            {c.permiteLimpar && valor.dia ? (
              <button
                type="button"
                onClick={() => estado.limpar(c.campo)}
                className={estilosCampo ? undefined : "mt-1 text-xs font-medium text-primary hover:underline"}
                style={estilosCampo ? { ...estilosCampo.botao, marginTop: 6 } : undefined}
              >
                Remover previsão
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// ----------------------------------------------------------------------------
// Modal da V3
// ----------------------------------------------------------------------------

export function CorrigirDatasModalV3({
  open,
  os,
  storeId,
  onClose,
  onSalvo,
}: {
  open: boolean;
  os: OrdemServico;
  storeId: string | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  if (!open) return null;
  return <CorrigirDatasModalV3Conteudo key={os.id} os={os} storeId={storeId} onClose={onClose} onSalvo={onSalvo} />;
}

function CorrigirDatasModalV3Conteudo({ os, storeId, onClose, onSalvo }: { os: OrdemServico; storeId: string | null; onClose: () => void; onSalvo: () => void }) {
  const estado = useCorrigirDatas({ os, storeId, onSalvo });
  const impacto = resumoImpactoGarantia(estado.garantia);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !estado.busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [estado.busy, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="corrigir-datas-v3-titulo">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => !estado.busy && onClose()} />
      <div className="relative flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        <header className="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3 sm:px-5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="corrigir-datas-v3-titulo" className="truncate text-base font-semibold text-foreground">
              Corrigir datas · {os.codigo}
            </h2>
            <p className="text-xs text-muted-foreground">Corrige só as datas. Nada é entregue, cobrado ou enviado de novo.</p>
          </div>
          <button type="button" onClick={onClose} disabled={estado.busy} aria-label="Fechar" className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {estado.erroGeral ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{estado.erroGeral}</span>
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <CorrigirDatasCampos
              estado={estado}
              idPrefixo="corrigir-v3"
              renderAtual={(t) => <p className="mt-1 text-[11px] text-muted-foreground">{t}</p>}
            />
          </div>

          {impacto.length > 0 ? (
            <section aria-label="Impacto na garantia" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <p className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5 text-warning" aria-hidden /> A garantia muda junto com a entrega
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {impacto.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <label className="mt-2 flex items-start gap-2">
                <input
                  ref={estado.refs.confirmarGarantia as RefObject<HTMLInputElement>}
                  type="checkbox"
                  checked={estado.confirmarGarantia}
                  onChange={(e) => estado.setConfirmarGarantia(e.target.checked)}
                />
                <span>Confirmo que a garantia passa a contar da nova data de entrega.</span>
              </label>
            </section>
          ) : null}

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo da correção *</span>
            <textarea
              ref={estado.refs.motivo as RefObject<HTMLTextAreaElement>}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive"
              rows={2}
              maxLength={MOTIVO_MAX_V3}
              value={estado.motivo}
              onChange={(e) => estado.setMotivo(e.target.value)}
              placeholder="Ex.: o aparelho foi entregue na sexta e só registrei hoje."
              aria-invalid={estado.erros.motivo ? true : undefined}
              aria-describedby={estado.erros.motivo ? "corrigir-v3-motivo-erro" : undefined}
            />
            {estado.erros.motivo ? (
              <span id="corrigir-v3-motivo-erro" role="alert" className="mt-1 block text-[11px] font-medium text-destructive">
                {estado.erros.motivo}
              </span>
            ) : null}
          </label>
          <p className="text-[11px] text-muted-foreground">A correção fica no histórico com o seu usuário, o horário de agora e o motivo. Os registros anteriores não são apagados.</p>
        </div>

        <footer className="flex flex-none items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
          <ButtonV3 variant="ghost" onClick={onClose} disabled={estado.busy}>
            Cancelar
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={() => void estado.salvar()} disabled={estado.busy || estado.alterados.length === 0}>
            {estado.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {estado.busy ? "Salvando…" : "Salvar correção"}
          </ButtonV3>
        </footer>
      </div>
    </div>
  );
}
