/**
 * Numeração Fiscal por Série (GOAL_008) — ponto único de import.
 *
 * DORMENTE: prepara a NotaFiscal (modelo/série/número/ambiente) para a emissão simulada,
 * sem XML/DANFE/SEFAZ. A reserva é atômica e concorrência-segura; números nunca se repetem
 * nem retrocedem. Integra-se ao pipeline (GOAL_007) via a porta `allocateNumero`.
 */
export * from "./numbering.types"
export { allocateFiscalNumber } from "./allocate-fiscal-number"
export { createPrismaFiscalNumberingPorts, type NumberingPrismaClient } from "./prisma-numbering-ports"
