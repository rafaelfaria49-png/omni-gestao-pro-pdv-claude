/**
 * Operações V4 — bloco "Próxima ação" (GOAL OPS-V4-FLUXO-CURTO-005).
 *
 * Superfície ÚNICA da ação primária da OS (o header não tem CTA paralelo).
 * Só apresenta `v.proximaAcao` (derivação pura de estado real) e chama os
 * executores do hook: `executarProximaAcao` (write existente ou navegação) e
 * `executarAcaoSecundaria` (navegação ou releitura). Nenhuma regra de negócio
 * aqui; nenhum listener global de teclado.
 *
 * Quando o controle real da ação vive na etapa aberta (ex.: "Iniciar execução"
 * na Execução, recebimento no Financeiro), o bloco não duplica o botão: aponta
 * para o controle logo abaixo.
 */
"use client";

import {
  ArrowDown,
  Ban,
  CircleAlert,
  CircleArrowRight,
  CircleCheck,
  CirclePlay,
  Hourglass,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ProximaAcaoV4 as ProximaAcao } from "@/lib/operacoes-v4/proxima-acao-v4";
import type { V4Vals } from "../use-v4-preview";
import styles from "./proxima-acao-v4.module.css";

function iconeDo(acao: ProximaAcao): LucideIcon {
  if (acao.efeito === "wait") return LoaderCircle;
  switch (acao.estado) {
    case "acao":
      return CirclePlay;
    case "navegacao":
      return CircleArrowRight;
    case "aguardando":
      return Hourglass;
    case "bloqueada":
      return TriangleAlert;
    case "concluida":
      return acao.id === "os-cancelada" ? Ban : CircleCheck;
    default:
      return acao.id === "sem-os" ? LoaderCircle : CircleAlert;
  }
}

export function ProximaAcaoV4({ v }: { v: Pick<V4Vals, "proximaAcao" | "stage" | "executarProximaAcao" | "executarAcaoSecundaria"> }) {
  const acao = v.proximaAcao;
  const Icone = iconeDo(acao);
  const girando = Icone === LoaderCircle;
  // O controle real está nesta etapa: aponta para ele em vez de duplicar o botão.
  const controleAqui = acao.controleNaEtapa && !!acao.stage && acao.stage === v.stage;
  const cta = controleAqui ? null : acao.cta;
  const secundaria = acao.secundaria && (!acao.secundaria.stage || acao.secundaria.stage !== v.stage) ? acao.secundaria : null;
  const texto = acao.motivo ? `${acao.descricao} ${acao.motivo}` : acao.descricao;

  return (
    <div className={styles.shell}>
      <section
        className={styles.bar}
        aria-label="Próxima ação da OS"
        data-estado={acao.estado}
        data-efeito={acao.efeito}
        data-tone={acao.tone}
        data-acao={acao.id}
      >
        <div className={styles.body} aria-live="polite" aria-atomic="true">
          <p className={styles.headline}>
            <span className={styles.tag}>
              <Icone size={13} strokeWidth={2.4} aria-hidden className={girando ? styles.spin : undefined} />
              {acao.eyebrow}
            </span>
            <span className={styles.title}>{acao.titulo}</span>
          </p>
          <p className={styles.desc} title={texto}>{texto}</p>
        </div>

        {controleAqui || cta || secundaria ? (
          <div className={styles.actions}>
            {controleAqui ? (
              <span className={styles.here}>
                <ArrowDown size={13} strokeWidth={2.4} aria-hidden />
                Nesta etapa, logo abaixo
              </span>
            ) : null}
            {secundaria ? (
              <button type="button" className={styles.secondary} onClick={v.executarAcaoSecundaria}>
                {secundaria.recarregar ? <RotateCw size={13} strokeWidth={2.2} aria-hidden /> : null}
                {secundaria.label}
              </button>
            ) : null}
            {cta ? (
              <button
                type="button"
                className={acao.efeito === "write" ? styles.write : styles.navigate}
                onClick={v.executarProximaAcao}
                disabled={cta.disabled}
                aria-busy={cta.ocupado ? true : undefined}
              >
                {cta.ocupado ? (
                  <LoaderCircle size={14} strokeWidth={2.2} aria-hidden className={styles.spin} />
                ) : acao.efeito === "write" ? (
                  <CirclePlay size={14} strokeWidth={2.2} aria-hidden />
                ) : null}
                {cta.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
