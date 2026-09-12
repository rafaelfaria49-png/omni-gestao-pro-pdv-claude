/**
 * Matriz canônica de classificação de chaves de PDV/configurações para N3.
 *
 * Classificação objetiva:
 * - `SERVER_SETTING`: Representa configuração persistente da LOJA.
 *   Reside em StoreSettings no servidor. Precedência server-first, dual-read temporário,
 *   e backfill idempotente e protegido contra stale writes.
 *
 * - `UI_PREFERENCE_LOCAL`: Preferência visual/de exibição local do navegador/operador,
 *   sem semântica de loja. NUNCA migra para StoreSettings.
 *
 * - `OPERATIONAL_LOCAL`: Estado operacional local da máquina/sessão/terminal
 *   (identidade de dispositivo, terminal ativo, contadores operacionais, sessão).
 *   NUNCA migra para StoreSettings.
 *
 * - `QUEUE_OR_CACHE`: Caches locais temporários, drafts de carrinho/venda, vendas em espera (holds),
 *   filas offline e buffers de transporte. NUNCA migra para StoreSettings.
 *
 * - `AMBIGUOUS_NOT_MIGRATED`: Chaves históricas globais sem escopo de loja determinístico,
 *   ou heurísticas históricas. Quarentenadas. NUNCA copiadas nem migradas para StoreSettings
 *   para evitar contaminação cross-store.
 */

export type SettingClassification =
  | "SERVER_SETTING"
  | "UI_PREFERENCE_LOCAL"
  | "OPERATIONAL_LOCAL"
  | "QUEUE_OR_CACHE"
  | "AMBIGUOUS_NOT_MIGRATED"

export type SettingKeyInventoryItem = {
  keyPattern: string
  scope: "store" | "store_terminal" | "device" | "global" | "session"
  classification: SettingClassification
  description: string
  actionN3: string
}

export const PDV_SETTINGS_CLASSIFICATION_MATRIX: SettingKeyInventoryItem[] = [
  // ── SERVER_SETTING (configurações da loja) ─────────────────────────────
  {
    keyPattern: "@omnigestao:pdv-layout::{storeId}",
    scope: "store",
    classification: "SERVER_SETTING",
    description: "Layout principal do PDV configurado para a loja (classic / supermercado / next)",
    actionN3: "Server-first em printerConfig.pdvMainLayout / v3PdvSectionCard. Backfill seguro.",
  },
  {
    keyPattern: "omni-pdv-classic-layout::{storeId}",
    scope: "store",
    classification: "SERVER_SETTING",
    description: "Sub-layout clássico da loja (lovable com atalhos F1-F9 ou services/Assistência)",
    actionN3: "Server-first em printerConfig.pdvParams.pdvClassicLayout. Backfill seguro.",
  },
  {
    keyPattern: "omnigestao-pdv-modo::{storeId}",
    scope: "store",
    classification: "SERVER_SETTING",
    description: "Modo inicial padrão configurado para a loja no PDV Clássico (normal / rapido)",
    actionN3: "Server-first em printerConfig.v3PdvClassicModoInicial. URL ?modo= prevalece na sessão.",
  },
  {
    keyPattern: "omnigestao:pdv-shortcuts:{storeId}",
    scope: "store",
    classification: "SERVER_SETTING",
    description: "Atalhos rápidos do PDV Assistência configurados para a loja",
    actionN3: "Server-first em printerConfig.pdvParams.atalhosRapidos. Servidor vence fast-path local.",
  },
  {
    keyPattern: "printerConfig.capabilities",
    scope: "store",
    classification: "SERVER_SETTING",
    description: "Envelope de persistência de capabilities version: 1 da loja",
    actionN3: "Server autoritativo no banco de dados com validação estrita no PUT.",
  },

  // ── UI_PREFERENCE_LOCAL (preferências locais de visualização) ───────────
  {
    keyPattern: "assistec-pdv-ui-mode",
    scope: "device",
    classification: "UI_PREFERENCE_LOCAL",
    description: "Modo de densidade visual na tela (omni-smart / compact / expand)",
    actionN3: "Não migra. Mantido local no navegador.",
  },
  {
    keyPattern: "omnigestao-pdv-rapido-beep",
    scope: "device",
    classification: "UI_PREFERENCE_LOCAL",
    description: "Preferencia de bip sonoro ao bipear item no modo rápido",
    actionN3: "Não migra. Mantido local no navegador.",
  },

  // ── OPERATIONAL_LOCAL (estado operacional da máquina/sessão) ───────────
  {
    keyPattern: "@omnigestao:deviceId",
    scope: "device",
    classification: "OPERATIONAL_LOCAL",
    description: "Identificador único estável da máquina/navegador físico",
    actionN3: "Não migra. Jamais usado como autoridade de migração ou precedência.",
  },
  {
    keyPattern: "@omnigestao:pdv-terminal:{storeId}",
    scope: "store_terminal",
    classification: "OPERATIONAL_LOCAL",
    description: "Snapshot do terminal PDV selecionado neste dispositivo para a loja",
    actionN3: "Não migra. Operação local por terminal físico.",
  },
  {
    keyPattern: "@omnigestao:pdv-black-turno:{storeId}:{terminalId}",
    scope: "store_terminal",
    classification: "OPERATIONAL_LOCAL",
    description: "Identificador de turno de caixa operacional do PDV Black",
    actionN3: "Não migra. Isolado por loja e terminal físico.",
  },
  {
    keyPattern: "@omnigestao:pdv-black-cupom:{storeId}:{terminalId}",
    scope: "store_terminal",
    classification: "OPERATIONAL_LOCAL",
    description: "Sequencial do cupom impresso localmente no terminal",
    actionN3: "Não migra. Isolado por loja e terminal físico.",
  },
  {
    keyPattern: "assistec-pdv-operator-id-v1",
    scope: "device",
    classification: "OPERATIONAL_LOCAL",
    description: "ID do operador logado localmente no terminal",
    actionN3: "Não migra. Sessão operacional local.",
  },
  {
    keyPattern: "assistec-pdv-operador-nome:{storeId}",
    scope: "store",
    classification: "OPERATIONAL_LOCAL",
    description: "Nome do operador local exibido na barra",
    actionN3: "Não migra. Estado operacional de sessão.",
  },
  {
    keyPattern: "assistec-controle-consumo-mesas-v1",
    scope: "global",
    classification: "OPERATIONAL_LOCAL",
    description: "Estado operacional de comandas e mesas ativas",
    actionN3: "Não migra. Código e persistência mantidos intactos no N3.",
  },

  // ── QUEUE_OR_CACHE (filas, holds, rascunhos de venda) ───────────────────
  {
    keyPattern: "@omnigestao:pdv-holds:{storeId}:{terminalId}",
    scope: "store_terminal",
    classification: "QUEUE_OR_CACHE",
    description: "Vendas em espera (holds) salvas no terminal",
    actionN3: "Não migra. Fila de espera operacional local.",
  },
  {
    keyPattern: "omnigestao:pdv-assistencia-cart:{storeId}",
    scope: "store",
    classification: "QUEUE_OR_CACHE",
    description: "Rascunho de carrinho da assistência na aba",
    actionN3: "Não migra. Cache de rascunho de carrinho.",
  },
  {
    keyPattern: "omnigestao:venda-completa-ent-v2:{storeId}",
    scope: "store",
    classification: "QUEUE_OR_CACHE",
    description: "Rascunho da tela Venda Completa",
    actionN3: "Não migra. Cache de rascunho temporário.",
  },
  {
    keyPattern: "assistec-pdv-import-comanda",
    scope: "session",
    classification: "QUEUE_OR_CACHE",
    description: "Ponte temporária de comanda para PDV via sessionStorage",
    actionN3: "Não migra. Transitório entre abas.",
  },

  // ── AMBIGUOUS_NOT_MIGRATED (chaves globais sem dono determinístico) ────
  {
    keyPattern: "@omnigestao:pdv-layout",
    scope: "global",
    classification: "AMBIGUOUS_NOT_MIGRATED",
    description: "Chave global legada sem storeId. Ambiguidade multi-loja.",
    actionN3: "Quarentenada. NUNCA migra para StoreSettings.",
  },
  {
    keyPattern: "omni-pdv-classic-layout",
    scope: "global",
    classification: "AMBIGUOUS_NOT_MIGRATED",
    description: "Chave global legada sem storeId. Ambiguidade multi-loja.",
    actionN3: "Quarentenada. NUNCA migra para StoreSettings.",
  },
  {
    keyPattern: "omnigestao-pdv-modo",
    scope: "global",
    classification: "AMBIGUOUS_NOT_MIGRATED",
    description: "Chave global legada sem storeId. Ambiguidade multi-loja.",
    actionN3: "Quarentenada. NUNCA migra para StoreSettings.",
  },
  {
    keyPattern: "@omnigestao:ramo-atuacao:{storeId}",
    scope: "store",
    classification: "AMBIGUOUS_NOT_MIGRATED",
    description: "Heurística legada de perfil. A autoridade do servidor é Store.profile.",
    actionN3: "Não migra. Substituída pela autoridade do servidor.",
  },
]

/**
 * Retorna a classificação de uma chave/padrão de configuração.
 */
export function classifySettingKey(key: string): SettingClassification {
  const item = PDV_SETTINGS_CLASSIFICATION_MATRIX.find((m) => {
    if (m.keyPattern === key) return true
    if (m.keyPattern.includes("{storeId}")) {
      const prefix = m.keyPattern.split("{storeId}")[0]
      if (key.startsWith(prefix)) return true
    }
    return false
  })
  return item ? item.classification : "AMBIGUOUS_NOT_MIGRATED"
}

/**
 * Indica se uma chave é elegível para migração/backfill em StoreSettings.
 * Apenas SERVER_SETTING com escopo determinístico de loja é elegível.
 */
export function isMigratableServerSetting(key: string): boolean {
  return classifySettingKey(key) === "SERVER_SETTING"
}
