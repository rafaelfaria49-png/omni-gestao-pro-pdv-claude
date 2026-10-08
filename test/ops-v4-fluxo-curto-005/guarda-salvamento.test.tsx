// OPS-V4-FLUXO-CURTO-005 (rev 11) — causa raiz na guarda de rascunho do GOAL 001.
//
// `confirmarSalvamento` só libera a saída capturada se, depois do `await salvar()`,
// a pendência ainda for EXATAMENTE a mesma. Cancelada ou substituída durante o
// salvamento: nenhum `sair()` antigo, nenhuma pendência nova apagada. Guarda REAL
// (`criarGuardaRascunhos`) + hook real do bloco (`useNavegacaoGuardadaV4`).
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@/app/actions/ordens", () => ({ listOrdens: vi.fn(async () => []), getOrdem: vi.fn(async () => null) }));
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({ salvarDiagnosticoV3: vi.fn(), salvarChecklistEntradaV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(),
  salvarOrcamentoV3: vi.fn(),
  corrigirOrcamentoV3: vi.fn(),
  aprovarOrcamentoV3: vi.fn(),
  recusarOrcamentoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/status-actions", () => ({ aplicarTransicaoStatusV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/prova-entrada-actions", () => ({
  salvarIdentificacaoV3: vi.fn(),
  salvarProvaEntradaV3: vi.fn(),
  salvarAcessoriosEntradaV3: vi.fn(),
  adicionarFotoEntradaV3: vi.fn(),
  removerFotoEntradaV3: vi.fn(),
  salvarAssinaturaClienteV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/dados-basicos-actions", () => ({ salvarDadosBasicosOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/producao-actions", () => ({
  atribuirTecnicoV3: vi.fn(),
  definirPrioridadeV3: vi.fn(),
  definirLocalFisicoV3: vi.fn(),
  adicionarObservacaoInternaV3: vi.fn(),
  salvarChecklistTecnicoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/estoque-actions", () => ({ consumirEstoqueOSActionV3: vi.fn() }));
vi.mock("@/app/actions/cadastros", () => ({ listTecnicos: vi.fn(async () => []) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/operacoes-v3/entrega-actions", () => ({
  salvarAssinaturaRetiradaV3: vi.fn(),
  registrarEntregaV3: vi.fn(),
  adicionarFotoSaidaV3: vi.fn(),
  removerFotoSaidaV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v3/garantia-actions", () => ({ registrarImpressaoDocumentoV3: vi.fn(), salvarGarantiaOSV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/retorno-actions", () => ({ abrirRetornoV3: vi.fn(), finalizarRetornoV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })),
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
  lancarOSAPrazoV3: vi.fn(),
}));
vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(),
}));

import { criarGuardaRascunhos } from "@/components/operacoes-v4-preview/use-entrada-draft-guard";
import { useNavegacaoGuardadaV4 } from "@/components/operacoes-v4-preview/use-v4-preview";

const A = "loja-1::os-A";
const B = "loja-1::os-B";

function adiado() {
  let resolver: (ok: boolean) => void = () => {};
  const promessa = new Promise<boolean>((r) => { resolver = r; });
  return { promessa, resolver: (ok: boolean) => resolver(ok) };
}

/** Guarda REAL com rascunho sujo em A; o salvar fica retido até `salvando.resolver`. */
function guardaSujaEmA() {
  const guarda = criarGuardaRascunhos<unknown>();
  const salvando = adiado();
  const salvar = vi.fn(() => salvando.promessa);
  const descartar = vi.fn();
  guarda.publicar(A, { campo: "x" }, true, { salvar, descartar });
  return { guarda, salvando, salvar, descartar };
}

describe("OPS-V4-FLUXO-CURTO-005 rev 11 — confirmarSalvamento só libera a MESMA pendência", () => {
  it("G1 salvamento lento + Cancelar: a saída antiga não executa e nada volta a ficar pendente", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const sairAntiga = vi.fn();
    expect(guarda.solicitarSaida(sairAntiga, { chave: A, descricao: "ir para entrega" })).toBe("bloqueada");
    const salvamento = guarda.confirmarSalvamento();
    guarda.cancelarSaida();
    expect(guarda.pendente).toBeNull();
    salvando.resolver(true);
    expect(await salvamento).toBe("aguardando");
    expect(sairAntiga).not.toHaveBeenCalled();
    expect(guarda.pendente).toBeNull();
  });

  it("G2 substituída pela pipeline durante o salvamento: a antiga não executa e a NOVA pendência sobrevive", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const sairAntiga = vi.fn();
    const sairPipeline = vi.fn();
    guarda.solicitarSaida(sairAntiga, { chave: A, descricao: "ir para entrega" });
    const salvamento = guarda.confirmarSalvamento();
    // Operador clica "Diagnóstico" na pipeline com o rascunho ainda sujo.
    expect(guarda.solicitarSaida(sairPipeline, { chave: A, descricao: "ir para a etapa diagnostico" })).toBe("bloqueada");
    salvando.resolver(true);
    expect(await salvamento).toBe("aguardando");
    expect(sairAntiga).not.toHaveBeenCalled();
    expect(sairPipeline).not.toHaveBeenCalled();
    expect(guarda.pendente).toEqual({ chave: A, descricao: "ir para a etapa diagnostico" });
    // A decisão volta ao operador sobre a pendência vigente.
    expect(guarda.confirmarDescarte()).toBe("saiu");
    expect(sairPipeline).toHaveBeenCalledTimes(1);
    expect(sairAntiga).not.toHaveBeenCalled();
  });

  it("G3 substituída pela troca de OS (Descartar → B) durante o salvamento: a saída de A nunca roda depois", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const sairA = vi.fn();
    const selecionarB = vi.fn();
    guarda.solicitarSaida(sairA, { chave: A, descricao: "ir para entrega" });
    const salvamento = guarda.confirmarSalvamento();
    guarda.solicitarSaida(selecionarB, { chave: A, descricao: `trocar para ${B}` });
    expect(guarda.confirmarDescarte()).toBe("saiu");
    expect(selecionarB).toHaveBeenCalledTimes(1);
    salvando.resolver(true);
    expect(await salvamento).toBe("aguardando");
    expect(sairA).not.toHaveBeenCalled();
    expect(guarda.pendente).toBeNull();
  });

  it("G4 caminho normal preservado: salvar com sucesso libera a saída 1× e limpa o rascunho", async () => {
    const { guarda, salvando, salvar } = guardaSujaEmA();
    const sair = vi.fn();
    guarda.solicitarSaida(sair, { chave: A, descricao: "ir para entrega" });
    const salvamento = guarda.confirmarSalvamento();
    salvando.resolver(true);
    expect(await salvamento).toBe("saiu");
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledTimes(1);
    expect(guarda.pendente).toBeNull();
    expect(guarda.sujo(A)).toBe(false);
  });

  it("G5 duplo clique em Salvar sobre a mesma pendência: a saída roda uma única vez", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const sair = vi.fn();
    guarda.solicitarSaida(sair, { chave: A, descricao: "ir para entrega" });
    const primeiro = guarda.confirmarSalvamento();
    const segundo = guarda.confirmarSalvamento();
    salvando.resolver(true);
    const resultados = await Promise.all([primeiro, segundo]);
    expect(resultados.sort()).toEqual(["aguardando", "saiu"]);
    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("G6 salvar que falha mantém a pendência e não executa a saída", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const sair = vi.fn();
    guarda.solicitarSaida(sair, { chave: A, descricao: "ir para entrega" });
    const salvamento = guarda.confirmarSalvamento();
    salvando.resolver(false);
    expect(await salvamento).toBe("aguardando");
    expect(sair).not.toHaveBeenCalled();
    expect(guarda.pendente).toEqual({ chave: A, descricao: "ir para entrega" });
  });

  it("G7 cenário exato da R3: intenção do bloco (Abrir entrega) + Salvar lento + pipeline Diagnóstico → nunca abre Entrega nem apaga a nova pendência", async () => {
    const { guarda, salvando } = guardaSujaEmA();
    const irPara = vi.fn();
    const { result } = renderHook(() => useNavegacaoGuardadaV4({ guarda, chaveViva: () => A, irPara }));
    act(() => result.current("entrega", "ir para a etapa entrega", true));
    let salvamento: Promise<unknown> = Promise.resolve();
    act(() => { salvamento = guarda.confirmarSalvamento(); });
    const irParaDiagnostico = vi.fn();
    act(() => { guarda.solicitarSaida(irParaDiagnostico, { chave: A, descricao: "ir para a etapa diagnostico" }); });
    await act(async () => { salvando.resolver(true); await salvamento; });
    expect(irPara).not.toHaveBeenCalled();
    expect(guarda.pendente).toEqual({ chave: A, descricao: "ir para a etapa diagnostico" });
    act(() => { guarda.confirmarDescarte(); });
    expect(irParaDiagnostico).toHaveBeenCalledTimes(1);
    expect(irPara).not.toHaveBeenCalled();
  });
});
