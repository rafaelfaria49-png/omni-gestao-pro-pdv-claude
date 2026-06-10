// ============================================================================
// Operações V3 — Persistência de RASCUNHO da Nova OS (anti-perda de dados)
// ----------------------------------------------------------------------------
// Salva/recupera o rascunho da Nova OS Enterprise no localStorage, por unidade
// (`storeId`), para que o atendente possa interromper o atendimento (ex.: atender
// outro cliente ou fazer uma venda no balcão) sem perder o que já preencheu.
//
// SEGURANÇA/PRIVACIDADE: a SENHA do aparelho (`equipamento.senha`) NUNCA é
// persistida em localStorage — é removida antes de gravar (ver `sanitize...`).
// Ao restaurar, o operador reentra a senha. NÃO toca em dados transacionais
// (estoque/Financeiro/PDV) — é apenas o rascunho de UI.
// ============================================================================

import type { NovaOSDraftV3 } from "./nova-os-model";

const PREFIX = "omnigestao:operacoes-v3:nova-os-draft:";

export interface NovaOSDraftSnapshotV3 {
  draft: NovaOSDraftV3;
  /** Passo (índice do wizard) em que o operador estava. */
  step: number;
  /** ISO do último auto-save. */
  savedAt: string;
}

/** Chave isolada por unidade: `omnigestao:operacoes-v3:nova-os-draft:{storeId}`. */
export function novaOSDraftStorageKey(storeId: string): string {
  return `${PREFIX}${storeId.trim()}`;
}

const hasText = (v?: string | null): boolean => !!(v && v.trim());

/**
 * O rascunho tem conteúdo digitado que valha a pena preservar? Usado tanto para
 * decidir se auto-salva quanto para guardar o fechamento acidental (dirty check).
 * Ignora os campos que já vêm preenchidos no rascunho vazio (defaults dos selects
 * e a data de entrada gerada automaticamente).
 */
export function isNovaOSDraftMeaningfulV3(draft: NovaOSDraftV3 | null | undefined): boolean {
  if (!draft) return false;

  const c = draft.cliente;
  if (c && (hasText(c.id) || hasText(c.nome) || hasText(c.telefone) || hasText(c.documento) || hasText(c.email) || hasText(c.endereco) || hasText(c.cidade) || hasText(c.uf) || hasText(c.cep))) {
    return true;
  }

  const e = draft.equipamento;
  if (e && (hasText(e.marca) || hasText(e.modelo) || hasText(e.imei) || hasText(e.senha) || (e.acessorios?.length ?? 0) > 0)) {
    return true;
  }

  const p = draft.problema;
  if (p && (hasText(p.defeitoRelatado) || hasText(p.condicaoAparelho) || hasText(p.observacoesInternas))) return true;

  const d = draft.diagnostico;
  if (d && (hasText(d.diagnosticoTecnico) || hasText(d.solucaoPrevista))) return true;

  if ((draft.itens?.length ?? 0) > 0) return true;
  if ((draft.desconto ?? 0) > 0) return true;

  const pg = draft.pagamento;
  if (pg && (pg.forma !== "a_combinar" || hasText(pg.observacao) || hasText(pg.vencimentoPrevisto) || (pg.sinal ?? 0) > 0)) return true;

  const g = draft.garantia;
  if (g && (g.modelo !== "sem_garantia" || hasText(g.termo))) return true;

  const r = draft.recepcao;
  if (r && (hasText(r.recebidoPor) || hasText(r.previsaoEntrega) || r.origem !== "balcao" || r.prioridade !== "media" || r.localFisico !== "balcao")) {
    return true;
  }

  return false;
}

/**
 * Remove dados sensíveis antes de persistir. Hoje: a SENHA do aparelho — nunca
 * vai para o localStorage em texto claro.
 */
export function sanitizeNovaOSDraftForStorageV3(draft: NovaOSDraftV3): NovaOSDraftV3 {
  return {
    ...draft,
    equipamento: { ...draft.equipamento, senha: undefined },
  };
}

/** Grava o rascunho (sanitizado). Retorna o ISO do save, ou null se não gravou. */
export function writeNovaOSDraftV3(storeId: string, draft: NovaOSDraftV3, step: number): string | null {
  if (typeof window === "undefined") return null;
  const sid = storeId.trim();
  if (!sid) return null;
  try {
    const savedAt = new Date().toISOString();
    const snapshot: NovaOSDraftSnapshotV3 = {
      draft: sanitizeNovaOSDraftForStorageV3(draft),
      step,
      savedAt,
    };
    localStorage.setItem(novaOSDraftStorageKey(sid), JSON.stringify(snapshot));
    return savedAt;
  } catch {
    return null;
  }
}

/** Lê o rascunho salvo, validando a forma mínima. null se ausente/corrompido. */
export function readNovaOSDraftV3(storeId: string): NovaOSDraftSnapshotV3 | null {
  if (typeof window === "undefined") return null;
  const sid = storeId.trim();
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(novaOSDraftStorageKey(sid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NovaOSDraftSnapshotV3> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.draft) return null;
    const draft = parsed.draft as NovaOSDraftV3;
    // Forma mínima esperada (evita restaurar lixo de versões antigas).
    if (!draft.cliente || !draft.equipamento || !draft.problema || !Array.isArray(draft.itens) || !draft.pagamento || !draft.garantia || !draft.recepcao) {
      return null;
    }
    const step = Number.isFinite(parsed.step) ? Math.max(0, Number(parsed.step)) : 0;
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString();
    return { draft, step, savedAt };
  } catch {
    return null;
  }
}

/** Apaga o rascunho salvo. Usado só após sucesso ou descarte confirmado. */
export function clearNovaOSDraftV3(storeId: string): void {
  if (typeof window === "undefined") return;
  const sid = storeId.trim();
  if (!sid) return;
  try {
    localStorage.removeItem(novaOSDraftStorageKey(sid));
  } catch {
    /* ignore */
  }
}
