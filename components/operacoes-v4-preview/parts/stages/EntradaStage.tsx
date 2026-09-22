/**
 * Operações V4 — workspace focado da Entrada.
 *
 * Cada seção usa os contratos reais já existentes da V3. O estado do editor
 * permanece no pai ao trocar de seção; nada é salvo automaticamente. Segurança
 * e Estado físico compartilham a prova de entrada real, enquanto Fotos apenas
 * lista evidências existentes e persiste fotos/assinatura pelas actions V3.
 * O PatternPadV4 e a condição senhaTipo === "padrao" vivem em EntradaSections.
 *
 * R04 (OPS-V4-FLUXO-CURTO-001): o rascunho sujo vive na guarda da sessão
 * (`v.rascunhos`, por chave loja+OS) — sobrevive à troca de etapa (o
 * StagePanel desmonta este componente ao sair da Entrada) e à troca de OS/loja
 * (restaura ao voltar). As saídas reais passam pelo pêndulo
 * salvar/descartar/cancelar abaixo; Cancelar impede a saída. Sem PIN/storage
 * genérico: só memória do hook `useV4Preview` (morre ao sair da V4).
 */
import type { V4Vals } from "../../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { EntradaWorkspace, type RascunhoEntradaV4 } from "./EntradaWorkspace";

export function EntradaStage({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  const guarda = v.rascunhos;
  // Sem guarda (apenas fixtures legados sem `rascunhos` no ctx) ou sem OS
  // selecionada, nada há para editar — o hook real sempre provê a guarda.
  if (!v.osSelected || !guarda) return null;

  // T05: a chave do workspace é loja+OS — trocar de loja com o mesmo osId
  // descarta respostas antigas em vez de reutilizar a instância.
  const loja = (lojaAtivaId ?? "").trim();
  const chave = `${loja || "sem-loja"}::${v.selectedOsId ?? "none"}`;
  const guardado = guarda.obter(chave);
  const inicial = (guardado?.rascunho ?? undefined) as RascunhoEntradaV4 | undefined;
  const pendente = guarda.pendente;

  return (
    <>
      <EntradaWorkspace
        key={chave}
        v={v}
        rascunhoInicial={inicial}
        onRascunhoChange={(rascunho, meta) => {
          if (!rascunho) {
            guarda.limpar(chave);
            return;
          }
          guarda.publicar(chave, rascunho, meta?.sujo === true, meta?.acoes ?? null);
        }}
      />
      {pendente ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Alterações não salvas na Entrada"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(17,19,26,.45)",
            zIndex: 40,
          }}
        >
          <div
            style={{
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid var(--border, #e2e5ec)",
              borderRadius: 10,
              padding: 20,
              maxWidth: 420,
              boxShadow: "0 12px 32px rgba(17,19,26,.25)",
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Alterações não salvas</h2>
            <p style={{ fontSize: 13, margin: "0 0 16px" }}>
              Há edição suja na Entrada ({pendente.descricao}). Salve para persistir, descarte para voltar ao dado do
              servidor, ou cancele para continuar editando.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => guarda.cancelarSaida()}>
                Cancelar
              </button>
              <button type="button" onClick={() => void guarda.confirmarDescarte()}>
                Descartar
              </button>
              <button type="button" onClick={() => void guarda.confirmarSalvamento()}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
