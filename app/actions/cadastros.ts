"use server";

import { Prisma, StatusOrdemServico } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { withPrismaSafe } from "@/lib/prisma";

export type CadastrosKpiIcon =
  | "Users"
  | "Package"
  | "Wrench"
  | "Truck"
  | "HardHat"
  | "Smartphone"
  | "AlertTriangle"
  | "RefreshCw";

export type CadastrosKpi = {
  label: string;
  value: number;
  delta: string;
  icon: CadastrosKpiIcon;
};

export type CadastrosSaudeItem = { label: string; value: number };

export type CadastrosProdutoAlerts = {
  estoqueBaixo: number;
  semPreco: number;
  semFornecedor: number;
  margemBaixa: number;
  prontosMarketplace: number;
};

export type CadastrosIaStats = {
  produtosProntosMarketplace: number;
  cadastrosGeradosPorIa: number; // ainda sem modelo (0)
  produtosSemImagem: number;
  anunciosPendentes: number;
  duplicadosEncontrados: number;
  camposFiscaisFaltando: number; // ainda sem campos fiscais formais no Produto (0)
};

export type CadastrosDashboardStats = {
  kpis: CadastrosKpi[];
  saude: CadastrosSaudeItem[];
  produtoAlerts: CadastrosProdutoAlerts;
  ia: CadastrosIaStats;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  const v = Math.round((part / total) * 100);
  return Math.max(0, Math.min(100, v));
}

/**
 * Estatísticas do dashboard do Cadastros HUB.
 * Importante: se alguma tabela/model não existir no banco em produção, `withPrismaSafe` retorna 0 sem quebrar UI.
 */
export async function getCadastrosDashboardStats(storeId: string): Promise<CadastrosDashboardStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [
    totalClientes,
    clientesComTelefone,
    clientesAtualizadosMes,
    totalProdutos,
    produtosAtivos,
    produtosAtualizadosMes,
    produtosSemPreco,
    produtosSemSku,
    produtosSemFornecedor,
    produtosEstoqueBaixo,
    totalServicos,
    servicosAtualizadosMes,
    servicosComGarantia,
    fornecedoresAtivos,
    categoriasAtivas,
    marcasAtivas,
    tecnicosAtivos,
    equipamentosModelosAtivos,
  ] = await Promise.all([
    withPrismaSafe((db) => db.cliente.count({ where: { storeId } }), 0),
    withPrismaSafe((db) => db.cliente.count({ where: { storeId, phone: { not: null } } }), 0),
    withPrismaSafe((db) => db.cliente.count({ where: { storeId, updatedAt: { gte: monthStart } } }), 0),

    withPrismaSafe((db) => db.produto.count({ where: { storeId } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, active: true } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, updatedAt: { gte: monthStart } } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, price: { lte: 0 } } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, OR: [{ sku: null }, { sku: "" }] } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, supplierName: "" } }), 0),
    withPrismaSafe((db) => db.produto.count({ where: { storeId, stock: { gt: 0, lt: 6 } } }), 0),

    withPrismaSafe((db) => db.servico.count({ where: { storeId } }), 0),
    withPrismaSafe((db) => db.servico.count({ where: { storeId, updatedAt: { gte: monthStart } } }), 0),
    withPrismaSafe((db) => db.servico.count({ where: { storeId, warrantyDays: { gt: 0 } } }), 0),

    withPrismaSafe((db) => db.fornecedor.count({ where: { storeId, active: true } }), 0),
    withPrismaSafe((db) => db.categoriaCadastro.count({ where: { storeId, active: true } }), 0),
    withPrismaSafe((db) => db.marcaCadastro.count({ where: { storeId, active: true } }), 0),
    withPrismaSafe((db) => db.tecnico.count({ where: { storeId, active: true } }), 0),
    withPrismaSafe((db) => db.equipamentoModelo.count({ where: { storeId, active: true } }), 0),
  ]);

  // margem baixa: depende de custo/preço; filtra no app (não dá pra fazer com index simples aqui).
  const margemBaixa = await withPrismaSafe(async (db) => {
    const rows = await db.produto.findMany({
      where: { storeId, price: { gt: 0 } },
      select: { price: true, precoCusto: true },
      take: 5000,
    });
    let low = 0;
    for (const r of rows) {
      const preco = Number(r.price ?? 0);
      const custo = Number(r.precoCusto ?? 0);
      if (preco <= 0) continue;
      const margin = ((preco - custo) / preco) * 100;
      if (Number.isFinite(margin) && margin > 0 && margin < 20) low++;
    }
    return low;
  }, 0);

  // "Prontos p/ Marketplace": heurística mínima (sem inventar features).
  const prontosMarketplace = await withPrismaSafe(
    (db) =>
      db.produto.count({
        where: {
          storeId,
          active: true,
          price: { gt: 0 },
          stock: { gt: 0 },
          category: { not: null },
        },
      }),
    0
  );

  const produtosSemImagem = await withPrismaSafe(
    async (db) => {
      const total = await db.produto.count({ where: { storeId } });
      if (total <= 0) return 0;
      const withAnyMedia = await db.productMedia.count({
        where: { storeId },
      });
      // count de mídia não é count de produtos; calculo correto via distinct productId.
      const distinct = await db.productMedia.findMany({
        where: { storeId },
        select: { productId: true },
        distinct: ["productId"],
      });
      const productsWithMedia = distinct.length;
      return Math.max(0, total - productsWithMedia);
    },
    0
  );

  const anunciosPendentes = await withPrismaSafe(
    (db) =>
      db.marketplaceListing.count({
        where: {
          storeId,
          status: { in: ["draft", "pending", "error"] },
        },
      }),
    0
  );

  const duplicadosEncontrados = await withPrismaSafe(
    async (db) => {
      // Heurística mínima: documentos de cliente duplicados (não vazio) + SKU duplicado (não vazio)
      const [dupDocs, dupSkus] = await Promise.all([
        db.cliente.groupBy({
          by: ["document"],
          where: { storeId, document: { not: "" } },
          _count: { _all: true },
          having: { document: { _count: { gt: 1 } } },
        }),
        db.produto.groupBy({
          by: ["sku"],
          where: { storeId, sku: { not: null } },
          _count: { _all: true },
          having: { sku: { _count: { gt: 1 } } },
        }),
      ]);
      const docsExtra = dupDocs.reduce((acc, g) => acc + Math.max(0, (g._count?._all ?? 0) - 1), 0);
      const skusExtra = dupSkus.reduce((acc, g) => acc + Math.max(0, (g._count?._all ?? 0) - 1), 0);
      return docsExtra + skusExtra;
    },
    0
  );

  const equipamentosComPecasCompativeisPct = await withPrismaSafe(
    async (db) => {
      const total = await db.equipamentoModelo.count({ where: { storeId } });
      if (total <= 0) return 0;
      // JsonB: `count` com not null pode conflitar com tipos; faz via findMany + filtro.
      const rows = await db.equipamentoModelo.findMany({
        where: { storeId },
        select: { compatibleParts: true },
        take: 5000,
      });
      const withParts = rows.filter((r) => Array.isArray(r.compatibleParts) && r.compatibleParts.length > 0).length;
      return pct(withParts, total);
    },
    0
  );

  // incompletos: produtos com preço<=0 ou sem categoria/sku + serviços sem categoria ou preço<=0 + clientes sem telefone
  const cadastrosIncompletos = produtosSemPreco + produtosSemSku + produtosSemFornecedor;

  const atualizadosEsteMes = clientesAtualizadosMes + produtosAtualizadosMes + servicosAtualizadosMes;

  const kpis: CadastrosKpi[] = [
    { label: "Clientes cadastrados", value: totalClientes, delta: "+0", icon: "Users" },
    { label: "Produtos ativos", value: produtosAtivos, delta: "+0", icon: "Package" },
    { label: "Serviços cadastrados", value: totalServicos, delta: "+0", icon: "Wrench" },
    { label: "Fornecedores ativos", value: fornecedoresAtivos, delta: "+0", icon: "Truck" },
    { label: "Técnicos cadastrados", value: tecnicosAtivos, delta: "+0", icon: "HardHat" },
    { label: "Equipamentos / modelos", value: equipamentosModelosAtivos, delta: "+0", icon: "Smartphone" },
    { label: "Cadastros incompletos", value: cadastrosIncompletos, delta: "+0", icon: "AlertTriangle" },
    { label: "Atualizados este mês", value: atualizadosEsteMes, delta: "+0", icon: "RefreshCw" },
  ];

  const saude: CadastrosSaudeItem[] = [
    { label: "Clientes com telefone", value: pct(clientesComTelefone, totalClientes) },
    { label: "Produtos com SKU", value: pct(totalProdutos - produtosSemSku, totalProdutos) },
    { label: "Produtos com preço", value: pct(totalProdutos - produtosSemPreco, totalProdutos) },
    { label: "Serviços com garantia", value: pct(servicosComGarantia, totalServicos) },
    // Fornecedor com CNPJ (model existe, mas “document” é livre; usamos document != "")
    {
      label: "Fornecedores com CNPJ",
      value: await withPrismaSafe(
        async (db) => {
          const total = await db.fornecedor.count({ where: { storeId } });
          const withDoc = await db.fornecedor.count({ where: { storeId, document: { not: "" } } });
          return pct(withDoc, total);
        },
        0
      ),
    },
    { label: "Equipamentos com peças compatíveis", value: equipamentosComPecasCompativeisPct },
  ];

  const produtoAlerts: CadastrosProdutoAlerts = {
    estoqueBaixo: produtosEstoqueBaixo,
    semPreco: produtosSemPreco,
    semFornecedor: produtosSemFornecedor,
    margemBaixa,
    prontosMarketplace,
  };

  const ia: CadastrosIaStats = {
    produtosProntosMarketplace: prontosMarketplace,
    cadastrosGeradosPorIa: 0,
    produtosSemImagem,
    anunciosPendentes,
    duplicadosEncontrados,
    camposFiscaisFaltando: 0,
  };

  return { kpis, saude, produtoAlerts, ia };
}

export type FornecedorDTO = {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  contato: string;
  whatsapp: string;
  email: string;
  endereco: string;
  produtos: string;
  prazo: string;
  pagamento: string;
  observacoes: string;
  ultima: string;
  status: "Ativo" | "Inativo";
};

export async function listFornecedores(storeId: string): Promise<FornecedorDTO[]> {
  const rows = await prisma.fornecedor.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((f) => ({
    id: f.id,
    nome: f.name,
    razaoSocial: f.legalName,
    cnpj: f.document || "—",
    contato: f.contactName || "—",
    whatsapp: f.whatsapp || "—",
    email: f.email || "—",
    endereco: f.address || "",
    produtos: f.productsProvided || "",
    prazo: f.avgLeadTime || "—",
    pagamento: f.paymentTerms || "—",
    observacoes: f.notes ?? "",
    ultima: fmtDateISO(f.updatedAt),
    status: f.active ? "Ativo" : "Inativo",
  }));
}

export async function upsertFornecedor(
  storeId: string,
  input: {
    id?: string;
    nome: string;
    razaoSocial?: string;
    cnpj?: string;
    contato?: string;
    whatsapp?: string;
    email?: string;
    endereco?: string;
    produtos?: string;
    prazo?: string;
    pagamento?: string;
    observacoes?: string;
    active?: boolean;
  }
): Promise<{ id: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome obrigatório");

  const common = {
    name: nome,
    legalName: (input.razaoSocial ?? "").trim(),
    contactName: (input.contato ?? "").trim(),
    document: (input.cnpj ?? "").trim(),
    phone: "", // UI atual não tem campo telefone separado do whatsapp; manter vazio por enquanto
    whatsapp: (input.whatsapp ?? "").trim(),
    email: (input.email ?? "").trim(),
    address: (input.endereco ?? "").trim(),
    productsProvided: (input.produtos ?? "").trim(),
    avgLeadTime: (input.prazo ?? "").trim(),
    paymentTerms: (input.pagamento ?? "").trim(),
    notes: (input.observacoes ?? "").trim() || null,
    active: input.active ?? true,
  } as const;

  if (input.id) {
    const existing = await prisma.fornecedor.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Fornecedor não encontrado");
    const updated = await prisma.fornecedor.update({ where: { id: input.id }, data: common, select: { id: true } });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.fornecedor.create({ data: { ...common, storeId }, select: { id: true } });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export type CategoriaCadastroType = "produto" | "servico" | "equipamento" | "geral";

export type CategoriaCadastroDTO = {
  id: string;
  name: string;
  type: CategoriaCadastroType;
  active: boolean;
};

export async function listCategorias(storeId: string): Promise<CategoriaCadastroDTO[]> {
  const rows = await prisma.categoriaCadastro.findMany({
    where: { storeId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: 1000,
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: (c.type as CategoriaCadastroType) || "geral",
    active: c.active,
  }));
}

export async function upsertCategoria(
  storeId: string,
  input: { id?: string; name: string; type: CategoriaCadastroType; active?: boolean }
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nome obrigatório");
  const type = input.type || "geral";

  const common = {
    name,
    type,
    active: input.active ?? true,
  } as const;

  if (input.id) {
    const existing = await prisma.categoriaCadastro.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Categoria não encontrada");
    const updated = await prisma.categoriaCadastro.update({ where: { id: input.id }, data: common, select: { id: true } });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.categoriaCadastro.create({ data: { ...common, storeId }, select: { id: true } });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export type MarcaCadastroDTO = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

export async function listMarcas(storeId: string): Promise<MarcaCadastroDTO[]> {
  const rows = await prisma.marcaCadastro.findMany({
    where: { storeId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: 2000,
  });
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    active: m.active,
  }));
}

export async function upsertMarca(
  storeId: string,
  input: { id?: string; name: string; type?: string; active?: boolean }
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nome obrigatório");
  const type = (input.type ?? "").trim();

  const common = {
    name,
    type,
    active: input.active ?? true,
  } as const;

  if (input.id) {
    const existing = await prisma.marcaCadastro.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Marca não encontrada");
    const updated = await prisma.marcaCadastro.update({ where: { id: input.id }, data: common, select: { id: true } });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.marcaCadastro.create({ data: { ...common, storeId }, select: { id: true } });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export type TecnicoDTO = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  specialty: string;
  commissionPercent: number;
  active: boolean;
};

export async function listTecnicos(storeId: string): Promise<TecnicoDTO[]> {
  const rows = await prisma.tecnico.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone,
    role: t.role,
    specialty: t.specialty,
    commissionPercent: Number(t.commissionPercent ?? 0),
    active: t.active,
  }));
}

export async function upsertTecnico(
  storeId: string,
  input: {
    id?: string;
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    specialty?: string;
    commissionPercent?: number;
    active?: boolean;
  }
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nome obrigatório");

  const common = {
    name,
    email: (input.email ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    role: (input.role ?? "").trim(),
    specialty: (input.specialty ?? "").trim(),
    commissionPercent: Number(input.commissionPercent ?? 0),
    active: input.active ?? true,
  } as const;

  if (input.id) {
    const existing = await prisma.tecnico.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Técnico não encontrado");
    const updated = await prisma.tecnico.update({ where: { id: input.id }, data: common, select: { id: true } });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.tecnico.create({ data: { ...common, storeId }, select: { id: true } });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export type EquipamentoModeloDTO = {
  id: string;
  name: string;
  brand: string;
  type: string;
  year: number;
  averageRepairTime: string;
  active: boolean;
  compatibleParts: string[];
  commonDefects: string[];
  recommendedChecklist: string[];
};

function jsonStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return [];
}

export async function listEquipamentosModelos(storeId: string): Promise<EquipamentoModeloDTO[]> {
  const rows = await prisma.equipamentoModelo.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    brand: e.brand,
    type: e.type,
    year: e.year,
    averageRepairTime: e.averageRepairTime,
    active: e.active,
    compatibleParts: jsonStringArray(e.compatibleParts),
    commonDefects: jsonStringArray(e.commonDefects),
    recommendedChecklist: jsonStringArray(e.recommendedChecklist),
  }));
}

export async function upsertEquipamentoModelo(
  storeId: string,
  input: {
    id?: string;
    name: string;
    brand?: string;
    type?: string;
    year?: number;
    compatibleParts?: string[];
    commonDefects?: string[];
    recommendedChecklist?: string[];
    averageRepairTime?: string;
    active?: boolean;
  }
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nome obrigatório");

  const common = {
    name,
    brand: (input.brand ?? "").trim(),
    type: (input.type ?? "").trim(),
    year: Math.max(0, Math.trunc(input.year ?? 0)),
    compatibleParts: input.compatibleParts ?? undefined,
    commonDefects: input.commonDefects ?? undefined,
    recommendedChecklist: input.recommendedChecklist ?? undefined,
    averageRepairTime: (input.averageRepairTime ?? "").trim(),
    active: input.active ?? true,
  } as const;

  if (input.id) {
    const existing = await prisma.equipamentoModelo.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Modelo não encontrado");
    const updated = await prisma.equipamentoModelo.update({ where: { id: input.id }, data: common, select: { id: true } });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.equipamentoModelo.create({ data: { ...common, storeId }, select: { id: true } });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export async function countProdutoImagens(storeId: string): Promise<{ total: number; distinctProducts: number }> {
  const total = await withPrismaSafe((db) => db.productMedia.count({ where: { storeId } }), 0);
  const distinctProducts = await withPrismaSafe(
    async (db) => {
      const distinct = await db.productMedia.findMany({
        where: { storeId },
        select: { productId: true },
        distinct: ["productId"],
      });
      return distinct.length;
    },
    0
  );
  return { total, distinctProducts };
}

export async function countMarketplaceListings(storeId: string): Promise<{ total: number; pending: number }> {
  const total = await withPrismaSafe((db) => db.marketplaceListing.count({ where: { storeId } }), 0);
  const pending = await withPrismaSafe(
    (db) => db.marketplaceListing.count({ where: { storeId, status: { in: ["draft", "pending", "error"] } } }),
    0
  );
  return { total, pending };
}

export type ClienteKind = "PF" | "PJ";

export type ClienteDTO = {
  id: string;
  nome: string;
  tipo: ClienteKind;
  telefone: string;
  documento: string;
  cidade: string;
  totalGasto: number;
  ultimaCompra: string;
  tags: string[];
  status: "Ativo" | "Inativo";
};

export type ProdutoDTO = {
  id: string;
  nome: string;
  sku: string;
  barras: string;
  categoria: string;
  marca: string;
  fornecedor: string;
  estoque: number;
  custo: number;
  preco: number;
  margem: number;
  garantia: number;
  status: "Ativo" | "Inativo" | "Incompleto";
  /** JSON extensível (IA / integrações) — Fase 1 só persiste, sem motor IA. */
  metadata?: Record<string, unknown> | null;
};

export type ServicoDTO = {
  id: string;
  nome: string;
  categoria: string;
  tempo: string;
  custo: number;
  preco: number;
  margem: number;
  garantia: number;
  termo: string;
  status: "Ativo" | "Inativo" | "Incompleto";
};

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
  return [];
}

function fmtDateISO(d: Date | null | undefined): string {
  if (!d) return "—";
  // yyyy-mm-dd para UI mock
  return d.toISOString().slice(0, 10);
}

export async function listClientes(storeId: string): Promise<ClienteDTO[]> {
  try {
    const rows = await prisma.cliente.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    // Agrega totalGasto em paralelo: OS concluídas + Vendas concluídas vinculadas por clienteId.
    // Vendas sem clienteId (GestaoClick importadas ou consumidor final) não entram na soma.
    // Não há dupla contagem: OS e Venda são entidades distintas sem FK cruzada entre si.
    let totalPorCliente = new Map<string, number>();
    try {
      const [osTotals, vendaTotals] = await Promise.all([
        // OS Pronto ou Entregue por cliente
        prisma.ordemServico.groupBy({
          by: ["clienteId"],
          where: {
            storeId,
            clienteId: { not: null },
            status: { in: [StatusOrdemServico.Pronto, StatusOrdemServico.Entregue] },
          },
          _sum: { valorTotal: true },
        }),
        // Vendas concluídas com clienteId preenchido
        prisma.venda.groupBy({
          by: ["clienteId"],
          where: {
            storeId,
            clienteId: { not: null },
            status: "concluida",
          },
          _sum: { total: true },
        }),
      ]);

      const totais = new Map<string, number>();

      for (const r of osTotals) {
        if (r.clienteId) {
          totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.valorTotal ?? 0));
        }
      }
      for (const r of vendaTotals) {
        if (r.clienteId) {
          totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.total ?? 0));
        }
      }

      totalPorCliente = totais;
    } catch {
      // fallback silencioso: usa totalSpent estático do banco
    }

    return rows.map((c) => ({
      id: c.id,
      nome: c.name,
      tipo: (c.kind === "PJ" ? "PJ" : "PF") satisfies ClienteKind,
      telefone: c.phone ?? "—",
      documento: c.document || "—",
      cidade: c.city || "—",
      totalGasto: totalPorCliente.get(c.id) ?? Number(c.totalSpent ?? 0),
      ultimaCompra: fmtDateISO(c.lastPurchaseAt),
      tags: safeStringArray(c.tags),
      status: c.active ? "Ativo" : "Inativo",
    }));
  } catch (err) {
    console.error("[listClientes] erro ao buscar clientes:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function createCliente(
  storeId: string,
  input: {
    nome: string;
    tipo: ClienteKind;
    documento?: string;
    telefone?: string;
    email?: string;
    cidade?: string;
    tags?: string[];
    active?: boolean;
  }
): Promise<{ id: string }> {
  try {
    const nome = input.nome.trim();
    if (!nome) throw new Error("Nome obrigatório");

    const created = await prisma.cliente.create({
      data: {
        storeId,
        name: nome,
        kind: input.tipo,
        document: (input.documento ?? "").trim(),
        phone: (input.telefone ?? "").trim() || null,
        email: (input.email ?? "").trim() || null,
        city: (input.cidade ?? "").trim(),
        tags: input.tags ? input.tags : undefined,
        active: input.active ?? true,
      },
      select: { id: true },
    });
    revalidatePath("/dashboard/cadastros-v2");
    return created;
  } catch (err) {
    console.error("[createCliente] erro ao criar cliente:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao criar cliente. Tente novamente.");
  }
}

export async function updateCliente(
  storeId: string,
  id: string,
  patch: Partial<{
    nome: string;
    tipo: ClienteKind;
    documento: string;
    telefone: string;
    email: string;
    cidade: string;
    tags: string[];
    active: boolean;
  }>
): Promise<void> {
  try {
    const existing = await prisma.cliente.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Cliente não encontrado");

    await prisma.cliente.update({
      where: { id },
      data: {
        name: patch.nome ? patch.nome.trim() : undefined,
        kind: patch.tipo,
        document: patch.documento !== undefined ? patch.documento.trim() : undefined,
        phone: patch.telefone !== undefined ? patch.telefone.trim() || null : undefined,
        email: patch.email !== undefined ? patch.email.trim() || null : undefined,
        city: patch.cidade !== undefined ? patch.cidade.trim() : undefined,
        tags: patch.tags !== undefined ? patch.tags : undefined,
        active: patch.active,
      },
    });
    revalidatePath("/dashboard/cadastros-v2");
  } catch (err) {
    console.error("[updateCliente] erro ao atualizar cliente:", err instanceof Error ? err.message : String(err));
    throw err instanceof Error ? err : new Error("Falha ao atualizar cliente. Tente novamente.");
  }
}

function produtoMetadataRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export async function listProdutos(storeId: string, opts?: { q?: string }): Promise<ProdutoDTO[]> {
  const q = opts?.q?.trim();
  try {
    const rows = await prisma.produto.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
                { barcode: { contains: q, mode: "insensitive" as const } },
                { category: { contains: q, mode: "insensitive" as const } },
                { brand: { contains: q, mode: "insensitive" as const } },
                { supplierName: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        category: true,
        brand: true,
        supplierName: true,
        stock: true,
        price: true,
        precoCusto: true,
        warrantyDays: true,
        active: true,
        metadata: true,
      },
    });
    return rows.map((p) => {
      const preco = Number(p.price ?? 0);
      const custo = Number(p.precoCusto ?? 0);
      const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
      const status =
        !p.name || !p.category || preco <= 0
          ? ("Incompleto" as const)
          : p.active
            ? ("Ativo" as const)
            : ("Inativo" as const);
      return {
        id: p.id,
        nome: p.name,
        sku: p.sku ?? "—",
        barras: p.barcode ?? "",
        categoria: p.category ?? "—",
        marca: p.brand || "—",
        fornecedor: p.supplierName || "—",
        estoque: p.stock ?? 0,
        custo,
        preco,
        margem: Number.isFinite(margem) ? Number(margem.toFixed(1)) : 0,
        garantia: p.warrantyDays ?? 0,
        status,
        metadata: produtoMetadataRecord(p.metadata),
      };
    });
  } catch (e) {
    // Hardening: em produção, se o banco estiver em versão parcial (colunas/tabelas divergentes),
    // evita quebrar o render e tenta um select mínimo.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cadastros:listProdutos]", msg);

    const legacyRows = await withPrismaSafe(
      (db) =>
        db.produto.findMany({
          where: {
            storeId,
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    { sku: { contains: q, mode: "insensitive" as const } },
                    { barcode: { contains: q, mode: "insensitive" as const } },
                    { category: { contains: q, mode: "insensitive" as const } },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 1000,
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            category: true,
            stock: true,
            price: true,
            precoCusto: true,
            updatedAt: true,
          },
        }),
      [],
    );

    return legacyRows.map((p) => {
      const preco = Number(p.price ?? 0);
      const custo = Number(p.precoCusto ?? 0);
      const margem = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
      const status = !p.name || !p.category || preco <= 0 ? ("Incompleto" as const) : ("Ativo" as const);
      return {
        id: p.id,
        nome: p.name,
        sku: p.sku ?? "—",
        barras: p.barcode ?? "",
        categoria: p.category ?? "—",
        marca: "—",
        fornecedor: "—",
        estoque: p.stock ?? 0,
        custo,
        preco,
        margem: Number.isFinite(margem) ? Number(margem.toFixed(1)) : 0,
        garantia: 0,
        status,
        metadata: null,
      };
    });
  }
}

export async function upsertProduto(
  storeId: string,
  input: {
    id?: string;
    nome: string;
    sku?: string;
    barras?: string;
    categoria?: string;
    marca?: string;
    fornecedor?: string;
    estoque?: number;
    custo?: number;
    preco?: number;
    garantia?: number;
    active?: boolean;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ id: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome obrigatório");

  let metadataPart: { metadata?: Prisma.InputJsonValue | typeof Prisma.DbNull } = {};
  if (input.metadata !== undefined) {
    if (input.id) {
      if (input.metadata === null) {
        metadataPart = { metadata: Prisma.DbNull };
      } else {
        const row = await prisma.produto.findFirst({
          where: { id: input.id, storeId },
          select: { metadata: true },
        });
        const prev = produtoMetadataRecord(row?.metadata) ?? {};
        metadataPart = {
          metadata: { ...prev, ...input.metadata } as Prisma.InputJsonValue,
        };
      }
    } else if (input.metadata !== null) {
      metadataPart = { metadata: input.metadata as Prisma.InputJsonValue };
    }
  }

  // Stock: só inclui no patch quando o caller enviou número inteiro >= 0.
  // `undefined` significa "não tocar" — evita zerar estoque ao editar outros campos.
  // (Bug histórico: `Math.trunc(input.estoque ?? 0)` sobrescrevia stock com 0
  // em qualquer chamada sem estoque, ex.: botão Ativar/Inativar antes do fix.)
  const stockPatch: { stock?: number } = {};
  if (input.estoque !== undefined) {
    const n = Math.trunc(Number(input.estoque));
    if (Number.isFinite(n) && n >= 0) stockPatch.stock = n;
  }

  const common = {
    name: nome,
    sku: (input.sku ?? "").trim() || null,
    barcode: (input.barras ?? "").trim() || null,
    category: (input.categoria ?? "").trim() || null,
    brand: (input.marca ?? "").trim(),
    supplierName: (input.fornecedor ?? "").trim(),
    precoCusto: Number(input.custo ?? 0),
    price: Number(input.preco ?? 0),
    warrantyDays: Math.max(0, Math.trunc(input.garantia ?? 0)),
    active: input.active ?? true,
    status: input.active === false ? "Inativo" : "Ativo",
    ...stockPatch,
    ...metadataPart,
  };

  if (input.id) {
    const existing = await prisma.produto.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Produto não encontrado");
    const updated = await prisma.produto.update({
      where: { id: input.id },
      data: common,
      select: { id: true },
    });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  // Create: estoque inicial é o que o caller enviou; quando ausente, default 0.
  const created = await prisma.produto.create({
    data: { ...common, storeId, stock: stockPatch.stock ?? 0 },
    select: { id: true },
  });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

export async function listServicos(storeId: string): Promise<ServicoDTO[]> {
  const rows = await prisma.servico.findMany({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((s) => ({
    id: s.id,
    nome: s.name,
    categoria: s.category || "—",
    tempo: s.avgTime || "—",
    custo: Number(s.cost ?? 0),
    preco: Number(s.price ?? 0),
    margem: Number(s.margin ?? 0),
    garantia: s.warrantyDays ?? 0,
    termo: s.terms || "",
    status: (!s.name || !s.category || s.price <= 0 ? "Incompleto" : s.active ? "Ativo" : "Inativo"),
  }));
}

export async function upsertServico(
  storeId: string,
  input: {
    id?: string;
    nome: string;
    categoria?: string;
    tempo?: string;
    custo?: number;
    preco?: number;
    garantia?: number;
    termo?: string;
    active?: boolean;
  }
): Promise<{ id: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome obrigatório");

  const preco = Number(input.preco ?? 0);
  const custo = Number(input.custo ?? 0);
  const margin = preco > 0 ? ((preco - custo) / preco) * 100 : 0;

  const common = {
    name: nome,
    category: (input.categoria ?? "").trim(),
    avgTime: (input.tempo ?? "").trim(),
    cost: custo,
    price: preco,
    margin: Number.isFinite(margin) ? Number(margin.toFixed(1)) : 0,
    warrantyDays: Math.max(0, Math.trunc(input.garantia ?? 0)),
    terms: (input.termo ?? "").trim(),
    active: input.active ?? true,
    status: input.active === false ? "Inativo" : "Ativo",
  } as const;

  if (input.id) {
    const existing = await prisma.servico.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new Error("Serviço não encontrado");
    const updated = await prisma.servico.update({
      where: { id: input.id },
      data: common,
      select: { id: true },
    });
    revalidatePath("/dashboard/cadastros-v2");
    return updated;
  }

  const created = await prisma.servico.create({
    data: { ...common, storeId },
    select: { id: true },
  });
  revalidatePath("/dashboard/cadastros-v2");
  return created;
}

// ── Auditoria ─────────────────────────────────────────────────────────────────

export type AuditoriaItemDTO = {
  id: string
  acao: string
  entidade: string
  usuario: string
  data: string
  antes: string
  depois: string
  ip: string
}

export async function listLogsAuditoriaCadastros(): Promise<AuditoriaItemDTO[]> {
  const rows = await prisma.logsAuditoria.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return rows.map((r) => {
    let meta: Record<string, unknown> = {}
    try { if (r.metadata) meta = JSON.parse(r.metadata) } catch { /* ignore */ }
    return {
      id: r.id,
      acao: r.action,
      entidade: (meta.entidade as string) || r.detail.slice(0, 60),
      usuario: r.userLabel,
      data: r.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      antes: (meta.antes as string) || "",
      depois: (meta.depois as string) || r.detail.slice(0, 120),
      ip: r.source,
    }
  })
}

// ── Lojas ─────────────────────────────────────────────────────────────────────

export type LojaDTO = {
  id: string
  nome: string
  cnpj: string
  cidade: string
  ativa: boolean
}

export async function listLojasCadastros(): Promise<LojaDTO[]> {
  const rows = await prisma.store.findMany({ orderBy: { id: "asc" }, take: 50 })
  return rows.map((s) => {
    const addr =
      s.address && typeof s.address === "object" && !Array.isArray(s.address)
        ? (s.address as Record<string, unknown>)
        : null
    return {
      id: s.id,
      nome: s.name || s.id,
      cnpj: s.cnpj,
      cidade: (addr?.cidade as string) ?? (addr?.city as string) ?? "",
      ativa: true,
    }
  })
}

