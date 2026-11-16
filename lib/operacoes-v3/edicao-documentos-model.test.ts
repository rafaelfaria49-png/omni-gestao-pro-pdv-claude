import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/components/operacoes/lovable/types/os";
import { lerVersoesDocumentoOSV3, versionarDocumentosEdicaoOSV3 } from "./edicao-documentos-model";

describe("versões de documentos após edição de OS", () => {
  it("preserva original e revisões sem snapshots recursivos", () => {
    const original = { id: "os-sintetica", cliente: { nome: "Cliente anterior" }, orcamento: { total: 330 } } as OrdemServico;
    const revisada = versionarDocumentosEdicaoOSV3(original, { ...original, orcamento: { ...original.orcamento!, total: 400 } }, "2026-11-14T15:00:00Z", "Corrigir preço");
    expect(lerVersoesDocumentoOSV3(revisada).map((v) => v.os.orcamento?.total)).toEqual([330, 400]);
    const outra = versionarDocumentosEdicaoOSV3(revisada, { ...revisada, cliente: { ...revisada.cliente, nome: "Nome corrigido" } }, "2026-11-14T16:00:00Z", "Corrigir cliente");
    expect(lerVersoesDocumentoOSV3(outra)).toHaveLength(3);
    expect(lerVersoesDocumentoOSV3(outra)[0].os.cliente.nome).toBe("Cliente anterior");
    expect(lerVersoesDocumentoOSV3(outra).every((v) => lerVersoesDocumentoOSV3(v.os).length === 0)).toBe(true);
    expect(lerVersoesDocumentoOSV3(original)).toEqual([]);
  });
});
