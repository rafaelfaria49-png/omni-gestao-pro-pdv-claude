import type { OrdemServico } from "@/types/os";

export interface VersaoDocumentoOSV3 { versao: number; registradoEm: string; motivo: string; os: OrdemServico }
export function lerVersoesDocumentoOSV3(os: OrdemServico | null): VersaoDocumentoOSV3[] {
  const v = (os as unknown as { documentosOSVersoesV3?: unknown } | null)?.documentosOSVersoesV3;
  return Array.isArray(v) ? v as VersaoDocumentoOSV3[] : [];
}
function snapshot(os: OrdemServico): OrdemServico {
  const p = { ...os } as unknown as Record<string, unknown>;
  for (const k of ["documentosOSVersoesV3", "edicoesCompletasV3", "aditivosEdicaoOSV3", "orcamentoVersoesV3", "orcamentoHistorico"]) delete p[k];
  return JSON.parse(JSON.stringify(p)) as OrdemServico;
}
/** Snapshots imutáveis para reimpressão; nenhuma versão anterior é substituída. */
export function versionarDocumentosEdicaoOSV3<T extends OrdemServico>(antes: T, depois: T, agora: string, motivo: string): T {
  const existentes = lerVersoesDocumentoOSV3(antes);
  const anteriores = existentes.length ? existentes : [{ versao: 1, registradoEm: agora, motivo: "Estado persistido antes da primeira correção autorizada", os: snapshot(antes) }];
  return { ...depois, documentosOSVersoesV3: [...anteriores, { versao: anteriores.length + 1, registradoEm: agora, motivo, os: snapshot(depois) }] };
}
