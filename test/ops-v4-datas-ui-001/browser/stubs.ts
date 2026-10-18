// Fixture de componentes reais: nenhuma action ou credencial produtiva.
import { createElement, type ComponentProps } from "react";
import type { OrdemServico } from "@/types/os";
export const qa = {
  loja: "loja-qa-datas",
  correcoes: 0,
  entradas: 0,
  corrigir: [] as Array<(value: unknown) => void>,
  entrada: [] as Array<() => void>,
};
export function ordem(id = "a", storeId = qa.loja): OrdemServico {
  return {
    id, storeId, codigo: "OS-" + id.toUpperCase(), numero: id,
    status: "pronta", operacaoStatusV3: "pronta", criadoEm: "2026-10-10T12:00:00.000Z", prioridade: "media",
    cliente: { nome: "Cliente sintético" }, equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "QA", defeitoRelatado: "Tela quebrada" },
    aberturaV3: { versao: 1, recepcao: {
      recebidoPor: "Operador QA", origem: "balcao", prioridade: "normal",
      dataEntrada: "2026-10-02T15:00:00.000Z", dataEntradaMeta: { precisao: "dia", dia: "2026-10-02" },
      previsaoEntrega: "2026-10-08T21:30:00.000Z", previsaoEntregaMeta: { precisao: "data_hora", dia: "2026-10-08" },
    } }, timeline: [],
  } as unknown as OrdemServico;
}
export const useSession = () => ({ data: null, status: "unauthenticated" });
export const usePathname = () => "/dashboard/operacoes-v4";
export const useUserCredits = () => ({ credits: 500, loading: false, error: null });
export const useSidebarCollapsed = () => ({ collapsed: false, setCollapsed: () => {} });
export const ThemeSwitcher = () => null;
export const LegibilityToggle = () => null;
export const MobileNavSheet = () => null;
export const useLojaAtiva = () => ({ lojaAtivaId: qa.loja });
export const registrarGuardaTrocaLojaV4 = () => {};
export const useRouter = () => ({ push: () => {} });
export const listOrdens = async (sid: string) => [ordem("a", sid), ordem("b", sid)];
export const getOrdem = async (sid: string, id: string) => ordem(id, sid);
export const listTecnicos = async () => [];
export const lerProjecaoFinanceiraOSV4 = async () => null;
export const lerProjecoesFinanceirasOSV4 = async () => [];
export const getCaixaSessaoAbertaV3 = async () => ({ aberta: false });
export const lerPagamentoOSV3 = async () => ({ total: 0, recebido: 0, saldo: 0, status: "aberto", sessao: null });
export const corrigirDatasOSV3 = async () => {
  qa.correcoes++;
  return new Promise<unknown>((resolve) => { qa.corrigir.push(resolve); });
};
export const salvarAcessoriosEntradaV3 = async () => {
  qa.entradas++;
  return new Promise<void>((resolve) => { qa.entrada.push(resolve); });
};
const noop = async () => {};
// O Financeiro 002 integrado acrescentou estes imports ao hook real. Os casos
// desta fixture exercitam datas/foco; qualquer comando financeiro é um erro.
const financeiroForaDoEscopo = async () => { throw new Error("QA_DATAS: comando financeiro inesperado"); };
export {
  financeiroForaDoEscopo as aprovarOrcamentoParaReceberV3,
  financeiroForaDoEscopo as conferirEscopoAprovacaoV3,
  financeiroForaDoEscopo as conferirFormalizacaoAprovacaoV3,
  financeiroForaDoEscopo as formalizarAprovacaoPendenteV3,
};
export {
  noop as receberOSV3, noop as estornarRecebimentoOSV3, noop as registrarRecebimentoMistoOSV3, noop as lancarOSAPrazoV3,
  noop as registrarEntregaV3, noop as salvarAssinaturaRetiradaV3, noop as adicionarFotoSaidaV3, noop as removerFotoSaidaV3,
  noop as salvarDiagnosticoV3, noop as salvarChecklistEntradaV3, noop as gerarOrcamentoDaOS, noop as salvarOrcamentoV3,
  noop as corrigirOrcamentoV3, noop as aprovarOrcamentoV3, noop as recusarOrcamentoV3, noop as aplicarTransicaoStatusV3,
  noop as salvarIdentificacaoV3, noop as salvarProvaEntradaV3, noop as adicionarFotoEntradaV3, noop as removerFotoEntradaV3,
  noop as salvarAssinaturaClienteV3, noop as salvarDadosBasicosOSV3, noop as atribuirTecnicoV3, noop as definirPrioridadeV3,
  noop as definirLocalFisicoV3, noop as adicionarObservacaoInternaV3, noop as salvarChecklistTecnicoV3,
  noop as consumirEstoqueOSActionV3, noop as registrarImpressaoDocumentoV3, noop as salvarGarantiaOSV3,
  noop as abrirRetornoV3, noop as finalizarRetornoV3, noop as buscarOrigensRetornoV3, noop as lerOrigemRetornoV3,
  noop as enviarOrcamentoPorCanalV3,
};

// Link é só uma âncora no ambiente sem roteador Next. Topbar/Command/Dialog são reais.
export default function Link(props: ComponentProps<"a">) { return createElement("a", props); }
