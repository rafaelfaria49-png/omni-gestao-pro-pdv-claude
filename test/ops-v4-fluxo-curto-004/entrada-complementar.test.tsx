// OPS-V4-FLUXO-CURTO-004 — Entrada como complementação (UI montada, jsdom).
//
// Editor real (EntradaWorkspace/EntradaStage + seções) com V4Vals sintético:
// pendências derivadas da OS "do servidor" (realOS) e handlers espiões. Cobre
// U01–U12 e os aceites de UI A02/A03/A04/A06/A07/A08/A09/A13/A14. Nenhum skip.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import type { OrdemServico } from "@/types/os";
import { seedEntradaEditor } from "@/lib/operacoes-v4/entrada-form";
import { seedDadosBasicos } from "@/lib/operacoes-v4/dados-basicos-form";
import { criarGuardaRascunhos } from "@/components/operacoes-v4-preview/use-entrada-draft-guard";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import { EntradaWorkspace } from "@/components/operacoes-v4-preview/parts/stages/EntradaWorkspace";
import { EntradaStage } from "@/components/operacoes-v4-preview/parts/stages/EntradaStage";

vi.mock("@/components/operacoes-v3/components/SignaturePadV3", () => ({ SignaturePadV3: () => null }));

afterEach(() => cleanup());

function Sessao({ children }: { children: ReactNode }) {
  return <SessionProvider session={null}>{children}</SessionProvider>;
}
const montar = (ui: ReactElement) => render(ui, { wrapper: Sessao });

function evento(nome: string, extra: Record<string, unknown> = {}) {
  return { id: `ev-${nome}-${Math.random()}`, tipo: "observacao", autor: "QA", criadoEm: "2026-10-03T12:00:00.000Z", metadata: { evento: nome, ...extra } };
}

/** OS como sai da abertura (GOAL 003): cliente, aparelho, defeito e recebidoPor já registrados. */
function osAbertura(extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-004",
    storeId: "loja-004",
    numero: "OS-004",
    status: "aprovado",
    operacaoStatusV3: "aprovado",
    cliente: { nome: "Cliente QA" },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada" },
    aberturaV3: { recepcao: { recebidoPor: "Operador QA", origem: "balcao", prioridade: "normal", localFisico: "balcao" } },
    timeline: [],
    ...extra,
  } as unknown as OrdemServico;
}

function vPara(os: OrdemServico | null, sobre: Record<string, unknown> = {}): V4Vals {
  return {
    selectedOsId: "os-004",
    osSelected: true,
    realOS: os,
    os: { aparelho: "Samsung Galaxy QA", cliente: "Cliente QA", imei: "", defeito: "Tela quebrada", origem: "Balcão" },
    detailLoading: false,
    cargaEntradaEstabelecida: true,
    entradaEditorSeed: seedEntradaEditor(os),
    dadosBasicosSeed: seedDadosBasicos(os),
    entradaFotos: [],
    salvarIdentificacao: vi.fn(async () => true),
    salvarProvaEntrada: vi.fn(async () => true),
    salvarChecklist: vi.fn(async () => true),
    salvarAcessorios: vi.fn(async () => true),
    salvarDadosBasicos: vi.fn(async () => true),
    adicionarFotoEntrada: vi.fn(async () => true),
    removerFotoEntrada: vi.fn(async () => true),
    salvarAssinaturaCliente: vi.fn(async () => true),
    ...sobre,
  } as unknown as V4Vals;
}

const rail = () => screen.getByRole("navigation", { name: "Grupos da entrada" });
const chip = (nome: RegExp) => within(rail()).getByRole("button", { name: nome });
const areaAtiva = () => screen.getByRole("heading", { level: 2 }).textContent;
function estadoDoBloco(titulo: string) {
  const linha = screen.getByRole("heading", { level: 3, name: titulo }).parentElement as HTMLElement;
  return within(linha);
}

describe("U01/U03 — Entrada abre como complementação, não wizard", () => {
  it("U01 — copy de complementar/conferir, sem passo 1 de 4, sem Anterior/Próximo/Salvar e continuar", () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(within(rail()).getByText("Complementar entrada")).toBeTruthy();
    expect(screen.queryByText(/de 4 grupos/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Salvar e continuar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Anterior$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Próximo$/ })).toBeNull();
    expect(screen.queryByText(/^0[1-4]$/)).toBeNull();
    // Segurança (acessórios) e Inspeção (estado físico + checklist) faltam; Evidências é opcional.
    expect(within(rail()).getByText("2 áreas para complementar")).toBeTruthy();
  });
});

describe("A02/A03 — abrir no que realmente falta, uma vez por instância", () => {
  it("A02 — OS da abertura abre em Segurança (acessórios faltam); Recepção registrada", () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(areaAtiva()).toBe("Segurança");
    expect(chip(/Segurança/).getAttribute("aria-current")).toBe("true");
    expect(within(chip(/Recepção/)).getByText("Registrado")).toBeTruthy();
    expect(within(chip(/Segurança/)).getByText("Falta complementar")).toBeTruthy();
    expect(within(chip(/Evidências/)).getByText("Opcional")).toBeTruthy();
  });

  it("D3/A02 — sem interação: decide a primeira pendência quando a carga chega", () => {
    const { rerender } = montar(<EntradaWorkspace v={vPara(null, { cargaEntradaEstabelecida: false, detailLoading: true })} />);
    expect(areaAtiva()).toBe("Recepção");
    rerender(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(areaAtiva()).toBe("Segurança");
  });

  it("D5/A03 — escolha manual congela a área: refresh do detalhe não troca", async () => {
    const { rerender } = montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    await userEvent.setup().click(chip(/Inspeção/));
    expect(areaAtiva()).toBe("Inspeção");
    rerender(<EntradaWorkspace v={vPara(osAbertura({ timeline: [evento("acessorio_registrado", { presentes: 0 })] }))} />);
    expect(areaAtiva()).toBe("Inspeção");
  });

  it("D4/A03 — escolha manual antes da carga também vence a seleção automática", async () => {
    const { rerender } = montar(<EntradaWorkspace v={vPara(null, { cargaEntradaEstabelecida: false, detailLoading: true })} />);
    await userEvent.setup().click(chip(/Evidências/));
    rerender(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(areaAtiva()).toBe("Evidências");
  });

  it("Entrada já complementada: estado honesto e navegação livre a partir de Recepção", () => {
    const os = osAbertura({
      checklist: [{ id: "liga", label: "Liga", estado: "ok" }],
      provaEntradaV3: { versao: 1, criadoEm: "2026-10-03T12:00:00.000Z", acessorios: [] },
      timeline: [
        evento("acessorio_registrado", { presentes: 0 }),
        evento("prova_entrada_criada", { avariados: 0, avarias: 0, fatias: ["estadoFisico", "avarias"] }),
      ],
    });
    montar(<EntradaWorkspace v={vPara(os)} />);
    expect(within(rail()).getByText("Entrada já complementada")).toBeTruthy();
    expect(areaAtiva()).toBe("Recepção");
  });
});

describe("U02/U04/U05/U06/U08 — áreas livres e estados honestos", () => {
  it("U02/U08 — navega direto entre áreas em qualquer ordem, sem dirty, imediato", async () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    const user = userEvent.setup();
    for (const [nome, titulo] of [[/Evidências/, "Evidências"], [/Recepção/, "Recepção"], [/Inspeção/, "Inspeção"], [/Segurança/, "Segurança"]] as const) {
      await user.click(chip(nome));
      expect(areaAtiva()).toBe(titulo);
    }
  });

  it("U04/D — Recepção registrada mostra a abertura sem pedir reentrada", async () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    await userEvent.setup().click(chip(/Recepção/));
    expect(screen.getByText("Informado na abertura")).toBeTruthy();
    expect(screen.getByText("Cliente QA")).toBeTruthy();
    expect(screen.getByText("Samsung Galaxy QA")).toBeTruthy();
    expect(estadoDoBloco("Ajustes da recepção").getByText("Registrado")).toBeTruthy();
    // Defeito/origem/recebido por não são pedidos de novo (só via "Corrigir dados da abertura").
    expect(screen.queryByLabelText("Defeito relatado")).toBeNull();
    expect(screen.queryByLabelText("Recebido por")).toBeNull();
    expect(screen.getByRole("button", { name: "Corrigir dados da abertura" })).toBeTruthy();
  });

  it("U05 — área faltante é complementável, nunca erro de sistema", () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(estadoDoBloco("Itens recebidos com o aparelho").getByText("Falta complementar")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("U06/A07 — opcionais aparecem como opcionais (acesso, fotos, assinatura)", async () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    expect(estadoDoBloco("Acesso ao aparelho").getByText("Opcional")).toBeTruthy();
    await userEvent.setup().click(chip(/Evidências/));
    expect(estadoDoBloco("Fotos da entrada").getByText("Opcional")).toBeTruthy();
    expect(estadoDoBloco("Assinatura do cliente").getByText("Opcional")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Salvar alterações/ })).toBeNull();
  });

  it("legado sem recebidoPor: o campo que falta aparece sozinho para complementar", async () => {
    const os = osAbertura({ aberturaV3: { recepcao: { origem: "balcao" } } });
    montar(<EntradaWorkspace v={vPara(os)} />);
    expect(areaAtiva()).toBe("Recepção");
    expect(estadoDoBloco("Ajustes da recepção").getByText("Falta complementar")).toBeTruthy();
    expect(screen.getByLabelText("Recebido por")).toBeTruthy();
    expect(screen.queryByLabelText("Defeito relatado")).toBeNull();
  });
});

describe("U07/U10/A04 — salvar é explícito, localizado e não avança", () => {
  it("U07/A04 — Salvar alterações persiste a área e mantém a mesma área ativa", async () => {
    const v = vPara(osAbertura());
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    await user.click(chip(/Recepção/));
    const salvar = screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    expect(salvar.disabled).toBe(false);
    await user.click(salvar);
    expect(v.salvarIdentificacao).toHaveBeenCalledTimes(1);
    expect(v.salvarProvaEntrada).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Alterações não salvas")).toBeNull());
    expect(areaAtiva()).toBe("Recepção");
  });

  it("salvar Segurança leva só credenciais (Inspeção suja fica suja e não viaja)", async () => {
    const v = vPara(osAbertura());
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    await user.click(chip(/Inspeção/));
    fireEvent.change(screen.getByRole("combobox", { name: "Tela" }), { target: { value: "avariado" } });
    await user.click(chip(/Segurança/));
    fireEvent.change(screen.getByLabelText("Senha / PIN"), { target: { value: "2580" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(v.salvarProvaEntrada).toHaveBeenCalledTimes(1);
    const [input] = (v.salvarProvaEntrada as ReturnType<typeof vi.fn>).mock.calls[0] as [{ estadoFisico: { componente: string; status: string }[]; credenciais: { senha?: string } }];
    expect(input.credenciais.senha).toBe("2580");
    expect(input.estadoFisico.find((c) => c.componente === "tela")?.status).toBe("ok");
    expect(areaAtiva()).toBe("Segurança");
    expect(chip(/Inspeção/).className).toMatch(/groupChipDirty/);
  });

  it("U10 — erro de persistência mantém digitação e área", async () => {
    const v = vPara(osAbertura(), { salvarIdentificacao: vi.fn(async () => false) });
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    await user.click(chip(/Recepção/));
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Preto");
    expect(areaAtiva()).toBe("Recepção");
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
  });
});

describe("A06/A13 — 'nenhum acessório' é resposta registrada pelo servidor", () => {
  it("registro explícito chama o wrapper com opção explícita; estado só muda com dado do servidor", async () => {
    const os = osAbertura();
    const v = vPara(os);
    const { rerender } = montar(<EntradaWorkspace v={v} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrar: nenhum acessório recebido" }));
    expect(v.salvarAcessorios).toHaveBeenCalledTimes(1);
    const [lista, opcoes] = (v.salvarAcessorios as ReturnType<typeof vi.fn>).mock.calls[0] as [{ presente: boolean }[], unknown];
    expect(lista.every((a) => a.presente === false)).toBe(true);
    expect(opcoes).toEqual({ registrarSemAlteracao: true });
    // A13: sem flag otimista — até o servidor responder, continua faltando.
    expect(within(chip(/Segurança/)).getByText("Falta complementar")).toBeTruthy();
    const salva = osAbertura({
      provaEntradaV3: { versao: 1, criadoEm: "2026-10-03T12:00:00.000Z", acessorios: [] },
      timeline: [evento("acessorio_registrado", { presentes: 0 })],
    });
    rerender(<EntradaWorkspace v={{ ...v, realOS: salva, entradaEditorSeed: seedEntradaEditor(salva) } as V4Vals} />);
    expect(within(chip(/Segurança/)).getByText("Registrado")).toBeTruthy();
    expect(screen.getByText(/Registrado: Nenhum acessório recebido/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar: nenhum acessório recebido" })).toBeNull();
  });

  it("com item marcado o registro 'nenhum' some (o salvar normal grava os itens)", async () => {
    montar(<EntradaWorkspace v={vPara(osAbertura())} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Capinha/ }));
    expect(screen.queryByRole("button", { name: "Registrar: nenhum acessório recebido" })).toBeNull();
  });
});

describe("A08 — estado físico padrão nunca é apresentado como fato", () => {
  it("sem registro: padrão marcado como não confirmado e confirmação explícita disponível", async () => {
    const v = vPara(osAbertura());
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    await user.click(chip(/Inspeção/));
    expect(estadoDoBloco("Condição física").getByText("Falta complementar")).toBeTruthy();
    expect(screen.getByText(/Ainda não conferido/)).toBeTruthy();
    const tela = screen.getByRole("combobox", { name: "Tela" }) as HTMLSelectElement;
    expect(tela.selectedOptions[0]?.textContent).toBe("Íntegro (não confirmado)");
    await user.click(screen.getByRole("button", { name: "Confirmar estado exibido" }));
    expect(v.salvarProvaEntrada).toHaveBeenCalledTimes(1);
    const [, opcoes] = (v.salvarProvaEntrada as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, unknown];
    expect(opcoes).toEqual({ confirmarEstadoFisico: true });
    expect(areaAtiva()).toBe("Inspeção");
  });

  it("prova materializada só por acessórios não transforma o padrão em registro", async () => {
    const os = osAbertura({
      provaEntradaV3: { versao: 1, criadoEm: "2026-10-03T12:00:00.000Z", estadoFisico: [{ componente: "tela", status: "ok" }], acessorios: [] },
      timeline: [evento("acessorio_registrado", { presentes: 0 })],
    });
    montar(<EntradaWorkspace v={vPara(os)} />);
    expect(areaAtiva()).toBe("Inspeção");
    expect(estadoDoBloco("Condição física").getByText("Falta complementar")).toBeTruthy();
  });

  it("com registro real (fatias de estado): íntegro aparece como registrado", async () => {
    const os = osAbertura({
      provaEntradaV3: { versao: 1, criadoEm: "2026-10-03T12:00:00.000Z", estadoFisico: [{ componente: "tela", status: "ok" }], acessorios: [] },
      timeline: [evento("prova_entrada_atualizada", { avariados: 0, avarias: 0, fatias: ["estadoFisico", "avarias"] })],
    });
    montar(<EntradaWorkspace v={vPara(os)} />);
    await userEvent.setup().click(chip(/Inspeção/));
    expect(estadoDoBloco("Condição física").getByText("Registrado")).toBeTruthy();
    const tela = screen.getByRole("combobox", { name: "Tela" }) as HTMLSelectElement;
    expect(tela.selectedOptions[0]?.textContent).toBe("Íntegro");
    expect(screen.queryByRole("button", { name: "Confirmar estado exibido" })).toBeNull();
  });
});

describe("A09 — Face ID/biometria: ausente é 'não informado'", () => {
  it("sem valor persistido: 'Não informado' marcado e checklist mantém o teste aplicável", async () => {
    const v = vPara(osAbertura());
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    const faceId = within(screen.getByRole("group", { name: "Face ID" }));
    expect((faceId.getByRole("radio", { name: "Não informado" }) as HTMLInputElement).checked).toBe(true);
    expect((faceId.getByRole("radio", { name: "Não" }) as HTMLInputElement).checked).toBe(false);
    await user.click(chip(/Inspeção/));
    expect(screen.getByRole("button", { name: /^Face ID: / })).toBeTruthy();
    expect(screen.queryByLabelText("Face ID: N/A")).toBeNull();
  });

  it("'Não' explícito persiste false e só então o checklist marca N/A", async () => {
    const v = vPara(osAbertura());
    montar(<EntradaWorkspace v={v} />);
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("group", { name: "Face ID" })).getByRole("radio", { name: "Não" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const [input] = (v.salvarProvaEntrada as ReturnType<typeof vi.fn>).mock.calls[0] as [{ credenciais: { faceId?: boolean; biometria?: boolean } }];
    expect(input.credenciais.faceId).toBe(false);
    expect(input.credenciais.biometria).toBeUndefined();
    await user.click(chip(/Inspeção/));
    expect(screen.getByLabelText("Face ID: N/A")).toBeTruthy();
  });
});

describe("U09/U11/U12/A14 — rascunho, guarda e conflito do GOAL 001 intactos", () => {
  function StageComGuarda({ v, guarda }: { v: V4Vals; guarda: ReturnType<typeof criarGuardaRascunhos> }) {
    const [, setVersao] = useState(0);
    useEffect(() => guarda.subscribe(() => setVersao((n) => n + 1)), [guarda]);
    return <EntradaStage v={{ ...v, rascunhos: guarda } as V4Vals} />;
  }

  it("U09 — sair da etapa com dirty abre Salvar/Descartar/Cancelar; Cancelar mantém na Entrada", async () => {
    const guarda = criarGuardaRascunhos();
    montar(<StageComGuarda v={vPara(osAbertura())} guarda={guarda} />);
    const user = userEvent.setup();
    await user.click(chip(/Recepção/));
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    const sair = vi.fn();
    let resultado = "";
    act(() => {
      resultado = guarda.solicitarSaida(sair, { chave: "sem-loja::os-004", descricao: "ir para Diagnóstico" });
    });
    expect(resultado).toBe("bloqueada");
    const dialogo = screen.getByRole("alertdialog", { name: "Alterações não salvas na Entrada" });
    expect(within(dialogo).getByRole("button", { name: "Salvar" })).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Descartar" })).toBeTruthy();
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(sair).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Preto");
  });

  it("U09 — sem dirty, sair da etapa é livre (nenhum complemento é exigido)", () => {
    const guarda = criarGuardaRascunhos();
    montar(<StageComGuarda v={vPara(osAbertura())} guarda={guarda} />);
    const sair = vi.fn();
    let resultado = "";
    act(() => {
      resultado = guarda.solicitarSaida(sair, { chave: "sem-loja::os-004", descricao: "ir para Execução" });
    });
    expect(resultado).toBe("livre");
    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("U11 — hidratação: fatia tocada preservada, não tocada adota o servidor", async () => {
    const os = osAbertura();
    const { rerender } = montar(<EntradaWorkspace v={vPara(os)} />);
    await userEvent.setup().click(chip(/Recepção/));
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    const servidor = osAbertura({ prioridade: "alta" });
    rerender(<EntradaWorkspace v={vPara(servidor)} />);
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Preto");
    expect((screen.getByLabelText("Prioridade") as HTMLSelectElement).value).toBe("alta");
    expect(areaAtiva()).toBe("Recepção");
  });

  it("U12 — conflito concorrente bloqueia salvar e registros explícitos até revisar/descartar", async () => {
    const os = osAbertura();
    const { rerender } = montar(<EntradaWorkspace v={vPara(os)} />);
    const user = userEvent.setup();
    await user.click(chip(/Recepção/));
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Preto" } });
    const outraSessao = osAbertura({ equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada", cor: "Azul" } });
    rerender(<EntradaWorkspace v={vPara(outraSessao)} />);
    expect(await screen.findByText(/O servidor atualizou.*identificação/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(chip(/Segurança/));
    expect((screen.getByRole("button", { name: "Registrar: nenhum acessório recebido" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Descartar alterações" }));
    expect(screen.queryByText(/O servidor atualizou/)).toBeNull();
  });
});

describe("R P2 #2 — interação de edição é independente do dirty", () => {
  it("D1 — editar Cor antes da carga congela Recepção", () => {
    const os = osAbertura();
    const { rerender } = montar(<EntradaWorkspace v={vPara(os, { cargaEntradaEstabelecida: false, detailLoading: true })} />);
    expect(areaAtiva()).toBe("Recepção");
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Azul" } });
    rerender(<EntradaWorkspace v={vPara(os)} />);
    expect(areaAtiva()).toBe("Recepção");
    expect((screen.getByLabelText("Cor") as HTMLInputElement).value).toBe("Azul");
  });

  it("D2 — editar e desfazer antes da carga mantém Recepção mesmo com dirty=false", () => {
    const os = osAbertura();
    const v = vPara(os, { cargaEntradaEstabelecida: false, detailLoading: true });
    const { rerender } = montar(<EntradaWorkspace v={v} />);
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "Azul" } });
    fireEvent.change(screen.getByLabelText("Cor"), { target: { value: "" } });
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
    rerender(<EntradaWorkspace v={vPara(os)} />);
    expect(areaAtiva()).toBe("Recepção");
    expect(v.salvarIdentificacao).not.toHaveBeenCalled();
    expect(v.salvarDadosBasicos).not.toHaveBeenCalled();
  });

  it("D6 — hidratação programática do editor não congela a seleção automática", () => {
    const os = osAbertura();
    const { rerender } = montar(<EntradaWorkspace v={vPara(os, { cargaEntradaEstabelecida: false, detailLoading: true })} />);
    const servidor = osAbertura({ equipamento: { ...os.equipamento, cor: "Azul" } });
    // Seed muda antes de estabelecer a carga; nenhuma interação DOM.
    rerender(<EntradaWorkspace v={vPara(servidor, { cargaEntradaEstabelecida: false, detailLoading: true })} />);
    expect(areaAtiva()).toBe("Recepção");
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
    rerender(<EntradaWorkspace v={vPara(servidor)} />);
    expect(areaAtiva()).toBe("Segurança");
  });
});
