"use client";

/**
 * OperacoesHubIsolated
 *
 * Wrapper de isolamento que monta o Operações HUB Lovable dentro do Next.js:
 * - MemoryRouter isola a navegação interna do App Router do Next
 * - OSProvider fornece o contexto de dados (mock) apenas para esta árvore
 * - Tema gerenciado pelo OperacoesLayout (sincronizado com tema global via applyGlobalTheme)
 *
 * NÃO importa index.css nem App.css globalmente.
 * NÃO interfere no App Router, PDV, WhatsApp, Financeiro ou Zustand principal.
 */

import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { OSProvider } from "./store/osStore";
import OperacoesHubPage from "./pages/OperacoesHub";
import DashboardOperacional from "./pages/DashboardOperacional";
import OrdensServico from "./pages/OrdensServico";
import OSDetalhe from "./pages/OSDetalhe";
import Tecnicos from "./pages/Tecnicos";
import HistoricoClientes from "./pages/HistoricoClientes";
import Garantias from "./pages/Garantias";
import Servicos from "./pages/Servicos";
import Notificacoes from "./pages/Notificacoes";
import NotFound from "./pages/NotFound";

export function OperacoesHubIsolated() {
  return (
    <div className="w-full min-w-0">
      <OSProvider>
        <MemoryRouter initialEntries={["/operacoes"]} initialIndex={0}>
          <Routes>
            <Route path="/" element={<Navigate to="/operacoes" replace />} />
            <Route path="/operacoes" element={<OperacoesHubPage />} />
            <Route path="/operacoes/dashboard" element={<DashboardOperacional />} />
            <Route path="/operacoes/os" element={<OrdensServico />} />
            <Route path="/operacoes/os/:id" element={<OSDetalhe />} />
            <Route path="/operacoes/tecnicos" element={<Tecnicos />} />
            <Route path="/operacoes/historico" element={<HistoricoClientes />} />
            <Route path="/operacoes/garantias" element={<Garantias />} />
            <Route path="/operacoes/servicos" element={<Servicos />} />
            <Route path="/operacoes/notificacoes" element={<Notificacoes />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MemoryRouter>
      </OSProvider>
    </div>
  );
}

export default OperacoesHubIsolated;
