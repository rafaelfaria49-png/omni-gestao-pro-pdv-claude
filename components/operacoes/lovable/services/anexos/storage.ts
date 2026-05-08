import type { PersistedBlobRef } from "./types";

type StoredBlobRow = {
  key: string;
  mimeType: string;
  blob: Blob;
  updatedAt: string;
};

const DB_NAME = "omnigestao-operacoes-anexos";
const DB_VERSION = 1;
const STORE = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("Transação IndexedDB abortada"));
  });
}

export async function putLocalBlob(key: string, blob: Blob, mimeType?: string): Promise<PersistedBlobRef> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const row: StoredBlobRow = {
    key,
    mimeType: mimeType || blob.type || "application/octet-stream",
    blob,
    updatedAt: new Date().toISOString(),
  };
  store.put(row);
  await txDone(tx);
  db.close();
  return { provider: "local-idb", key };
}

export async function getLocalBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const req = store.get(key);
  const row = await new Promise<StoredBlobRow | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as StoredBlobRow | undefined);
    req.onerror = () => reject(req.error ?? new Error("Falha ao ler blob do IndexedDB"));
  });
  await txDone(tx);
  db.close();
  return row?.blob ?? null;
}

export async function deleteLocalBlob(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(key);
  await txDone(tx);
  db.close();
}

