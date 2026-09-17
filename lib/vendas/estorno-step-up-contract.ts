/**
 * Contrato do escopo de autorização do estorno — GOAL 007B.
 *
 * Vive sozinho, sem Prisma e sem `next/headers`, porque os DOIS lados precisam do
 * mesmo literal: o diálogo (client) declara o escopo ao pedir o PIN e o guard
 * (server) exige exatamente esse escopo ao verificar. Importar o guard a partir do
 * componente arrastaria código de servidor para o bundle do cliente.
 */

/** Ação declarada na emissão da autorização e exigida na verificação. */
export const ESTORNO_STEP_UP_ACTION = "estornar_venda" as const
