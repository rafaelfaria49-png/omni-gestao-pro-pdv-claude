// ============================================================================
// Store de Operações — agora consome a camada async em src/api/*.
// A UI continua chamando os mesmos métodos (mesma assinatura). Internamente
// cada ação chama a API simulada e re-hidrata o estado local com a resposta.
// Pronto para trocar src/api/* por chamadas HTTP reais sem mexer na UI.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Anexo,
  EventoTipo,
  Orcamento,
  OrdemServico,
  OSStatus,
  PecaUsada,
  Tecnico,
} from "@/types/os";
import type { ProdutoDTO } from "@/app/actions/cadastros";
import type { ClienteRecord } from "@/data/clientesSeed";
import type { PecaEstoque } from "@/types/estoque";
import type { Loja } from "@/types/loja";
import type { Venda } from "@/types/venda";
import type { CatalogoServico } from "@/types/servico";
import type { AtendimentoRapido } from "@/types/atendimento";
import * as osApi from "@/api/os";
import type { SalvarOrcamentoEvento } from "@/api/os";
import * as clientesApi from "@/api/clientes";
import * as estoqueApi from "@/api/estoque";
import * as lojasApi from "@/api/lojas";
import * as vendasApi from "@/api/vendas";
import * as servicosApi from "@/api/servicos";
import * as atendimentosApi from "@/api/atendimentos";
import { DEFAULT_STORE_ID } from "@/data/lojasSeed";
import { uid } from "@/api/_helpers";
import { listEquipamentosModelos, listProdutos } from "@/app/actions/cadastros";

interface OSContextValue {
  // escopo multi-loja
  storeId: string;
  setStoreId: (id: string) => void;
  lojas: Loja[];

  // dados primários
  ordens: OrdemServico[];
  tecnicos: Tecnico[];
  clientes: ClienteRecord[];
  equipamentosModelos: {
    id: string;
    name: string;
    brand: string;
    type: string;
    compatibleParts: string[];
    commonDefects: string[];
    recommendedChecklist: string[];
  }[];
  pecasEstoque: PecaEstoque[];
  vendas: Venda[];
  servicosCatalogo: CatalogoServico[];
  produtosCatalogo: ProdutoDTO[];
  atendimentos: AtendimentoRapido[];
  loading: boolean;

  // helpers
  getOS: (id: string) => OrdemServico | undefined;
  refresh: () => Promise<void>;

  // mutações de OS (assinatura preservada para a UI atual)
  criarOS: (input: Parameters<typeof osApi.criarOS>[0]) => Promise<OrdemServico>;
  moveStatus: (osId: string, status: OSStatus, autor?: string) => void;
  assignTecnico: (osId: string, tecnico: Tecnico, autor?: string) => void;
  addObservacao: (osId: string, conteudo: string, interna: boolean, autor?: string) => void;
  addAnexo: (osId: string, anexo: Omit<Anexo, "id" | "enviadoEm">) => void;
  removeAnexo: (osId: string, anexoId: string, autor?: string) => void;
  approveOrcamento: (osId: string, autor?: string) => void;
  rejectOrcamento: (osId: string, motivo?: string, autor?: string) => void;
  criarOrcamentoRascunho: (osId: string, autor?: string) => void;
  salvarOrcamento: (osId: string, orcamento: Orcamento, evento: SalvarOrcamentoEvento, autor?: string) => void;
  enviarOrcamentoAoCliente: (osId: string, autor?: string) => void;
  addEvento: (osId: string, conteudo: string, tipo?: EventoTipo, autor?: string) => void;
  updateChecklist: (osId: string, checklist: OrdemServico["checklist"], autor?: string) => void;

  // novos pontos de integração (estoque + vendas)
  addPecaFromEstoque: (osId: string, peca: PecaUsada, autor?: string) => Promise<void>;
  faturarOS: (osId: string, autor?: string) => Promise<Venda | undefined>;

  // catálogo de serviços e atendimentos rápidos
  upsertServico: (servico: CatalogoServico) => Promise<void>;
  criarAtendimento: (input: Omit<AtendimentoRapido, "id" | "criadoEm">) => Promise<AtendimentoRapido>;
}

const OSContext = createContext<OSContextValue | null>(null);
const DEFAULT_AUTOR = "Você";

export function OSProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string>(DEFAULT_STORE_ID);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [clientes, setClientes] = useState<ClienteRecord[]>([]);
  const [equipamentosModelos, setEquipamentosModelos] = useState<OSContextValue["equipamentosModelos"]>([]);
  const [pecasEstoque, setPecasEstoque] = useState<PecaEstoque[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [servicosCatalogo, setServicosCatalogo] = useState<CatalogoServico[]>([]);
  const [produtosCatalogo, setProdutosCatalogo] = useState<ProdutoDTO[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRapido[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [o, t, c, eq, p, l, v, s, prod, a] = await Promise.all([
      osApi.listOrdens(storeId),
      osApi.listTecnicos(storeId),
      clientesApi.listClientes(storeId),
      listEquipamentosModelos(storeId),
      estoqueApi.listPecas(storeId),
      lojasApi.listLojas(),
      vendasApi.listVendas(storeId),
      servicosApi.listServicos(storeId),
      listProdutos(storeId),
      atendimentosApi.listAtendimentos(storeId),
    ]);
    setOrdens(o);
    setTecnicos(t);
    setClientes(c);
    setEquipamentosModelos(eq);
    setPecasEstoque(p);
    setLojas(l);
    setVendas(v);
    setServicosCatalogo(s);
    setProdutosCatalogo(prod);
    setAtendimentos(a);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replaceOS = useCallback((updated: OrdemServico) => {
    setOrdens((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }, []);

  const getOS = useCallback((id: string) => ordens.find((o) => o.id === id), [ordens]);

  const value = useMemo<OSContextValue>(
    () => ({
      storeId,
      setStoreId,
      lojas,
      ordens,
      tecnicos,
      clientes,
      equipamentosModelos,
      pecasEstoque,
      vendas,
      servicosCatalogo,
      produtosCatalogo,
      atendimentos,
      loading,
      getOS,
      refresh,
      criarOS: async (input) => {
        const novo = await osApi.criarOS(input);
        setOrdens((prev) => [novo, ...prev]);
        return novo;
      },
      moveStatus: (osId, status, autor = DEFAULT_AUTOR) => {
        void osApi.moveStatus(osId, status, autor).then(replaceOS);
      },
      assignTecnico: (osId, tecnico, autor = DEFAULT_AUTOR) => {
        void osApi.assignTecnico(osId, tecnico, autor).then(replaceOS);
      },
      addObservacao: (osId, conteudo, interna, autor = DEFAULT_AUTOR) => {
        void osApi
          .addObservacao(osId, {
            id: uid("ob"),
            autor,
            conteudo,
            interna,
            criadoEm: new Date().toISOString(),
          })
          .then(replaceOS);
      },
      addAnexo: (osId, anexo) => {
        void osApi
          .addAnexo(osId, { ...anexo, id: uid("an"), enviadoEm: new Date().toISOString() })
          .then(replaceOS);
      },
      removeAnexo: (osId, anexoId, autor = DEFAULT_AUTOR) => {
        void osApi.removeAnexo(osId, anexoId, autor).then(replaceOS);
      },
      approveOrcamento: (osId, autor = "Cliente") => {
        void osApi.approveOrcamento(osId, autor).then(replaceOS);
      },
      rejectOrcamento: (osId, motivo, autor = "Cliente") => {
        void osApi.rejectOrcamento(osId, autor, motivo).then(replaceOS);
      },
      criarOrcamentoRascunho: (osId, autor = DEFAULT_AUTOR) => {
        void osApi.criarOrcamentoRascunho(osId, autor).then(replaceOS);
      },
      salvarOrcamento: (osId, orcamento, evento, autor = DEFAULT_AUTOR) => {
        void osApi.salvarOrcamento(osId, orcamento, autor, evento).then(replaceOS);
      },
      enviarOrcamentoAoCliente: (osId, autor = DEFAULT_AUTOR) => {
        void osApi.enviarOrcamentoAoCliente(osId, autor).then(replaceOS);
      },
      addEvento: (osId, conteudo, tipo = "mensagem_interna", autor = DEFAULT_AUTOR) => {
        void osApi.addEvento(osId, conteudo, tipo, autor).then(replaceOS);
      },
      updateChecklist: (osId, checklist, autor = DEFAULT_AUTOR) => {
        void osApi.updateChecklist(osId, checklist, autor).then(replaceOS);
      },
      addPecaFromEstoque: async (osId, peca, autor = DEFAULT_AUTOR) => {
        const updated = await osApi.addPecaFromEstoque(osId, peca, autor);
        replaceOS(updated);
        // refresca estoque local para refletir reserva/baixa
        setPecasEstoque(await estoqueApi.listPecas(storeId));
      },
      faturarOS: async (osId, autor = DEFAULT_AUTOR) => {
        const { os, venda } = await osApi.faturarOS(osId, autor);
        replaceOS(os);
        setVendas((prev) => [...prev, venda]);
        setPecasEstoque(await estoqueApi.listPecas(storeId));
        return venda;
      },
      upsertServico: async (servico) => {
        await servicosApi.upsertServico(servico);
        setServicosCatalogo(await servicosApi.listServicos(storeId));
      },
      criarAtendimento: async (input) => {
        const novo = await atendimentosApi.criarAtendimento(input);
        setAtendimentos((prev) => [novo, ...prev]);
        return novo;
      },
    }),
    [
      storeId,
      lojas,
      ordens,
      tecnicos,
      clientes,
      equipamentosModelos,
      pecasEstoque,
      vendas,
      servicosCatalogo,
      produtosCatalogo,
      atendimentos,
      loading,
      getOS,
      refresh,
      replaceOS,
    ],
  );

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}

export function useOS() {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error("useOS deve ser usado dentro de <OSProvider>");
  return ctx;
}
