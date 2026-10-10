import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  chaveRelatoRetornoV4,
  encerrarOperacaoNoRascunhoV4,
  enquadrarOrigemRetornoV4,
  LIMITE_OBSERVACAO_INTERNA_V3,
  LIMITE_OCORRENCIA_PRE_ENTREGA_V4,
  normalizarAcessoriosRetornoV4,
  ocorrenciaPreEntregaV4,
  operacaoDoRelatoV4,
  PREFIXO_OCORRENCIA_PRE_ENTREGA_V4,
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

  it("R3-N3: operação concluída encerra o rascunho só se o texto ainda for o dela", () => {
    const relato = { motivo: "Touch", acessorios: [] as string[] };
    const operacao = { id: "op-1", chave: chaveRelatoRetornoV4(relato) };
    expect(encerrarOperacaoNoRascunhoV4({ ...relato, operacao }, "op-1")).toBeNull();
    expect(encerrarOperacaoNoRascunhoV4({ motivo: "Touch e câmera", acessorios: [], operacao }, "op-1")).toEqual({ motivo: "Touch e câmera", acessorios: [] });
    expect(encerrarOperacaoNoRascunhoV4({ ...relato, operacao }, "op-2")).toBeUndefined();
    expect(encerrarOperacaoNoRascunhoV4(null, "op-1")).toBeUndefined();
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

describe("ocorrência antes da entrega — limite derivado do prefixo (rev 15, P2 nº 1)", () => {
  it("o limite do relato é o do servidor menos o prefixo efetivamente enviado", () => {
    expect(PREFIXO_OCORRENCIA_PRE_ENTREGA_V4).toBe("Ocorrência antes da entrega: ");
    expect(PREFIXO_OCORRENCIA_PRE_ENTREGA_V4.length).toBe(29);
    expect(LIMITE_OCORRENCIA_PRE_ENTREGA_V4).toBe(LIMITE_OBSERVACAO_INTERNA_V3 - PREFIXO_OCORRENCIA_PRE_ENTREGA_V4.length);
    expect(LIMITE_OCORRENCIA_PRE_ENTREGA_V4).toBe(1971);
  });

  it("exatamente no limite: aceita e o conteúdo final tem 2000 caracteres", () => {
    const r = ocorrenciaPreEntregaV4("a".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4));
    expect(r).toMatchObject({ ok: true, tamanho: 1971 });
    expect(r.ok && r.conteudo.length).toBe(LIMITE_OBSERVACAO_INTERNA_V3);
    expect(r.ok && r.conteudo.startsWith(PREFIXO_OCORRENCIA_PRE_ENTREGA_V4)).toBe(true);
  });

  it("um caractere acima e relato de 2000: recusa sem truncar (nada é enviado)", () => {
    expect(ocorrenciaPreEntregaV4("a".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4 + 1))).toEqual({ ok: false, motivo: "excede", tamanho: 1972 });
    expect(ocorrenciaPreEntregaV4("a".repeat(2000))).toEqual({ ok: false, motivo: "excede", tamanho: 2000 });
  });

  it("espaços nas bordas não contam (o servidor apara); espaços internos e quebras de linha contam", () => {
    const borda = `  \n${"a".repeat(LIMITE_OCORRENCIA_PRE_ENTREGA_V4)}\n  `;
    const r = ocorrenciaPreEntregaV4(borda);
    expect(r).toMatchObject({ ok: true, tamanho: 1971 });
    expect(r.ok && r.conteudo).toBe(`${PREFIXO_OCORRENCIA_PRE_ENTREGA_V4}${"a".repeat(1971)}`);
    const linhas = `${"a".repeat(1000)}\n${"b".repeat(970)}`; // 1971 com a quebra
    expect(ocorrenciaPreEntregaV4(linhas)).toMatchObject({ ok: true, tamanho: 1971 });
    expect(ocorrenciaPreEntregaV4(`${linhas}b`)).toMatchObject({ ok: false, motivo: "excede", tamanho: 1972 });
    expect(ocorrenciaPreEntregaV4(" \n\t ")).toEqual({ ok: false, motivo: "vazia", tamanho: 0 });
  });

  it("Unicode: mede como o servidor (UTF-16) — acento conta 1, emoji fora do BMP conta 2", () => {
    expect(ocorrenciaPreEntregaV4("é".repeat(1971))).toMatchObject({ ok: true, tamanho: 1971 });
    expect(ocorrenciaPreEntregaV4("é".repeat(1972))).toMatchObject({ ok: false, motivo: "excede" });
    const emoji = "📱".repeat(985) + "a"; // 985×2 + 1 = 1971 unidades
    expect(ocorrenciaPreEntregaV4(emoji)).toMatchObject({ ok: true, tamanho: 1971 });
    expect(ocorrenciaPreEntregaV4("📱".repeat(986))).toMatchObject({ ok: false, motivo: "excede", tamanho: 1972 });
  });
});
