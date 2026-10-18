import type { CanalEnvioOrcamentoV3, OrcamentoV3 } from "./orcamento-model";

/** Evidências aditivas no orçamento JSONB; não alteram o enum comercial existente. */
export interface CompartilhamentoOrcamentoV3 {
  id: string;
  canal: CanalEnvioOrcamentoV3;
  conteudoHash: string;
  totalSnapshot: number;
  iniciadoEm: string;
  iniciadoPor: { id: string; nome: string };
  estado: "preparado" | "api_em_andamento" | "informado_operador" | "aceito_api";
  confirmadoEm?: string;
  confirmadoPor?: { id: string; nome: string };
  natureza?: "declaracao_manual" | "aceite_api_oficial";
  reenvio?: boolean;
  versaoAlterada?: boolean;
  api?: { wamid: string; conversaId: string; aceitoEm: string };
}

export interface ConfirmacaoEnvioManualV3 {
  tentativaId: string;
  confirmado: true;
}

export type EstadoEnvioOrcamentoV3 =
  | "rascunho" | "compartilhamento_iniciado" | "envio_informado_operador"
  | "aceito_api" | "api_sem_confirmacao" | "legado_sem_evidencia";

export const ROTULO_ENVIO_ORCAMENTO_V3: Record<EstadoEnvioOrcamentoV3, string> = {
  rascunho: "Rascunho — envio não registrado",
  compartilhamento_iniciado: "Compartilhamento iniciado — envio não confirmado",
  envio_informado_operador: "Envio informado pelo operador",
  aceito_api: "Envio aceito pela API oficial",
  api_sem_confirmacao: "API sem resultado confirmado — confira antes de reenviar",
  legado_sem_evidencia: "Registro anterior sem evidência de envio",
};

export function compartilhamentosOrcamentoV3(orc: OrcamentoV3): CompartilhamentoOrcamentoV3[] {
  return Array.isArray(orc.compartilhamentosV3) ? orc.compartilhamentosV3 : [];
}

export function temEvidenciaEnvioOrcamentoV3(orc: OrcamentoV3): boolean {
  return compartilhamentosOrcamentoV3(orc).some((e) =>
    (e.estado === "informado_operador" && e.natureza === "declaracao_manual" && !!e.confirmadoPor?.id && !!e.confirmadoEm) ||
    (e.estado === "aceito_api" && !e.versaoAlterada && e.natureza === "aceite_api_oficial" && !!e.api?.wamid),
  );
}

/** Leitura interna: nenhum destes metadados entra na projeção destinada ao cliente. */
export function resumoEnvioOrcamentoV3(orc: OrcamentoV3 | null | undefined) {
  const ultimo = orc ? compartilhamentosOrcamentoV3(orc).at(-1) : undefined;
  const estado: EstadoEnvioOrcamentoV3 = !ultimo
    ? orc?.status === "enviado" ? "legado_sem_evidencia" : "rascunho"
    : ultimo.estado === "informado_operador" ? "envio_informado_operador"
    : ultimo.estado === "aceito_api" ? "aceito_api"
    : ultimo.estado === "api_em_andamento" ? "api_sem_confirmacao" : "compartilhamento_iniciado";
  const rotulo = ultimo?.versaoAlterada ? "API aceitou uma versão anterior — proposta atual preservada" : ROTULO_ENVIO_ORCAMENTO_V3[estado];
  return { estado, rotulo, ultimo, entregaConfirmada: false as const };
}
