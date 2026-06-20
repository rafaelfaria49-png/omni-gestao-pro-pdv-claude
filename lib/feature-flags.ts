/**
 * Feature flags (mock) para rollout gradual.
 *
 * IMPORTANTE: nesta etapa, tudo é somente UI (sem backend).
 */

export const financeiroV2Enabled = true;

/**
 * Módulos experimentais / não-prontos para operação real.
 *
 * Ficam OCULTOS/BLOQUEADOS por padrão (produção) para impedir uso operacional
 * incorreto — sem remover código. Em desenvolvimento, libere com a env
 * `NEXT_PUBLIC_OG_EXPERIMENTAL=1` (ex.: em `.env.local`).
 */
const experimentalModulesEnabled = process.env.NEXT_PUBLIC_OG_EXPERIMENTAL === "1";

/**
 * PDVs experimentais: Black Edition (`/dashboard/pdv-next`) já persiste vendas
 * reais pelo motor oficial; segue experimental por funcionalidades de balcão
 * ainda em desenvolvimento (impressão de cupom, desconto, devolução). Inclui
 * também o espelho de referência (`/dashboard/pdv-github-original`).
 * Operação completa recomendada no PDV oficial em `/dashboard/vendas`.
 */
export const experimentalPdvEnabled = experimentalModulesEnabled;

/**
 * HUBs ainda em roadmap (Marketplace, Marketing IA): dados mock / não
 * operacionais. Ocultos do menu até estarem prontos.
 */
export const roadmapHubsEnabled = experimentalModulesEnabled;

