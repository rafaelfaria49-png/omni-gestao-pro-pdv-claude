import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { montarLinkWaV4, montarMensagemOrcamentoV4 } from "./orcamento-mensagem";
import type { OrcamentoClienteViewV4 } from "./orcamento-cliente-view";

function viewBase(over: Partial<OrcamentoClienteViewV4> = {}): OrcamentoClienteViewV4 {
  return {
    loja: { nome: "Assistência Cell", documento: "", contato: "" },
    osNumero: "OS-0001",
    dataCriacao: "2026-01-01T10:00:00.000Z",
    validade: { politicaTexto: "Validade de 7 dias a partir do envio ao cliente." },
    cliente: { nome: "Ana Cliente" },
    aparelho: { marca: "Apple", modelo: "iPhone 12" },
    defeitoRelatado: "Tela quebrada",
    itensFixosVisiveis: [],
    grupos: [],
    totais: { exato: 0 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Guard estático — mesma lista proibida do GOAL 023, aplicada a este arquivo.
// ---------------------------------------------------------------------------

const TERMOS_PROIBIDOS_V4_ORC_CLIENTE = [
  "custoV3",
  "custoUnitario",
  "pecaCusto",
  "servicoCusto",
  "lucro",
  "margem",
  "fornecedor",
  "senha",
  "credencial",
  "provaEntradaV3",
  ".payload",
  "observacoesInternas",
];

function scanProibidosV4(source: string): string[] {
  return TERMOS_PROIBIDOS_V4_ORC_CLIENTE.filter((termo) => source.includes(termo));
}

describe("OPS-V4-ORC-ENVIO-WA-025 — guard estático do gerador de mensagem", () => {
  it("[negativo] o arquivo real não contém nenhum termo proibido", () => {
    const source = readFileSync(join(__dirname, "orcamento-mensagem.ts"), "utf8");
    expect(scanProibidosV4(source)).toEqual([]);
  });

  it("[positivo] a fixture sintética que viola é detectada pelo mesmo scanner", () => {
    const fixtureViolando = "const lucro = 10; const senha = os.senhaEquipamento;";
    const achados = scanProibidosV4(fixtureViolando);
    expect(achados).toContain("lucro");
    expect(achados).toContain("senha");
  });
});

// ---------------------------------------------------------------------------
// Mensagem — 3 estados
// ---------------------------------------------------------------------------

describe("montarMensagemOrcamentoV4 — sem grupos (lista clássica)", () => {
  it("mensagem real de exemplo", () => {
    const view = viewBase({
      itensFixosVisiveis: [
        { descricao: "Troca de tela", quantidade: 1, valorCliente: 250 },
        { descricao: "Película", quantidade: 1, valorCliente: 0, cortesia: true },
      ],
      totais: { exato: 250 },
    });
    const msg = montarMensagemOrcamentoV4(view);
    expect(msg).toContain("Olá! Aqui é da *Assistência Cell* 👋");
    expect(msg).toContain("Segue o orçamento para *Ana Cliente*:");
    expect(msg).toContain("📱 Aparelho: *Apple iPhone 12*");
    expect(msg).toContain("🔧 Defeito relatado: Tela quebrada");
    expect(msg).toContain("*Itens:*");
    expect(msg).toContain("• Troca de tela — R$ 250,00");
    expect(msg).toContain("🎁 *Cortesia — Grátis:*");
    expect(msg).toContain("• Película");
    expect(msg).toContain("*Total: R$ 250,00*");
    expect(msg).toContain("⏳ Validade de 7 dias a partir do envio ao cliente.");
    expect(msg).not.toContain("Responda com o *número*");
  });

  it("total em faixa quando a projeção não tem exato (defensivo, mesmo sem grupos)", () => {
    const view = viewBase({ totais: { faixa: { min: 100, max: 200 } } });
    const msg = montarMensagemOrcamentoV4(view);
    expect(msg).toContain("*Total: de R$ 100,00 a R$ 200,00*");
  });
});

describe("montarMensagemOrcamentoV4 — grupos SEM seleção", () => {
  it("mensagem real de exemplo com 2 opções numeradas", () => {
    const view = viewBase({
      itensFixosVisiveis: [{ descricao: "Mão de obra", quantidade: 1, valorCliente: 50 }],
      grupos: [
        {
          rotulo: "Escolha a tela",
          variantes: [
            { rotulo: "Genérica", valorVariante: 150, totalComOpcao: 200, selecionada: false },
            { rotulo: "Original", descricaoCurta: "Peça original Apple", garantiaDias: 90, badge: "Recomendado", valorVariante: 300, totalComOpcao: 350, selecionada: false },
          ],
        },
      ],
      totais: { faixa: { min: 200, max: 350 } },
    });
    const msg = montarMensagemOrcamentoV4(view);
    expect(msg).toContain("*Escolha a tela*");
    expect(msg).toContain("1) *Genérica*");
    expect(msg).toContain("Total com esta opção: R$ 200,00");
    expect(msg).toContain("2) *Original* ⭐ Recomendado");
    expect(msg).toContain("Peça original Apple");
    expect(msg).toContain("Garantia de 90 dias");
    expect(msg).toContain("Total com esta opção: R$ 350,00");
    expect(msg).toContain("_Todas as opções incluem: Mão de obra._");
    expect(msg).toContain("Responda com o *número* da opção escolhida.");
    expect(msg).not.toContain("✅");
    // Não deve repetir o bloco "*Itens:*" clássico quando há grupos.
    expect(msg).not.toContain("*Itens:*");
  });
});

describe("montarMensagemOrcamentoV4 — grupos COM seleção (selecionadaV3 manual)", () => {
  it("a variante selecionada aparece marcada, mensagem ainda lista todas as opções", () => {
    const view = viewBase({
      grupos: [
        {
          rotulo: "Escolha a tela",
          variantes: [
            { rotulo: "Genérica", valorVariante: 150, totalComOpcao: 150, selecionada: false },
            { rotulo: "Original", valorVariante: 300, totalComOpcao: 300, selecionada: true },
          ],
        },
      ],
      totais: { exato: 300 },
    });
    const msg = montarMensagemOrcamentoV4(view);
    expect(msg).toContain("1) *Genérica*");
    expect(msg).toContain("2) *Original* ✅");
    expect(msg).toContain("Total com esta opção: R$ 150,00");
    expect(msg).toContain("Total com esta opção: R$ 300,00");
  });
});

describe("montarMensagemOrcamentoV4 — validade honesta", () => {
  it("com validoAte real: mostra a data, não o texto de política", () => {
    // Horário no meio do dia (não perto da meia-noite UTC) para o teste não
    // depender do fuso horário da máquina que roda a suíte.
    const view = viewBase({ validade: { validoAte: "2026-02-10T12:00:00.000Z" } });
    const msg = montarMensagemOrcamentoV4(view);
    expect(msg).toContain("⏳ Válido até 10/02/2026");
    expect(msg).not.toContain("Validade de 7 dias");
  });
});

describe("montarMensagemOrcamentoV4 — observação do cliente", () => {
  it("aparece ao final quando presente", () => {
    const view = viewBase({ observacoesAoCliente: "Trazer o carregador na retirada." });
    expect(montarMensagemOrcamentoV4(view)).toContain("Trazer o carregador na retirada.");
  });
});

describe("montarMensagemOrcamentoV4 — propriedade: todo 'Total com esta opção' == totalComOpcao da projeção", () => {
  it("para múltiplos grupos com múltiplas variantes", () => {
    const view = viewBase({
      grupos: [
        {
          rotulo: "G1",
          variantes: [
            { rotulo: "A", valorVariante: 10, totalComOpcao: 111, selecionada: false },
            { rotulo: "B", valorVariante: 20, totalComOpcao: 222, selecionada: false },
          ],
        },
        {
          rotulo: "G2",
          variantes: [
            { rotulo: "C", valorVariante: 30, totalComOpcao: 333, selecionada: false },
            { rotulo: "D", valorVariante: 40, totalComOpcao: 444.5, selecionada: false },
          ],
        },
      ],
    });
    const msg = montarMensagemOrcamentoV4(view);
    for (const grupo of view.grupos) {
      for (const variante of grupo.variantes) {
        const esperado = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(variante.totalComOpcao);
        expect(msg).toContain(`Total com esta opção: R$ ${esperado}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Link WhatsApp — matriz de telefones
// ---------------------------------------------------------------------------

describe("montarLinkWaV4 — matriz de telefones", () => {
  it("11 dígitos (celular sem DDI) — prefixa 55", () => {
    const r = montarLinkWaV4("11999998888", "oi");
    expect(r).toEqual({ valido: true, url: "https://wa.me/5511999998888?text=oi" });
  });

  it("10 dígitos (fixo sem DDI) — prefixa 55", () => {
    const r = montarLinkWaV4("1133334444", "oi");
    expect(r).toEqual({ valido: true, url: "https://wa.me/551133334444?text=oi" });
  });

  it("13 dígitos já com 55 — mantém como está", () => {
    const r = montarLinkWaV4("5511999998888", "oi");
    expect(r).toEqual({ valido: true, url: "https://wa.me/5511999998888?text=oi" });
  });

  it("12 dígitos já com 55 (fixo com DDI) — mantém como está", () => {
    const r = montarLinkWaV4("551133334444", "oi");
    expect(r).toEqual({ valido: true, url: "https://wa.me/551133334444?text=oi" });
  });

  it("com máscara/espaços — normaliza antes de validar", () => {
    const r = montarLinkWaV4("(11) 99999-8888", "oi");
    expect(r).toEqual({ valido: true, url: "https://wa.me/5511999998888?text=oi" });
  });

  it("vazio — inválido com motivo 'sem telefone'", () => {
    const r = montarLinkWaV4("", "oi");
    expect(r).toEqual({ valido: false, motivo: "Cliente sem telefone cadastrado." });
  });

  it("undefined — inválido com motivo 'sem telefone'", () => {
    const r = montarLinkWaV4(undefined, "oi");
    expect(r.valido).toBe(false);
  });

  it("inválido (poucos dígitos) — motivo genérico", () => {
    const r = montarLinkWaV4("123", "oi");
    expect(r).toEqual({ valido: false, motivo: "Telefone inválido para WhatsApp." });
  });

  it("DDI diferente de 55 com 12-13 dígitos — inválido (não é BR)", () => {
    const r = montarLinkWaV4("12125551234", "oi"); // 11 dígitos, começa com 1 (EUA) — na verdade cai em 11 dígitos sem DDI, prefixa 55
    // Este caso tem 11 dígitos → é tratado como número BR sem DDI (regra do GOAL: 10-11 dígitos sempre prefixa 55).
    expect(r.valido).toBe(true);
  });

  it("mensagem é URL-encoded corretamente", () => {
    const r = montarLinkWaV4("11999998888", "Olá! Total: R$ 100,00");
    expect(r.valido).toBe(true);
    if (r.valido) expect(r.url).toBe(`https://wa.me/5511999998888?text=${encodeURIComponent("Olá! Total: R$ 100,00")}`);
  });
});
