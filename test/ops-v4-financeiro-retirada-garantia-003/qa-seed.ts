import { PrismaClient, type Prisma } from "../../generated/prisma";
import { comPadroesGarantiaServicosV3 } from "../../lib/operacoes-v3/garantia-servicos-model";
import { criarAutorizacaoEntregaSemCobrancaV3 } from "../../lib/operacoes-v3/delivery-financial-guard";
import { osGarantiasSinteticaV3 } from "./fixtures";

const url = new URL(process.env.DATABASE_URL || "http://ausente");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/ops_v4_frg_qa_garantias" || process.env.DATABASE_URL !== process.env.DIRECT_URL) throw new Error("BLOQUEIO_QA: alvo diferente do banco sintético exclusivo.");
const db = new PrismaClient();
async function main() {
  const storeId = "000-qa-frg-001";
  await db.store.update({ where: { id: storeId }, data: { name: "Loja E2E Garantia 002", phone: "", cnpj: "SINTÉTICO-QA", address: { cidade: "Cidade Sintética", estado: "QA" } } });
  const cliente = await db.cliente.upsert({ where: { id: "qa-garantias-cliente" }, update: {}, create: { id: "qa-garantias-cliente", storeId, name: "Cliente Sintético Garantias", document: "" } });
  const usuario = await db.adminUser.findUniqueOrThrow({ where: { email: "garantias@qa.test" } });
  for (const [id, name, warrantyDays] of [["qa-tela", "Troca de Tela",90],["qa-software","Software",30],["qa-conector","Conector de Carga",90],["qa-dados","Transferência de Dados",0]] as const) {
    await db.servico.upsert({ where: { id }, update: {}, create: { id, storeId, name, warrantyDays, price: 100, cost: 20 } });
  }
  for (const legado of [false,true]) {
    const id = legado ? "qa-garantias-legado" : "qa-garantias-multi";
    const codigo = legado ? "OS-QA-LEGADO" : "OS-QA-GARANTIAS";
    const entregueEm = "2026-10-10T12:00:00.000Z";
    const payload = comPadroesGarantiaServicosV3(osGarantiasSinteticaV3({
      id, storeId, codigo, clienteId: cliente.id, cliente: { id: cliente.id, nome: cliente.name },
      autorizacaoComercialV3: { autorizada: true, registradaEm: "2026-10-01T12:00:00.000Z", registradaPor: "Operador QA", origem: "balcao", escopo: "servicos_da_abertura", total: 0 },
      entregaSemCobrancaV3: criarAutorizacaoEntregaSemCobrancaV3({ solicitacao: { categoria: "cortesia", motivo: "Cenário exclusivamente sintético para garantia" }, storeId, autorizadoPorId: usuario.id, autorizadoPorNome: usuario.name, autorizadoEm: new Date().toISOString() }),
      ...(legado ? { operacaoStatusV3: "entregue", status: "entregue", entregueEm, entregaV3: { entregueEm, registradoEm: entregueEm, recebidoPor: cliente.name } } : {}),
    }));
    await db.ordemServico.upsert({ where: { id }, update: process.argv.includes("--reset") ? { payload: payload as unknown as Prisma.InputJsonValue, status: legado ? "Entregue" : "Pronto" } : {}, create: { id, storeId, clienteId: cliente.id, numero: codigo, equipamento: "Marca QA Aparelho sintético", defeito: "Falhas sintéticas", status: legado ? "Entregue" : "Pronto", payload: payload as unknown as Prisma.InputJsonValue } });
  }
  console.log("Prévia sintética pronta: OS-QA-GARANTIAS (90/30/90/0 dias) e OS-QA-LEGADO.");
}
main().finally(() => db.$disconnect());
