"use client";

import { useState } from "react";
import { ConfigSidebar, type ConfigV2SectionId } from "./components/ConfigSidebar";
import { AparenciaSection } from "./sections/AparenciaSection";
import { FinanceiroSection } from "./sections/FinanceiroSection";
import { GeralSection } from "./sections/GeralSection";
import { IaSection } from "./sections/IaSection";
import { IntegracoesSection } from "./sections/IntegracoesSection";
import { LojasSection } from "./sections/LojasSection";
import { PdvSection } from "./sections/PdvSection";
import { SegurancaSection } from "./sections/SegurancaSection";
import { UsuariosSection } from "./sections/UsuariosSection";
import { VendasSection } from "./sections/VendasSection";
import "./configuracoes-v2.css";

function SectionView({ id }: { id: ConfigV2SectionId }) {
  switch (id) {
    case "geral":
      return <GeralSection />;
    case "usuarios":
      return <UsuariosSection />;
    case "aparencia":
      return <AparenciaSection />;
    case "lojas":
      return <LojasSection />;
    case "seguranca":
      return <SegurancaSection />;
    case "financeiro":
      return <FinanceiroSection />;
    case "vendas":
      return <VendasSection />;
    case "pdv":
      return <PdvSection />;
    case "ia":
      return <IaSection />;
    case "integracoes":
      return <IntegracoesSection />;
    default:
      return <GeralSection />;
  }
}

export default function ConfiguracoesV2Page() {
  const [active, setActive] = useState<ConfigV2SectionId>("geral");

  return (
    <div className="configuracoes-v2 min-h-[calc(100vh-4rem)] w-full text-foreground">
      <div className="config-v2-shell min-h-[calc(100vh-4rem)] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[260px]">
            <ConfigSidebar active={active} onSelect={setActive} />
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-5xl">
              <SectionView id={active} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
