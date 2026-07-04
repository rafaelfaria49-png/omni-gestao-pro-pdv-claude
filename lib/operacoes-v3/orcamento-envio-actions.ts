"use server";

// ============================================================================
// Operações V3 — GOAL OPS-V4-ORC-ENVIO-WA-025 · action fina de orquestração
// ----------------------------------------------------------------------------
// `enviarOrcamentoPorCanalV3` decide, a partir do status REAL do orçamento,
// qual das duas actions já existentes chamar — NENHUMA lógica de negócio nova:
//   • PRIMEIRO envio (rascunho)  → `enviarOrcamentoV3` (muda status/validoAte/
//     transição da OS) + `registrarEnvioOrcamento` (audita o canal).
//   • REENVIO (já enviado)       → SÓ `registrarEnvioOrcamento` (canal). Nunca
//     chama `enviarOrcamentoV3` de novo — `validoAte` não é tocado (revalidar
//     é feature futura, fora de escopo deste GOAL).
//   • aprovado/recusado/sem orçamento → erro claro, nada é escrito.
//
// Falha do REGISTRO (auditoria) depois de um primeiro envio bem-sucedido NÃO
// é mascarada nem tratada como sucesso silencioso: retorna `avisoRegistro:true`
// — o estado real (status mudou, e-mail/whatsapp já foi decidido pelo
// operador) já aconteceu; só a auditoria do canal falhou.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { getOrdem } from "@/app/actions/ordens";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { orcamentoRealV3, type CanalEnvioOrcamentoV3 } from "./orcamento-model";
import { enviarOrcamentoV3, registrarEnvioOrcamento } from "./orcamento-actions";

export interface EnviarOrcamentoPorCanalResultV3 {
  ok: true;
  /** true quando este envio era um REENVIO (orçamento já estava "enviado"). */
  reenvio: boolean;
  /** true quando o envio/reenvio aconteceu mas o registro do canal falhou (best-effort). */
  avisoRegistro: boolean;
  os: OrdemServico;
}

/**
 * Envia (ou reenvia) o orçamento por um canal, orquestrando as actions já
 * existentes conforme o status REAL do orçamento. Lança Error com mensagem
 * amigável para estados inválidos (aprovado/recusado/sem orçamento) ou falha
 * no PRIMEIRO envio (`enviarOrcamentoV3`) — nesses casos nada foi alterado.
 */
export async function enviarOrcamentoPorCanalV3(
  storeId: string,
  osId: string,
  canal: CanalEnvioOrcamentoV3,
): Promise<EnviarOrcamentoPorCanalResultV3> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  const id = (osId ?? "").trim();
  if (!id) throw new Error("OS não informada.");

  const os = await getOrdem(sid, id, { readOnly: true });
  if (!os) throw new Error("OS não encontrada.");

  const orc = orcamentoRealV3(os);
  if (!orc) throw new Error("Esta OS ainda não tem orçamento materializado. Gere o orçamento antes de enviar.");
  if (orc.status === "aprovado" || orc.status === "recusado") {
    throw new Error(`Não é possível enviar um orçamento com status "${orc.status}".`);
  }

  const reenvio = orc.status === "enviado";

  if (!reenvio) {
    // Primeiro envio: muda status/validoAte/transição da OS. Se isto falhar,
    // nada aconteceu — o erro sobe normal (sem envio, sem registro).
    const osEnviada = await enviarOrcamentoV3(sid, id);
    try {
      const osFinal = await registrarEnvioOrcamento(sid, id, canal);
      return { ok: true, reenvio: false, avisoRegistro: false, os: osFinal };
    } catch {
      // O envio real (status/validoAte) já aconteceu — só a auditoria do
      // canal falhou. Sucesso honesto, com aviso (nunca mascarado).
      return { ok: true, reenvio: false, avisoRegistro: true, os: osEnviada };
    }
  }

  // Reenvio: único efeito é o registro do canal. Se falhar, não há sucesso
  // parcial para relatar — o erro sobe normal.
  const osFinal = await registrarEnvioOrcamento(sid, id, canal);
  return { ok: true, reenvio: true, avisoRegistro: false, os: osFinal };
}
