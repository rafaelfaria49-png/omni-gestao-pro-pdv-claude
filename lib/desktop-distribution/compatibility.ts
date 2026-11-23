/**
 * Compatibilidade do OmniGestão Pro para Windows — só o que foi TESTADO aparece como suportado.
 *
 * Atualizar este arquivo apenas com evidência (relatório de instalação no sistema indicado).
 * Runner do GitHub (Windows Server) prova instalação/atualização/desinstalação automáticas,
 * mas não é sistema de cliente e não entra nesta lista.
 *
 * A homologação vale por VERSÃO: o botão de download de uma versão pública só liga se essa
 * versão exata estiver em `versoesHomologadas` (teste com o arquivo oficial baixado da CDN,
 * assinado). Teste de uma versão interna/não assinada não homologa a versão pública.
 */

export type CompatStatus = "verificado" | "em-validacao" | "nao-suportado"

export interface CompatEntry {
  sistema: string
  status: CompatStatus
  detalhe: string
  /** Versões públicas (x.y.z) testadas com o instalador oficial nesse sistema. */
  versoesHomologadas: string[]
}

/** Situação do sistema para a versão oferecida. Sem versão pública, mostra o histórico. */
export function statusParaVersao(entry: CompatEntry | undefined, version: string | null): CompatStatus {
  if (!entry) return "em-validacao"
  if (entry.status !== "verificado" || version === null) return entry.status
  return entry.versoesHomologadas.includes(version) ? "verificado" : "em-validacao"
}

export const DESKTOP_COMPATIBILIDADE: CompatEntry[] = [
  {
    sistema: "Windows 11 (64 bits, x64)",
    status: "verificado",
    detalhe: "Instalação, atalhos, login, troca de loja e impressão direta POS-80 testados na loja piloto (versão interna 1.0.3, sem assinatura). Cada versão pública repete o teste com o instalador oficial antes de liberar o download.",
    versoesHomologadas: [],
  },
  {
    sistema: "Windows 10 22H2 (64 bits, x64)",
    status: "em-validacao",
    detalhe: "Ainda não testado em computador real. Até a confirmação, use o sistema pelo navegador.",
    versoesHomologadas: [],
  },
  {
    sistema: "Windows em processador ARM",
    status: "nao-suportado",
    detalhe: "Não há instalador ARM. Use o sistema pelo navegador.",
    versoesHomologadas: [],
  },
  {
    sistema: "Windows 32 bits, Windows 7/8.1",
    status: "nao-suportado",
    detalhe: "Não suportado. Use um navegador atualizado em outro computador.",
    versoesHomologadas: [],
  },
]

/** Requisitos medidos (não estimados). */
export const DESKTOP_REQUISITOS: string[] = [
  "Windows 11 de 64 bits (x64). Windows 10 22H2 em validação.",
  "Conexão com a internet: o programa abre o OmniGestão Pro na nuvem com a sua conta.",
  "1 GB livre no disco: o programa instalado ocupa cerca de 500 MB e a atualização guarda a versão anterior até concluir. Instalação por usuário, sem senha de administrador.",
  "Impressora térmica instalada no Windows, se for usar a impressão direta de cupons.",
]
