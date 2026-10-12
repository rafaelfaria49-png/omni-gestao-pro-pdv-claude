import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceFocusProvider } from "@/components/painel-inicial/workspace-focus-context";
import { useV4Preview } from "@/components/operacoes-v4-preview/use-v4-preview";
import { CommandHeader } from "@/components/operacoes-v4-preview/parts/CommandHeader";
import { EntradaStage } from "@/components/operacoes-v4-preview/parts/stages/EntradaStage";
import { CorrigirDatasModalV4 } from "@/components/operacoes-v4-preview/parts/CorrigirDatasModalV4";
import { ordem, qa } from "./stubs";
import "./qa.css";

function Fixture() {
  const [, renderizar] = useState(0);
  const [visivel, setVisivel] = useState(true);
  const v = useV4Preview();
  useEffect(() => { Object.assign(window, { __p2: { v, qa } }); });
  return <WorkspaceFocusProvider>
    <div style={{ padding: 16, position: "relative", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => v.selectOS(ordem("a"), "entrada")}>Selecionar OS A</button>
        <button onClick={() => v.selectOS(ordem("b"), "entrada")}>Selecionar OS B</button>
        <button onClick={() => { qa.loja = qa.loja === "loja-qa-datas" ? "outra-loja" : "loja-qa-datas"; renderizar((n) => n + 1); }}>Trocar loja</button>
        <button onClick={() => setVisivel((atual) => !atual)}>Alternar componentes</button>
      </div>
      <CommandHeader v={v} />
      {visivel ? <>
        <EntradaStage v={v} />
        <CorrigirDatasModalV4 open={v.corrigirDatasOpen} os={v.realOS} onClose={v.closeCorrigirDatas} onSalvo={v.onDatasCorrigidas} />
      </> : null}
    </div>
  </WorkspaceFocusProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
