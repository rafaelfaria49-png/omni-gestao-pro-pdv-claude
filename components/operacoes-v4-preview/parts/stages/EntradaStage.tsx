/**
 * Operações V4 — workspace focado da Entrada.
 *
 * Cada seção usa os contratos reais já existentes da V3. O estado do editor
 * permanece no pai ao trocar de seção; nada é salvo automaticamente. Segurança
 * e Estado físico compartilham a prova de entrada real, enquanto Fotos apenas
 * lista evidências existentes e persiste fotos/assinatura pelas actions V3.
 * O PatternPadV4 e a condição senhaTipo === "padrao" vivem em EntradaSections.
 *
 * R04 (OPS-V4-FLUXO-CURTO-001): o rascunho sujo é ligado às saídas reais da
 * OS/loja — um mapa por chave loja+OS preserva a digitação ao trocar de
 * contexto (sem PIN/storage genérico, só memória do componente). Descartar
 * limpa o rascunho da chave atual.
 */
import { useRef } from "react";
import type { V4Vals } from "../../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { EntradaWorkspace, type RascunhoEntradaV4 } from "./EntradaWorkspace";

export function EntradaStage({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  // Rascunhos por contexto (loja+OS). Sobrevive à troca de seleção e ao
  // remount do workspace — a digitação nunca se perde em silêncio.
  const rascunhosRef = useRef(new Map<string, RascunhoEntradaV4>());
  if (!v.osSelected) return null;

  // T05: a chave do workspace é loja+OS — trocar de loja com o mesmo osId
  // descarta respostas antigas em vez de reutilizar a instância.
  const loja = (lojaAtivaId ?? "").trim();
  const chave = `${loja || "sem-loja"}::${v.selectedOsId ?? "none"}`;
  const inicial = rascunhosRef.current.get(chave);

  return (
    <EntradaWorkspace
      key={chave}
      v={v}
      rascunhoInicial={inicial}
      onRascunhoChange={(rascunho) => {
        if (!rascunho) {
          rascunhosRef.current.delete(chave);
          return;
        }
        rascunhosRef.current.set(chave, rascunho);
      }}
    />
  );
}
