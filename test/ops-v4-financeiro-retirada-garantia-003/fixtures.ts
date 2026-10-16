import type { OrdemServico } from "@/types/os";

/** Nenhum dado real; usada no servidor, no PostgreSQL descartável e na prévia. */
export function osGarantiasSinteticaV3(over: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "qa-garantias", storeId: "000-qa-frg-001", codigo: "OS-QA-GARANTIAS", status: "pronta", operacaoStatusV3: "pronta",
    criadoEm: "2026-10-01T12:00:00.000Z", atualizadoEm: "2026-10-01T12:00:00.000Z",
    cliente: { id: "qa-cliente", nome: "Cliente Sintético Garantias", telefone: "" },
    equipamento: { tipo: "Celular", marca: "Marca QA", modelo: "Aparelho sintético", numeroSerie: "SERIE-SINTETICA", defeitoRelatado: "Falhas sintéticas" },
    aberturaV3: { recepcao: { dataEntrada: "2026-10-01T12:00:00.000Z" } },
    senhaEquipamento: "SEGREDO-NAO-IMPRIMIR", observacoes: [{ conteudo: "INTERNO-NAO-IMPRIMIR" }],
    orcamento: {
      id: "qa-orc", status: "aprovado", total: 0, desconto: 0, pecas: [], criadoEm: "2026-10-01T12:00:00.000Z",
      servicos: [
        { id: "tela-1", descricao: "Troca de Tela", valor: 0, custoV3: 987654, catalogoServicoId: "catalogo-tela", garantiaModeloId: "tela", prazoGarantiaDias: 90 },
        { id: "software-1", descricao: "Software", valor: 0, garantiaModeloId: "software", prazoGarantiaDias: 30 },
        { id: "tela-2", descricao: "Troca de Tela", valor: 0, catalogoServicoId: "catalogo-tela", garantiaModeloId: "tela", prazoGarantiaDias: 90 },
        { id: "opcao-nao-escolhida", descricao: "Tela alternativa não escolhida", valor: 0, grupoId: "alternativas", selecionadaV3: false, varianteV3: { rotulo: "Alternativa", garantiaDias: 15 } },
        { id: "dados-1", descricao: "Transferência de Dados", valor: 0, garantiaModeloId: "transferencia_dados", prazoGarantiaDias: 0 },
      ],
    }, timeline: [], ...over,
  } as unknown as OrdemServico;
}
