import type { Anexo, AnexoTipo } from "@/types/os";
import type { AnexoCategoria, CanonicalAnexo, StorageProviderId } from "./types";

export function categoriaFromTipo(tipo: AnexoTipo): AnexoCategoria {
  if (tipo === "foto_antes" || tipo === "foto_depois" || tipo === "foto_defeito") return "equipamento";
  if (tipo === "laudo" || tipo === "documento_tecnico") return "diagnostico";
  if (tipo === "nota" || tipo === "comprovante" || tipo === "audio") return "comprovante";
  if (tipo === "video") return "bancada";
  return "outros";
}

export function providerFromUrl(url: string | undefined): StorageProviderId {
  const u = (url ?? "").trim();
  if (!u) return "external-url";
  if (u.startsWith("local-idb://")) return "local-idb";
  if (u.startsWith("blob:")) return "legacy-blob";
  if (/^https?:\/\//i.test(u)) return "external-url";
  if (/^data:/i.test(u)) return "external-url";
  return "external-url";
}

export function buildLocalIdbUrl(id: string) {
  return `local-idb://${id}`;
}

export function toCanonicalFromPayload(a: Anexo): CanonicalAnexo {
  const storageProvider = (a as any).storageProvider ?? providerFromUrl(a.url);
  const categoria: AnexoCategoria = (a as any).categoria ?? categoriaFromTipo(a.tipo);
  const persisted: boolean =
    typeof (a as any).persisted === "boolean"
      ? (a as any).persisted
      : storageProvider === "local-idb" || storageProvider === "external-url";

  return {
    id: a.id,
    nome: a.nome,
    tipo: a.tipo,
    mimeType: a.mimeType,
    tamanho: a.tamanho,
    createdAt: a.enviadoEm,
    enviadoPor: a.enviadoPor,
    origem: "operacoes-hub",
    categoria,
    url: a.url,
    storageProvider,
    persisted,
    checksum: (a as any).checksum,
    metadata: (a as any).metadata,
    publico: a.publico,
  };
}

export function toPayloadFromCanonical(a: CanonicalAnexo): Anexo {
  // Mantém compatibilidade com o payload atual (campos extras são opcionais).
  return {
    id: a.id,
    tipo: a.tipo,
    nome: a.nome,
    url: a.url,
    tamanho: a.tamanho,
    mimeType: a.mimeType,
    enviadoPor: a.enviadoPor,
    enviadoEm: a.createdAt,
    publico: a.publico,
    ...(a.categoria ? ({ categoria: a.categoria } as any) : {}),
    ...(a.storageProvider ? ({ storageProvider: a.storageProvider } as any) : {}),
    ...(typeof a.persisted === "boolean" ? ({ persisted: a.persisted } as any) : {}),
    ...(a.checksum ? ({ checksum: a.checksum } as any) : {}),
    ...(a.metadata ? ({ metadata: a.metadata } as any) : {}),
  };
}

