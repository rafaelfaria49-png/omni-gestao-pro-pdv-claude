import type { PecaUsada } from "@/components/operacoes/lovable/types/os";

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

export function inferProdutoIdFromPeca(p: PecaUsada): string | undefined {
  return asNonEmptyString(p.produtoId);
}

export function isPecaComProdutoReal(p: PecaUsada): boolean {
  return Boolean(inferProdutoIdFromPeca(p));
}

export function getPecaIdentityLabel(p: PecaUsada): string {
  const produtoId = inferProdutoIdFromPeca(p);
  if (produtoId) return `Produto ${produtoId}`;
  if (asNonEmptyString(p.sku)) return `SKU ${p.sku}`;
  if (asNonEmptyString(p.barcode)) return `Barras ${p.barcode}`;
  return "Sem vínculo com cadastro";
}

export function normalizePecaUsada(input: PecaUsada): PecaUsada {
  const produtoId = inferProdutoIdFromPeca(input);

  let produtoOrigem: PecaUsada["produtoOrigem"] = input.produtoOrigem;
  if (!produtoOrigem) {
    produtoOrigem = produtoId ? "prisma" : "mock";
  }

  return {
    ...input,
    produtoId,
    sku: asNonEmptyString(input.sku),
    barcode: asNonEmptyString(input.barcode),
    produtoOrigem,
    custoUnitario: typeof input.custoUnitario === "number" ? input.custoUnitario : undefined,
  };
}

export function normalizePecasUsadas(items: PecaUsada[] | undefined | null): PecaUsada[] {
  if (!Array.isArray(items)) return [];
  return items.map(normalizePecaUsada);
}

