import { describe, expect, it } from "vitest"
import {
  CAMPOS_PROIBIDOS_EXTERNOS,
  ENV_ORDEM_BARCODE,
  MENSAGEM_COSMOS_SEM_CONFIG,
  MENSAGEM_OFF_INDISPONIVEL,
  ORDEM_BARCODE_DEFAULT,
  POLITICA_FALLBACK,
  POLITICA_RATE_LIMIT,
  POLITICA_TIMEOUT_MS,
  REGISTRO_PROVEDORES,
  avaliarProvedor,
  calcularCamposAplicaveis,
  construirProvenienciaBarcode,
  filtrarSugestao,
  idsConhecidos,
  listarProvedores,
  obterProvedor,
  podeSugerirCampo,
  sanitizarTentativas,
  statusLookupAuditavel,
  validarProvenienciaSegura,
  afirmarSemSegredo,
  contemSegredo,
} from "./index"

/**
 * Governança canônica de provedores externos (CAD-R2-015).
 * Sem rede, sem banco, sem segredos reais.
 */

describe("inventário: fonte única de governança/status/capabilities", () => {
  it("três provedores conhecidos, sem heurística", () => {
    expect(idsConhecidos()).toEqual(["cosmos", "upcitemdb", "openfoodfacts"])
    expect(listarProvedores()).toHaveLength(3)
    expect(Object.keys(REGISTRO_PROVEDORES).sort()).toEqual([
      "cosmos",
      "openfoodfacts",
      "upcitemdb",
    ])
  })

  it("todos servem barcode-lookup (única capability com provider neste GOAL)", () => {
    for (const p of listarProvedores()) {
      expect(p.capability).toBe("barcode-lookup")
    }
  })

  it("cosmos: implementado, habilitado, exige COSMOS_API_KEY", () => {
    const r = REGISTRO_PROVEDORES.cosmos
    expect(r.implemented).toBe(true)
    expect(r.enabled).toBe(true)
    expect(r.lifecycle).toBe("disponivel")
    expect(r.requiredEnvVars).toEqual(["COSMOS_API_KEY"])
    expect(r.camposSugeriveis).toEqual([
      "nome",
      "marca",
      "categoria",
      "descricao",
      "ncm",
      "cest",
      "imagemUrl",
    ])
  })

  it("upcitemdb: implementado, habilitado, sem secret, sem NCM/CEST", () => {
    const r = REGISTRO_PROVEDORES.upcitemdb
    expect(r.implemented).toBe(true)
    expect(r.enabled).toBe(true)
    expect(r.lifecycle).toBe("disponivel")
    expect(r.requiredEnvVars).toEqual([])
    expect(r.camposSugeriveis).toEqual(["nome", "marca", "categoria", "descricao", "imagemUrl"])
    expect(r.camposSugeriveis).not.toContain("ncm")
    expect(r.camposSugeriveis).not.toContain("cest")
  })

  it("openfoodfacts: conhecido porém indisponível (sem adapter, desabilitado, sem campos)", () => {
    const r = REGISTRO_PROVEDORES.openfoodfacts
    expect(r.implemented).toBe(false)
    expect(r.enabled).toBe(false)
    expect(r.lifecycle).toBe("indisponivel-nao-implementado")
    expect(r.camposSugeriveis).toEqual([])
  })

  it("revisão humana obrigatória e write direto proibido para TODOS", () => {
    for (const p of listarProvedores()) {
      expect(p.humanReviewRequired).toBe(true)
      expect(p.directWriteAllowed).toBe(false)
    }
  })

  it("payload bruto nunca persistido, em TODOS", () => {
    for (const p of listarProvedores()) {
      expect(p.telemetria.persistePayloadBruto).toBe(false)
      expect(p.telemetria.camposTracePermitidos).toEqual(["provedor", "status", "em", "tipo"])
      expect(p.telemetria.segredoNuncaEm).toEqual(["response", "trace", "metadata", "log", "bundle"])
    }
  })

  it("sem score numérico de confiança inventado", () => {
    const serializado = JSON.stringify(listarProvedores()).toLowerCase()
    expect(serializado).not.toContain("confianca")
    expect(serializado).not.toContain("confidence")
    expect(serializado).not.toContain("score")
  })

  it("sem aprovação jurídica/comercial inventada", () => {
    const serializado = JSON.stringify(listarProvedores()).toLowerCase()
    expect(serializado).not.toContain("aprovado")
    expect(serializado).not.toContain("licenciado")
    expect(serializado).not.toContain("autorizado")
    expect(REGISTRO_PROVEDORES.cosmos.termos).toEqual({ status: "desconhecido-nao-registrado" })
    expect(REGISTRO_PROVEDORES.upcitemdb.termos).toEqual({ status: "desconhecido-nao-registrado" })
    // OFF: única menção com evidência (roadmap §8, ODbL a avaliar na implementação).
    expect(REGISTRO_PROVEDORES.openfoodfacts.termos.status).toBe("mencionado-nao-avaliado")
  })
})

describe("decisão de execução (sem heurística, sem valores de segredo)", () => {
  it("provider ativo/configurado executa (cosmos com chave)", () => {
    expect(avaliarProvedor("cosmos", { cosmosApiKeyPresente: true })).toEqual({
      executable: true,
      id: "cosmos",
    })
  })

  it("provider ativo sem secret executa (upcitemdb FREE)", () => {
    expect(avaliarProvedor("upcitemdb", { cosmosApiKeyPresente: false })).toEqual({
      executable: true,
      id: "upcitemdb",
    })
  })

  it("sem config obrigatória => sem-config honesto (nunca executa)", () => {
    const d = avaliarProvedor("cosmos", { cosmosApiKeyPresente: false })
    expect(d.executable).toBe(false)
    if (!d.executable) {
      expect(d.motivo).toBe("sem-config")
      expect(d.mensagem).toBe(MENSAGEM_COSMOS_SEM_CONFIG)
      expect(d.mensagem).toContain("COSMOS_API_KEY")
    }
  })

  it("desconhecido => motivo desconhecido honesto (nunca executa)", () => {
    const d = avaliarProvedor("google", { cosmosApiKeyPresente: true })
    expect(d.executable).toBe(false)
    if (!d.executable) {
      expect(d.motivo).toBe("desconhecido")
      expect(d.mensagem).toContain("google")
      expect(d.mensagem).toContain(ENV_ORDEM_BARCODE)
    }
  })

  it("conhecido mas não implementado => nao-implementado honesto (nunca executa)", () => {
    const d = avaliarProvedor("openfoodfacts", { cosmosApiKeyPresente: true })
    expect(d.executable).toBe(false)
    if (!d.executable) {
      expect(d.motivo).toBe("nao-implementado")
      expect(d.mensagem).toBe(MENSAGEM_OFF_INDISPONIVEL)
      expect(d.mensagem).toContain("não implementado")
    }
  })

  it("obterProvedor distingue conhecido de desconhecido sem adivinhar", () => {
    expect(obterProvedor("cosmos").conhecido).toBe(true)
    expect(obterProvedor("openfoodfacts").conhecido).toBe(true)
    expect(obterProvedor("google")).toEqual({ conhecido: false })
    expect(obterProvedor("")).toEqual({ conhecido: false })
  })
})

describe("políticas operacionais centralizadas", () => {
  it("timeout 3000ms por provedor (compatível com GOAL 004A)", () => {
    expect(POLITICA_TIMEOUT_MS).toBe(3000)
  })

  it("fallback primeiro-sucesso-vence", () => {
    expect(POLITICA_FALLBACK).toBe("first-success-wins")
  })

  it("rate-limit por memo até meia-noite SP", () => {
    expect(POLITICA_RATE_LIMIT.estrategia).toBe("memo-ate-meia-noite-sp")
  })

  it("ordem default preservada (cosmos) + nome da env", () => {
    expect([...ORDEM_BARCODE_DEFAULT]).toEqual(["cosmos"])
    expect(ENV_ORDEM_BARCODE).toBe("BARCODE_LOOKUP_PROVIDERS")
  })

  it("deny-list global: preco/custo/estoque/fornecedor/sku", () => {
    expect([...CAMPOS_PROIBIDOS_EXTERNOS]).toEqual(["preco", "custo", "estoque", "fornecedor", "sku"])
  })
})

describe("campos sugeríveis por provider", () => {
  it("cosmos pode sugerir NCM/CEST (revisáveis); upcitemdb não", () => {
    expect(podeSugerirCampo("cosmos", "ncm")).toBe(true)
    expect(podeSugerirCampo("cosmos", "cest")).toBe(true)
    expect(podeSugerirCampo("upcitemdb", "ncm")).toBe(false)
    expect(podeSugerirCampo("upcitemdb", "cest")).toBe(false)
    expect(podeSugerirCampo("upcitemdb", "nome")).toBe(true)
  })

  it("desconhecido e não-implementado não sugerem nada", () => {
    expect(podeSugerirCampo("google", "nome")).toBe(false)
    expect(podeSugerirCampo("openfoodfacts", "nome")).toBe(false)
  })

  it("filtrarSugestao mantém só permitidos, remove proibidos/vazios/desconhecidos", () => {
    const filtrada = filtrarSugestao("upcitemdb", {
      nome: "Produto UPC",
      marca: "Marca",
      ncm: "12345678",
      cest: "1234567",
      preco: 99.9,
      custo: 10,
      estoque: 5,
      fornecedor: "Forn",
      sku: "SKU-1",
      campoEstranho: "x",
      descricao: "   ",
    })
    expect(filtrada).toEqual({ nome: "Produto UPC", marca: "Marca" })
  })

  it("filtrarSugestao de provider desconhecido retorna vazio", () => {
    expect(filtrarSugestao("google", { nome: "X" })).toEqual({})
  })
})

describe("contrato da UI: calcularCamposAplicaveis", () => {
  const DADOS_COSMOS = {
    nome: "Coca Lata 350ml",
    marca: "Coca",
    categoria: "Bebidas",
    descricao: "Refrigerante",
    ncm: "22021000",
    cest: "0301800",
    imagemUrl: "https://example.com/f.jpg",
  }

  it("formulário vazio + cosmos => aplica nome/marca/categoria/descricao/ncm/cest (sem imagemUrl)", () => {
    const aplicaveis = calcularCamposAplicaveis("cosmos", DADOS_COSMOS, {})
    expect(aplicaveis.map((a) => a.campo)).toEqual([
      "nome",
      "marca",
      "categoria",
      "descricao",
      "ncm",
      "cest",
    ])
  })

  it("nunca sobrescreve campo já preenchido pelo operador", () => {
    const aplicaveis = calcularCamposAplicaveis("cosmos", DADOS_COSMOS, {
      nome: "Nome do operador",
      ncm: "99999999",
    })
    const porCampo = Object.fromEntries(aplicaveis.map((a) => [a.campo, a.valor]))
    expect(porCampo).not.toHaveProperty("nome")
    expect(porCampo).not.toHaveProperty("ncm")
    expect(porCampo.marca).toBe("Coca")
  })

  it("upcitemdb jamais aplica NCM/CEST mesmo se injetados", () => {
    const aplicaveis = calcularCamposAplicaveis("upcitemdb", { ...DADOS_COSMOS }, {})
    const campos = aplicaveis.map((a) => a.campo)
    expect(campos).not.toContain("ncm")
    expect(campos).not.toContain("cest")
    expect(campos).toEqual(["nome", "marca", "categoria", "descricao"])
  })

  it("proibidos nunca aplicados mesmo se injetados via cast", () => {
    const aplicaveis = calcularCamposAplicaveis("cosmos", {
      ...DADOS_COSMOS,
      preco: 99.9,
      custo: 1,
      estoque: 7,
      fornecedor: "F",
      sku: "S",
    } as unknown as Record<string, unknown>, {})
    const campos = aplicaveis.map((a) => a.campo)
    for (const proibido of CAMPOS_PROIBIDOS_EXTERNOS) {
      expect(campos).not.toContain(proibido)
    }
  })

  it("provider desconhecido não aplica nada", () => {
    expect(calcularCamposAplicaveis("google", DADOS_COSMOS, {})).toEqual([])
  })
})

describe("proveniência segura", () => {
  const TENTATIVAS = [
    { provedor: "cosmos", status: "nao_encontrado", em: "2026-09-16T10:00:00.000Z" },
    { provedor: "upcitemdb", status: "encontrado", em: "2026-09-16T10:00:01.000Z" },
  ]

  it("statusLookupAuditavel achata só o seguro (erro_config/limite/erro => erro)", () => {
    expect(statusLookupAuditavel("encontrado")).toBe("encontrado")
    expect(statusLookupAuditavel("nao_encontrado")).toBe("nao_encontrado")
    expect(statusLookupAuditavel("limite_excedido")).toBe("erro")
    expect(statusLookupAuditavel("erro_config")).toBe("erro")
    expect(statusLookupAuditavel("erro")).toBe("erro")
  })

  it("sanitizarTentativas remove chaves extras e tipos fora da união", () => {
    const saneadas = sanitizarTentativas([
      { provedor: "cosmos", status: "erro", em: "2026-09-16T10:00:00.000Z", tipo: "X-Cosmos-Token?" },
      {
        provedor: "upcitemdb",
        status: "invente-um-status",
        em: "2026-09-16T10:00:01.000Z",
        tipo: "timeout",
      } as unknown as { provedor: string; status: string; em: string; tipo?: unknown },
    ])
    expect(saneadas[0]).toEqual({ provedor: "cosmos", status: "erro", em: "2026-09-16T10:00:00.000Z" })
    expect(saneadas[1]).toEqual({
      provedor: "upcitemdb",
      status: "erro",
      em: "2026-09-16T10:00:01.000Z",
      tipo: "timeout",
    })
  })

  it("construirProvenienciaBarcode carrega provider/gtin/instante/campos/tentativas", () => {
    const prov = construirProvenienciaBarcode({
      gtin: "7891000053508",
      formato: "gtin-13",
      consultadoEm: "2026-09-16T10:00:02.000Z",
      status: "encontrado",
      provedor: "upcitemdb",
      sugestoes: { nome: "Produto UPC", marca: "M", ncm: "12345678", preco: 5 },
      tentativas: TENTATIVAS,
      aplicacao: { aplicadoEm: "2026-09-16T10:05:00.000Z", camposAplicados: ["nome", "marca"] },
    })
    expect(prov.gtin).toBe("7891000053508")
    expect(prov.provedor).toBe("upcitemdb")
    expect(prov.consultadoEm).toBe("2026-09-16T10:00:02.000Z")
    expect(prov.statusLookup).toBe("encontrado")
    // ncm filtrado (upcitemdb não sugere fiscal); preco jamais entra.
    expect(prov.sugestoes).toEqual({ nome: "Produto UPC", marca: "M" })
    expect(prov.camposAplicados).toEqual(["nome", "marca"])
    expect(prov.aplicado).toEqual({ nome: "aceito", marca: "aceito" })
    expect(prov.aplicadoPeloOperador).toBe(true)
    expect(prov.ultimoResultado.provedor).toBe("upcitemdb")
    expect(validarProvenienciaSegura(prov)).toEqual({ ok: true })
  })

  it("sem aplicação do operador => aplicadoPeloOperador false, sem aplicadoEm", () => {
    const prov = construirProvenienciaBarcode({
      gtin: "7891000053508",
      formato: "gtin-13",
      consultadoEm: "2026-09-16T10:00:02.000Z",
      status: "nao_encontrado",
      tentativas: TENTATIVAS,
      aplicacao: null,
    })
    expect(prov.aplicadoPeloOperador).toBe(false)
    expect(prov).not.toHaveProperty("aplicadoEm")
    expect(prov).not.toHaveProperty("provedor")
    expect(prov).not.toHaveProperty("sugestoes")
    expect(validarProvenienciaSegura(prov)).toEqual({ ok: true })
  })

  it("validador rejeita proibidos, payload bruto e provedor desconhecido", () => {
    const base = construirProvenienciaBarcode({
      gtin: "7891000053508",
      formato: "gtin-13",
      consultadoEm: "2026-09-16T10:00:02.000Z",
      status: "encontrado",
      provedor: "cosmos",
      sugestoes: { nome: "X" },
      tentativas: TENTATIVAS,
      aplicacao: null,
    })
    const comPreco = {
      ...base,
      sugestoes: { nome: "X", preco: 10 },
      camposAplicados: ["nome", "estoque"],
    }
    const r1 = validarProvenienciaSegura(comPreco)
    expect(r1.ok).toBe(false)
    if (!r1.ok) {
      expect(r1.erros.join("|")).toContain("preco")
      expect(r1.erros.join("|")).toContain("estoque")
    }

    const comRaw = { ...base, ultimoResultado: { ...base.ultimoResultado, items: [{ a: 1 }] } }
    const r2 = validarProvenienciaSegura(comRaw)
    expect(r2.ok).toBe(false)

    const provDesconhecido = { ...base, provedor: "google" }
    const r3 = validarProvenienciaSegura(provDesconhecido)
    expect(r3.ok).toBe(false)
  })

  it("validador rejeita tentativa com chave extra (token/url/body)", () => {
    const prov = construirProvenienciaBarcode({
      gtin: "7891000053508",
      formato: "gtin-13",
      consultadoEm: "2026-09-16T10:00:02.000Z",
      status: "erro",
      tentativas: [{ provedor: "cosmos", status: "erro", em: "2026-09-16T10:00:00.000Z", tipo: "auth" }],
      aplicacao: null,
    })
    const adulterada = {
      ...prov,
      tentativas: [{ ...prov.tentativas[0], token: "abc", url: "https://x" }],
    }
    expect(validarProvenienciaSegura(adulterada).ok).toBe(false)
  })
})

describe("guardas de segredo", () => {
  const SEGREDO = "CHAVE-SEGREDO-TESTE-015"

  it("contemSegredo detecta em estruturas aninhadas; ignora curtos", () => {
    expect(contemSegredo({ a: [{ b: SEGREDO }] }, [SEGREDO])).toBe(true)
    expect(contemSegredo({ a: "limpo" }, [SEGREDO])).toBe(false)
    expect(contemSegredo({ a: "x" }, [""])).toBe(false)
  })

  it("afirmarSemSegredo lança sem ecoar o segredo", () => {
    expect(() => afirmarSemSegredo({ a: "limpo" }, [SEGREDO], "trace")).not.toThrow()
    let mensagem = ""
    try {
      afirmarSemSegredo({ a: SEGREDO }, [SEGREDO], "trace")
    } catch (e) {
      mensagem = (e as Error).message
    }
    expect(mensagem).toContain("trace")
    expect(mensagem).not.toContain(SEGREDO)
  })

  it("proveniência com segredo é recusada pelo construtor e pelo validador", () => {
    // Construtor: sistema injeta segredo numa sugestão (simula vazamento) => lança.
    expect(() =>
      construirProvenienciaBarcode({
        gtin: "7891000053508",
        formato: "gtin-13",
        consultadoEm: "2026-09-16T10:00:02.000Z",
        status: "encontrado",
        provedor: "cosmos",
        sugestoes: { nome: `Produto ${SEGREDO}` },
        tentativas: [],
        aplicacao: null,
        segredosConhecidos: [SEGREDO],
      }),
    ).toThrow()
    const prov = construirProvenienciaBarcode({
      gtin: "7891000053508",
      formato: "gtin-13",
      consultadoEm: "2026-09-16T10:00:02.000Z",
      status: "nao_encontrado",
      tentativas: [],
      aplicacao: null,
    })
    expect(validarProvenienciaSegura({ ...prov, gtin: SEGREDO }, { segredos: [SEGREDO] }).ok).toBe(
      false,
    )
  })
})
