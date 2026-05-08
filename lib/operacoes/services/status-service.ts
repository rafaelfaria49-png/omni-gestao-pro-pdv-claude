import type { OSStatus } from "@/types/os";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";

export type PrismaStatusOrdemServico = "Aberto" | "EmAnalise" | "Pronto" | "Entregue";

export function toPrismaStatus(status: OSStatus): PrismaStatusOrdemServico {
  return operacaoStatusToPrismaStatus(status);
}

