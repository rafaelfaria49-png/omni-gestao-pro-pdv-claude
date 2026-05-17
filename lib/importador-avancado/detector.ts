// ============================================================
// lib/importador-avancado/detector.ts
// Detecta o domínio de uma planilha pelos headers + nome do arquivo
// Suporta GestaoClick, Bling, Tiny, D360 e planilhas manuais
// ============================================================

import type { DominioImport } from "./types"

// ── Normalização ─────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// ── Dicionário semântico completo ────────────────────────────
// Mapeia qualquer header que qualquer sistema possa exportar
// para um campo semântico interno canônico.

export const DICIONARIO_SEMANTICO: Record<string, string> = {
  // ── Identificadores de OS ──
  "no da os": "os.numero",
  "nº da os": "os.numero",
  "num da os": "os.numero",
  "numero da os": "os.numero",
  "numero os": "os.numero",
  "n os": "os.numero",
  "ordem de servico": "os.numero",
  "ordem servico": "os.numero",
  "os": "os.numero",
  "cod os": "os.numero",
  "codigo os": "os.numero",

  // ── Identificadores de Pedido/Venda ──
  "no do pedido": "venda.numero",
  "nº do pedido": "venda.numero",
  "num pedido": "venda.numero",
  "numero pedido": "venda.numero",
  "numero do pedido": "venda.numero",
  "pedido": "venda.numero",
  "id pedido": "venda.numero",
  "cod venda": "venda.numero",
  "numero venda": "venda.numero",
  "nf": "venda.numero",
  "nota fiscal": "venda.numero",

  // ── Cliente ──
  "cliente": "cliente.nome",
  "nome": "cliente.nome",
  "nome cliente": "cliente.nome",
  "razao social": "cliente.razaoSocial",
  "nome social": "cliente.nomeSocial",
  "nome fantasia": "cliente.nomeFantasia",
  "responsavel": "cliente.nome",
  "sacado": "cliente.nome",
  "devedor": "cliente.nome",
  "destinatario": "cliente.nome",

  // ── Documento ──
  "cpf": "cliente.cpf",
  "cnpj": "cliente.cnpj",
  "cpf cnpj": "cliente.documento",
  "cpf/cnpj": "cliente.documento",
  "documento": "cliente.documento",
  "documento cliente": "cliente.documento",
  "rg": "cliente.rg",
  "ie": "cliente.inscricaoEstadual",
  "inscricao estadual": "cliente.inscricaoEstadual",
  "inscricao municipal": "cliente.inscricaoMunicipal",

  // ── Contato ──
  "telefone": "cliente.telefone",
  "celular": "cliente.celular",
  "telefone fixo": "cliente.telefoneFixo",
  "whatsapp": "cliente.celular",
  "fone": "cliente.telefone",
  "e mail": "cliente.email",
  "email": "cliente.email",

  // ── Endereço ──
  "cep": "endereco.cep",
  "logradouro": "endereco.logradouro",
  "rua": "endereco.logradouro",
  "numero": "endereco.numero",
  "complemento": "endereco.complemento",
  "bairro": "endereco.bairro",
  "cidade": "endereco.cidade",
  "uf": "endereco.uf",
  "estado": "endereco.uf",
  "municipio": "endereco.cidade",
  "pais": "endereco.pais",

  // ── Equipamento / Aparelho ──
  "equipamento": "equipamento.tipo",
  "aparelho": "equipamento.tipo",
  "tipo equipamento": "equipamento.tipo",
  "marca": "equipamento.marca",
  "fabricante": "equipamento.marca",
  "modelo": "equipamento.modelo",
  "serie": "equipamento.serie",
  "imei": "equipamento.imei",
  "imei serie": "equipamento.imei",
  "condicoes": "equipamento.condicoes",
  "condicao": "equipamento.condicoes",
  "estado do aparelho": "equipamento.condicoes",
  "acessorios": "equipamento.acessorios",
  "defeitos": "equipamento.defeito",
  "defeito": "equipamento.defeito",
  "problema": "equipamento.defeito",
  "relato": "equipamento.defeito",
  "solucao": "equipamento.solucao",
  "solucao tecnica": "equipamento.solucao",
  "laudo tecnico": "equipamento.laudoTecnico",
  "laudo": "equipamento.laudoTecnico",
  "termos de garantia": "equipamento.termoGarantia",
  "termo garantia": "equipamento.termoGarantia",
  "garantia": "equipamento.termoGarantia",

  // ── Produto ──
  "produto": "produto.nome",
  "descricao": "produto.nome",
  "descricao produto": "produto.nome",
  "nome produto": "produto.nome",
  "sku": "produto.sku",
  "codigo": "cliente.codigo",
  "cod": "produto.sku",
  "referencia": "produto.sku",
  "codigo de barra": "produto.barcode",
  "codigo barras": "produto.barcode",
  "ean": "produto.barcode",
  "gtin": "produto.barcode",
  "grupo": "produto.categoria",
  "categoria": "produto.categoria",
  "tipo": "produto.tipo",
  "unidade de saida": "produto.unidade",
  "unidade": "produto.unidade",
  "peso": "produto.peso",
  "codigo ncm": "produto.ncm",
  "ncm": "produto.ncm",
  "ativo": "cliente.ativo",

  // ── Serviço catálogo ──
  "servico": "servico.nome",
  "nome servico": "servico.nome",
  "codigo interno": "servico.sku",

  // ── Valores ──
  "total do pedido": "financeiro.valorTotal",
  "valor total": "financeiro.valorTotal",
  "valor": "financeiro.valor",
  "valor da parcela": "financeiro.valorParcela",
  "valor unitario": "financeiro.valorUnitario",
  "preco": "financeiro.valorUnitario",
  "preco venda": "financeiro.precoVenda",
  "valor varejo": "financeiro.precoVenda",
  "preco de venda": "financeiro.precoVenda",
  "valor de custo": "financeiro.custo",
  "preco de custo": "financeiro.custo",
  "custo": "financeiro.custo",
  "valor frete": "financeiro.frete",
  "frete": "financeiro.frete",
  "desconto valor": "financeiro.desconto",
  "desconto": "financeiro.desconto",
  "juros": "financeiro.juros",
  "taxa do banco": "financeiro.taxaBanco",
  "taxa da operadora": "financeiro.taxaOperadora",
  "comissao": "financeiro.comissao",

  // ── Pagamento ──
  "forma de pagamento": "pagamento.forma",
  "forma pagamento": "pagamento.forma",
  "pagamento": "pagamento.forma",
  "conta bancaria": "pagamento.contaBancaria",
  "vencimento": "pagamento.vencimento",
  "data de vencimento": "pagamento.vencimento",
  "data vencimento": "pagamento.vencimento",
  "data de confirmacao": "pagamento.dataConfirmacao",
  "data confirmacao": "pagamento.dataConfirmacao",
  "confirmado em": "pagamento.dataConfirmacao",

  // ── Datas ──
  "data": "data.data",
  "data da os": "data.abertura",
  "data abertura": "data.abertura",
  "cadastrado em": "data.criacao",
  "criado em": "data.criacao",
  "modificado em": "data.atualizacao",
  "prazo de entrega": "data.prazoEntrega",
  "prazo entrega": "data.prazoEntrega",
  "data de entrega": "data.prazoEntrega",
  "data de competencia": "data.competencia",
  "data competencia": "data.competencia",

  // ── Status ──
  "situacao": "status.situacao",
  "status": "status.situacao",
  "estado da venda": "status.situacao",
  "situacao da venda": "status.situacao",

  // ── Financeiro estruturado ──
  "plano de contas": "financeiro.categoria",
  "categoria financeira": "financeiro.categoria",
  "centro de custo": "financeiro.centroCusto",
  "descricao do recebimento": "financeiro.descricao",
  "descricao do pagamento": "financeiro.descricao",
  "historico": "financeiro.descricao",
  "observacao": "financeiro.observacao",
  "observacoes": "financeiro.observacao",
  "observacoes interna": "financeiro.observacaoInterna",
  "entidade": "financeiro.entidadeTipo",
  "entidade nome": "financeiro.entidadeNome",

  // ── Outros ──
  "vendedor": "meta.vendedor",
  "funcionario": "meta.funcionario",
  "canal de venda": "meta.canal",
  "cadastrado por": "meta.cadastradoPor",
  "quantidade": "item.quantidade",
  "qtd": "item.quantidade",
  "tipo de pessoa": "cliente.tipoPessoa",
  "estoque atual": "produto.estoque",
  "estoque minimo": "produto.estoqueMinimo",
  "estoque maximo": "produto.estoqueMaximo",
  "tipo de fornecedor": "fornecedor.tipo",

  // ── GestaoClick — Identificadores ──
  "n° da os": "os.numero",
  "n. da os": "os.numero",
  "n da os": "os.numero",
  "nº da venda": "venda.numero",
  "n° da venda": "venda.numero",
  "numero da venda": "venda.numero",
  "n do pedido": "venda.numero",
  "n da venda": "venda.numero",
  "código": "cliente.codigo",

  // ── GestaoClick — Cliente (cabeçalhos curtos sem prefixo) ──
  "razão social": "cliente.razaoSocial",
  "data de nascimento": "cliente.dataNascimento",
  "data nascimento": "cliente.dataNascimento",
  "inscrição estadual": "cliente.inscricaoEstadual",
  "inscrição municipal": "cliente.inscricaoMunicipal",
  "e-mail": "cliente.email",

  // ── GestaoClick — Campos específicos de OS/Venda ──
  "aos cuidados de": "meta.aosCuidadosDe",
  "validade da proposta": "data.validadeProposta",
  "introducao": "meta.introducao",
  "introdução": "meta.introducao",
}

// ── Assinaturas de domínio ───────────────────────────────────
// Cada domínio tem campos obrigatórios e opcionais.
// Score = (obrigatoriosPresentes / obrigatoriosTotal) * peso +
//         (opcionaisPresentes / opcionaisTotal) * (1 - peso)

type AssinaturaDominio = {
  dominio: DominioImport
  label: string
  obrigatorios: string[] // campos semânticos que DEVEM estar presentes
  opcionais: string[] // campos que reforçam a detecção
  nomesArquivo: string[] // substrings no nome do arquivo
}

const ASSINATURAS: AssinaturaDominio[] = [
  {
    dominio: "os_equipamentos",
    label: "OS — Equipamentos",
    obrigatorios: ["os.numero", "equipamento.marca"],
    opcionais: ["equipamento.modelo", "equipamento.defeito", "equipamento.laudoTecnico"],
    nomesArquivo: ["equipamento", "equip"],
  },
  {
    dominio: "os_pagamentos",
    label: "OS — Pagamentos",
    obrigatorios: ["os.numero", "pagamento.forma"],
    opcionais: ["financeiro.valorParcela", "pagamento.vencimento"],
    nomesArquivo: ["pagamento", "pagar", "pgto"],
  },
  {
    dominio: "os_servicos",
    label: "OS — Serviços",
    obrigatorios: ["os.numero", "servico.nome"],
    opcionais: ["financeiro.valorUnitario", "item.quantidade"],
    nomesArquivo: ["servico", "servicos"],
  },
  {
    dominio: "os_situacoes",
    label: "OS — Situações / Histórico",
    obrigatorios: ["os.numero", "status.situacao"],
    opcionais: ["meta.funcionario", "data.data"],
    nomesArquivo: ["situac", "historico", "status"],
  },
  {
    dominio: "ordens_servicos",
    label: "Ordens de Serviço",
    obrigatorios: ["os.numero"],
    opcionais: ["cliente.nome", "financeiro.valorTotal", "data.prazoEntrega", "data.abertura", "data.data", "meta.vendedor"],
    nomesArquivo: ["ordem", "ordens_servico", "ordens_servicos", "os"],
  },
  {
    dominio: "vendas_pagamentos",
    label: "Vendas — Pagamentos",
    obrigatorios: ["venda.numero"],
    opcionais: ["pagamento.forma", "financeiro.valorParcela", "pagamento.vencimento"],
    nomesArquivo: ["vendas_pagamento", "venda_pagamento", "vendas_pagamentos"],
  },
  {
    dominio: "vendas_produtos",
    label: "Vendas — Produtos/Itens",
    obrigatorios: ["venda.numero"],
    opcionais: ["produto.nome", "item.quantidade", "financeiro.valorUnitario"],
    nomesArquivo: ["vendas_produto", "venda_produto", "vendas_produtos", "itens_venda"],
  },
  {
    dominio: "vendas_historicos",
    label: "Vendas — Histórico",
    obrigatorios: ["venda.numero"],
    opcionais: ["status.situacao", "meta.funcionario", "data.data"],
    nomesArquivo: ["vendas_historico", "historico_venda", "vendas_historicos"],
  },
  {
    dominio: "vendas",
    label: "Vendas",
    obrigatorios: ["venda.numero", "cliente.nome"],
    opcionais: ["financeiro.valorTotal", "data.data"],
    nomesArquivo: ["venda", "vendas", "pedido", "pedidos"],
  },
  {
    dominio: "fornecedores_enderecos",
    label: "Fornecedores — Endereços",
    obrigatorios: ["endereco.cep"],
    opcionais: ["endereco.logradouro", "endereco.cidade", "endereco.bairro"],
    nomesArquivo: ["fornecedor_endereco", "fornecedores_endereco", "fornecedores_enderecos"],
  },
  {
    dominio: "fornecedores",
    label: "Fornecedores",
    obrigatorios: ["fornecedor.tipo"],
    opcionais: ["cliente.nome", "cliente.email", "cliente.celular"],
    nomesArquivo: ["fornecedor", "fornecedores", "supplier"],
  },
  {
    dominio: "clientes_enderecos",
    label: "Clientes — Endereços",
    obrigatorios: ["endereco.cep", "endereco.cidade"],
    opcionais: ["endereco.logradouro", "endereco.bairro"],
    nomesArquivo: ["clientes_endereco", "clientes_enderecos"],
  },
  {
    dominio: "clientes",
    label: "Clientes",
    obrigatorios: ["cliente.nome", "cliente.tipoPessoa"],
    opcionais: ["cliente.codigo", "cliente.cpf", "cliente.cnpj", "cliente.celular", "cliente.telefone", "cliente.email", "cliente.rg"],
    nomesArquivo: ["cliente", "clientes"],
  },
  {
    dominio: "servicos_catalogo",
    label: "Catálogo de Serviços",
    obrigatorios: ["servico.nome", "financeiro.valorUnitario"],
    opcionais: ["servico.sku", "meta.cadastradoPor"],
    nomesArquivo: ["servico", "servicos", "catalogo_servico"],
  },
  {
    dominio: "produtos",
    label: "Produtos / Estoque",
    obrigatorios: ["produto.nome"],
    opcionais: ["produto.sku", "financeiro.precoVenda", "financeiro.custo", "produto.estoque"],
    nomesArquivo: ["produto", "produtos", "estoque", "catalogo"],
  },
  {
    dominio: "contas_pagar",
    label: "Contas a Pagar",
    obrigatorios: ["financeiro.descricao", "pagamento.vencimento"],
    opcionais: ["financeiro.entidadeNome", "financeiro.valorTotal", "status.situacao"],
    nomesArquivo: ["contas_pagar", "conta_pagar", "pagar", "despesa"],
  },
  {
    dominio: "contas_receber",
    label: "Contas a Receber",
    obrigatorios: ["financeiro.descricao", "pagamento.vencimento"],
    opcionais: ["financeiro.entidadeNome", "financeiro.valorTotal", "status.situacao"],
    nomesArquivo: ["contas_receber", "conta_receber", "receber", "receita"],
  },
]

// ── API pública ───────────────────────────────────────────────

/** Normaliza um header bruto para chave do dicionário semântico */
export function normHeader(h: unknown): string {
  return norm(h)
}

/** Resolve um header para o campo semântico canônico */
export function resolverCampoSemantico(header: string): string | null {
  const n = norm(header)
  return DICIONARIO_SEMANTICO[n] ?? null
}

/** Mapeia todos os headers de uma planilha para campos semânticos */
export function mapearHeaders(headers: string[]): Record<string, string> {
  const mapa: Record<string, string> = {}
  for (const h of headers) {
    const campo = resolverCampoSemantico(h)
    if (campo) mapa[h] = campo
  }
  return mapa
}

/** Detecta o domínio de uma planilha com score de confiança */
export function detectarDominio(
  headers: string[],
  nomeArquivo: string
): { dominio: DominioImport; confianca: number; chaveJoin: string | null } {
  const nomeNorm = norm(nomeArquivo)
  const camposSemanticos = new Set(headers.map((h) => resolverCampoSemantico(h)).filter(Boolean) as string[])

  let melhorScore = 0
  let melhorDominio: DominioImport = "desconhecido"

  for (const sig of ASSINATURAS) {
    // Bônus por nome de arquivo
    const bonusNome = sig.nomesArquivo.some((n) => nomeNorm.includes(norm(n))) ? 0.2 : 0

    // Score por campos obrigatórios
    const obrigPresentes = sig.obrigatorios.filter((c) => camposSemanticos.has(c)).length
    const obrigTotal = sig.obrigatorios.length
    const scoreObrig = obrigTotal > 0 ? obrigPresentes / obrigTotal : 0

    // Score por campos opcionais
    const opcionaisPresentes = sig.opcionais.filter((c) => camposSemanticos.has(c)).length
    const opcionaisTotal = sig.opcionais.length
    const scoreOpcional = opcionaisTotal > 0 ? opcionaisPresentes / opcionaisTotal : 0

    // Score final ponderado
    const score = scoreObrig * 0.6 + scoreOpcional * 0.2 + bonusNome

    if (score > melhorScore) {
      melhorScore = score
      melhorDominio = sig.dominio
    }
  }

  // Determina a chave de join principal
  const chaveJoin = determinarChaveJoin(melhorDominio, headers)

  return {
    dominio: melhorScore >= 0.3 ? melhorDominio : "desconhecido",
    confianca: Math.min(melhorScore, 1),
    chaveJoin,
  }
}

/** Retorna a coluna original (header real) que corresponde à chave de join */
function determinarChaveJoin(dominio: DominioImport, headers: string[]): string | null {
  const chavesPorDominio: Record<string, string[]> = {
    ordens_servicos: ["os.numero"],
    os_equipamentos: ["os.numero"],
    os_pagamentos: ["os.numero"],
    os_servicos: ["os.numero"],
    os_situacoes: ["os.numero"],
    vendas: ["venda.numero"],
    vendas_historicos: ["venda.numero"],
    vendas_pagamentos: ["venda.numero"],
    vendas_produtos: ["venda.numero"],
    clientes: ["cliente.codigo", "cliente.cpf", "cliente.cnpj", "cliente.documento", "cliente.nome"],
    clientes_enderecos: ["cliente.codigo", "cliente.cpf", "cliente.documento"],
    fornecedores: ["cliente.nome"],
    fornecedores_enderecos: ["cliente.nome"],
    produtos: ["produto.sku", "produto.barcode", "produto.nome"],
    servicos_catalogo: ["servico.nome", "servico.sku"],
    contas_pagar: ["financeiro.descricao"],
    contas_receber: ["financeiro.descricao"],
  }

  const camposChave = chavesPorDominio[dominio] ?? []
  for (const campoChave of camposChave) {
    for (const h of headers) {
      if (resolverCampoSemantico(h) === campoChave) return h
    }
  }
  return headers[0] ?? null
}

/** Retorna o label legível de um domínio */
export function labelDominio(dominio: DominioImport): string {
  return ASSINATURAS.find((s) => s.dominio === dominio)?.label ?? dominio
}
