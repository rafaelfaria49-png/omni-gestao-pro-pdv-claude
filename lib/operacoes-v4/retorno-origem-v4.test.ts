import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  chaveRelatoRetornoV4,
  enquadrarOrigemRetornoV4,
  normalizarAcessoriosRetornoV4,
  operacaoDoRelatoV4,
  resumirOrigemRetornoV4,
} from "./retorno-origem-v4";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function os(extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-1",
    codigo: "OS-1042",
    status: "entregue",
    operacaoStatusV3: "entregue",
    clienteId: "cli-1",
    cliente: { id: "cli-1", nome: "Maria", telefone: "11999990000" },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S22", numeroSerie: "IMEI-1", acessorios: ["Capa", "capa", "Chip"], defeitoRelatado: "Tela quebrada" },
    senhaEquipamento: "1478",
    servicosCatalogo: [{ servicoId: "s1", descricao: "Troca de tela", custoInterno: 0, valorVenda: 300, prazoGarantiaDias: 90, termoGarantia: "" }],
    entregaV3: { entregueEm: "2026-08-01T12:00:00.000Z" },
    aberturaV3: { garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias: 90 } },
    timeline: [],
    ...extra,
  } as unknown as OrdemServico;
}

describe("enquadrarOrigemRetornoV4 — mesma ordem de decisão do servidor", () => {
  it("A: garantia ativa → abrir retorno sem prometer cobertura do novo defeito", () => {
    const e = enquadrarOrigemRetornoV4(os(), NOW);
    expect(e).toMatchObject({ id: "garantia_ativa", acao: "abrir_retorno", tone: "success" });
    expect(e.descricao).toContain("não confirma que o novo defeito está coberto");
  });

  it("B: vencida ou sem cobertura → registra, sem cobertura confirmada", () => {
    expect(enquadrarOrigemRetornoV4(os({ entregaV3: { entregueEm: "2025-01-01T12:00:00.000Z" } }), NOW)).toMatchObject({ id: "fora_cobertura", acao: "abrir_retorno" });
    expect(enquadrarOrigemRetornoV4(os({ aberturaV3: { garantiaPrevista: { modelo: "sem_garantia", prazoDias: 0 } } }), NOW).id).toBe("fora_cobertura");
  });

  it("C: garantia não informada → nunca positiva", () => {
    const e = enquadrarOrigemRetornoV4(os({ aberturaV3: {} }), NOW);
    expect(e).toMatchObject({ id: "garantia_nao_informada", acao: "abrir_retorno", tone: "neutro" });
  });

  it("D: não entregue → ocorrência (observação), nunca retorno", () => {
    expect(enquadrarOrigemRetornoV4(os({ entregaV3: undefined, status: "pronta", operacaoStatusV3: "pronta" }), NOW)).toMatchObject({ id: "nao_entregue", acao: "registrar_ocorrencia" });
  });

  it("cancelada, retorno em andamento, abertura em processamento, dados incompletos", () => {
    expect(enquadrarOrigemRetornoV4(os({ status: "cancelada", operacaoStatusV3: "cancelada" }), NOW)).toMatchObject({ id: "cancelada", acao: "nenhuma" });
    expect(enquadrarOrigemRetornoV4(os({ retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "x", criadoEm: "2026-08-10T00:00:00.000Z", status: "aberto", osRetornoId: "f" }] }), NOW)).toMatchObject({ id: "retorno_em_andamento", acao: "continuar_atendimento" });
    expect(enquadrarOrigemRetornoV4(os({ retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "x", criadoEm: "2026-08-15T11:59:00.000Z", status: "aberto", operacaoId: "op-00000001", reserva: { token: "t", expiraEm: "2026-08-15T12:10:00.000Z" } }] }), NOW)).toMatchObject({ id: "abertura_em_processamento", acao: "aguardar" });
    expect(enquadrarOrigemRetornoV4(os({ clienteId: "", cliente: { nome: "Avulso" } }), NOW)).toMatchObject({ id: "dados_incompletos", acao: "nenhuma" });
    expect(enquadrarOrigemRetornoV4(os({ equipamento: { tipo: "Smartphone", marca: "", modelo: "" } }), NOW).id).toBe("dados_incompletos");
  });

  it("legado em aberto sem atendimento → abrir o atendimento dele; reserva EXPIRADA de outra operação não bloqueia", () => {
    expect(enquadrarOrigemRetornoV4(os({ retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "x", criadoEm: "2026-08-10T00:00:00.000Z", status: "aberto" }] }), NOW)).toMatchObject({ id: "retorno_sem_atendimento", acao: "abrir_retorno" });
    const expirada = os({ retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "x", criadoEm: "2026-08-15T10:00:00.000Z", status: "aberto", operacaoId: "op-00000001", reserva: { token: "t", expiraEm: "2026-08-15T10:15:00.000Z" } }] });
    expect(enquadrarOrigemRetornoV4(expirada, NOW).id).toBe("garantia_ativa");
    expect(resumirOrigemRetornoV4(expirada, NOW).aberturaInterrompida).toBe(true);
  });
});

describe("resumirOrigemRetornoV4 — dados herdados, sem credencial", () => {
  it("herda cliente/aparelho/serviço/entrega/garantia e nunca expõe senha", () => {
    const r = resumirOrigemRetornoV4(os({ retornosV3: [{ id: "r0", osOriginalId: "os-1", motivo: "Bateria", observacao: "Primeira vez", criadoEm: "2026-08-05T00:00:00.000Z", status: "finalizado", osRetornoId: "f0", osRetornoCodigo: "OS-F0" }] }), NOW);
    expect(r).toMatchObject({
      osId: "os-1",
      codigo: "OS-1042",
      cliente: { id: "cli-1", nome: "Maria", telefone: "11999990000" },
      aparelho: { marca: "Samsung", modelo: "S22", identificacao: "IMEI-1", descricao: "Samsung S22" },
      defeitoOriginal: "Tela quebrada",
      servicoExecutado: ["Troca de tela"],
      entregueEm: "2026-08-01T12:00:00.000Z",
      garantia: { situacao: "ativa", prazoDias: 90, vencimento: "2026-10-30T12:00:00.000Z" },
      acessoriosOriginais: ["Capa", "Chip"],
    });
    expect(r.retornos).toEqual([expect.objectContaining({ id: "r0", status: "finalizado", osRetornoCodigo: "OS-F0", observacao: "Primeira vez", emAbertura: false })]);
    expect(r.retornoAberto).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("1478");
  });

  it("R2-F8: expõe a operação que abriu cada retorno (o cliente reconhece a própria operação concluída)", () => {
    const r = resumirOrigemRetornoV4(os({ retornosV3: [{ id: "r1", osOriginalId: "os-1", motivo: "x", criadoEm: "2026-08-10T00:00:00.000Z", status: "aberto", osRetornoId: "f1", operacaoId: "rtv4-abc12345" }] }), NOW);
    expect(r.retornos[0]).toMatchObject({ operacaoId: "rtv4-abc12345", osRetornoId: "f1" });
  });
});

describe("relato e identidade da operação", () => {
  it("normaliza acessórios (apara, sem vazios/duplicados, limite)", () => {
    expect(normalizarAcessoriosRetornoV4([" Capa ", "capa", "", null, "Chip"])).toEqual(["Capa", "Chip"]);
    expect(normalizarAcessoriosRetornoV4(Array.from({ length: 40 }, (_, i) => `A${i}`))).toHaveLength(20);
  });

  it("chave do relato ignora espaços/ordem/caixa dos acessórios e nunca inclui senha", () => {
    const a = chaveRelatoRetornoV4({ motivo: " Touch ", observacao: "", acessorios: ["Chip", "capa"] });
    const b = chaveRelatoRetornoV4({ motivo: "Touch", acessorios: ["Capa", "chip"] });
    expect(a).toBe(b);
    expect(chaveRelatoRetornoV4({ motivo: "Touch!", acessorios: [] })).not.toBe(a);
  });

  it("retry do MESMO relato reusa a operação; relato editado gera operação nova", () => {
    let n = 0;
    const gerar = () => `op-${++n}`;
    const relato = { motivo: "Touch", acessorios: [] };
    const primeira = operacaoDoRelatoV4(undefined, relato, gerar);
    expect(primeira.id).toBe("op-1");
    expect(operacaoDoRelatoV4(primeira, { ...relato }, gerar).id).toBe("op-1");
    expect(operacaoDoRelatoV4(primeira, { motivo: "Touch e câmera", acessorios: [] }, gerar).id).toBe("op-2");
  });
});
