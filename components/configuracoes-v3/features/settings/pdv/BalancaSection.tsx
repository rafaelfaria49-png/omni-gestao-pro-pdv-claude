"use client";

/** Balança: visor de peso no PDV (só com permissão de configurações). */
import { VISOR_SAVED_MSG, type PdvFailure, type VisorState } from "./pdv-station-model";
import { BlockAlert, Row, SectionHead, Toggle, UndoButton } from "./pdv-station-controls";

export function BalancaSection({
  visor,
  dirty,
  manual,
  toggleDisabled,
  statusMessage,
  savedNote,
  onToggle,
  onUndo,
  failure,
}: {
  visor: VisorState | null;
  dirty: boolean;
  /** A unidade escolheu manualmente (senão vale o padrão do ramo). */
  manual: boolean;
  toggleDisabled: boolean;
  /** Mostrado enquanto não há valor confirmado da unidade (carregando, falha ou sem unidade). */
  statusMessage: string;
  savedNote: boolean;
  onToggle: (v: boolean) => void;
  onUndo: () => void;
  failure?: PdvFailure;
}) {
  return (
    <section id="pdv-balanca" className="cx-section" aria-labelledby="balanca-title">
      <SectionHead
        id="balanca"
        title="Balança"
        description="Visor com o peso recebido da balança, exibido ao lado do total da venda."
        scope="unidade"
        pending={dirty}
        extra={dirty ? <UndoButton label="Balança" onClick={onUndo} /> : null}
      />
      <div className="cx-rows">
        {visor ? (
          <Row
            label="Exibir visor de peso no PDV"
            labelId="pdv-visor-label"
            pending={dirty}
            help={
              <span id="pdv-visor-help">
                Não habilita vendas por peso. {manual ? "Escolha manual da unidade." : "Padrão do ramo da unidade."}
              </span>
            }
          >
            <Toggle checked={visor.draft} onChange={onToggle} labelledBy="pdv-visor-label" describedBy="pdv-visor-help" disabled={toggleDisabled} />
          </Row>
        ) : (
          <p role="status" className="py-4 text-xs text-muted-foreground">
            {statusMessage}
          </p>
        )}
      </div>
      {savedNote && !dirty ? (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {VISOR_SAVED_MSG}
        </p>
      ) : null}
      <BlockAlert failure={failure} />
    </section>
  );
}
