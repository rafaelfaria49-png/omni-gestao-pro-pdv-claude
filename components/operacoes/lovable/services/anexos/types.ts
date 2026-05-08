import type { AnexoTipo } from "@/types/os";

export type AnexoCategoria =
  | "diagnostico"
  | "bancada"
  | "cliente"
  | "comprovante"
  | "garantia"
  | "equipamento"
  | "outros";

export type AnexoOrigem = "operacoes-hub";

export type StorageProviderId = "local-idb" | "legacy-blob" | "external-url";

export type CanonicalAnexo = {
  id: string;
  nome: string;
  tipo: AnexoTipo;
  mimeType?: string;
  tamanho?: number;
  createdAt: string;
  enviadoPor: string;
  origem: AnexoOrigem;
  categoria: AnexoCategoria;
  /** URL persistida (pode ser `local-idb://<id>` ou https://...). */
  url: string;
  /** URL de preview em runtime (objectURL), quando necessário. */
  previewUrl?: string;
  storageProvider: StorageProviderId;
  /** true quando o blob está realmente persistido no provider. */
  persisted: boolean;
  checksum?: string;
  metadata?: Record<string, unknown>;
  /** Visível no portal do cliente */
  publico?: boolean;
};

export type PersistedBlobRef = {
  provider: StorageProviderId;
  key: string;
};

