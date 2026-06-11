/**
 * atendimento-rapido-orfas.mjs
 *
 * Diagnóstico + limpeza SEGURA das OS órfãs do Atendimento Rápido — criadas por
 * testes em que o recebimento falhava (bug "Esta OS não tem valor a cobrar.").
 *
 * Uma OS é considerada ÓRFÃ somente se TODAS as condições baterem:
 *   1. é um serviço rápido — `defeito` começa com "Atendimento rápido:" (assinatura
 *      gravada na CRIAÇÃO da OS) e/ou tem a tag `payload.atendimentoRapidoV3`. OBS: as
 *      órfãs do bug NÃO têm a tag (ela só era escrita na conclusão, que nunca rodava);
 *      por isso a detecção primária é pelo `defeito`;
 *   2. status V3 ainda em aberto (NÃO "entregue" nem "cancelada");
 *   3. SEM pagamento (`payload.pagamentoV3.recebido` ausente ou ≤ 0);
 *   4. SEM `caixaOperacao` de recebimento vinculado (defesa extra).
 * → são exatamente as criadas e abandonadas pelo fluxo falho; nunca uma OS real
 *   concluída/paga, nem uma OS comum (cujo `defeito` não começa com "Atendimento rápido:").
 *
 * Limpeza = CANCELAMENTO LÓGICO (`payload.operacaoStatusV3 = "cancelada"` + timeline).
 * NUNCA delete físico. NUNCA toca OS sem a tag, paga ou já entregue.
 *
 * Uso:
 *   node --env-file=.env scripts/atendimento-rapido-orfas.mjs                 → diagnóstico (read-only)
 *   node --env-file=.env scripts/atendimento-rapido-orfas.mjs --store=loja-2  → filtra por loja
 *   node --env-file=.env scripts/atendimento-rapido-orfas.mjs --cancel        → cancela lógico as órfãs
 */

import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const DO_CANCEL = argv.includes("--cancel");
const storeArg = (argv.find((a) => a.startsWith("--store=")) || "").split("=")[1] || null;

const STATUS_FINAIS = new Set(["entregue", "cancelada"]);
const asObj = (v) => (v && typeof v === "object" ? v : null);

function statusV3(payload) {
  const s = payload?.operacaoStatusV3;
  if (typeof s === "string") return s;
  const s2 = payload?.status;
  return typeof s2 === "string" ? s2 : "aberta";
}
function recebido(payload) {
  const p = asObj(payload?.pagamentoV3);
  const r = p ? Number(p.recebido) : 0;
  return Number.isFinite(r) ? r : 0;
}

async function main() {
  console.log(`\n=== Atendimento Rápido — OS órfãs ===`);
  console.log(`Modo: ${DO_CANCEL ? "CANCELAR (lógico)" : "DIAGNÓSTICO (read-only)"}${storeArg ? ` · loja=${storeArg}` : " · todas as lojas"}\n`);

  const ASSINATURA = "Atendimento rápido:";
  const where = {
    ...(storeArg ? { storeId: storeArg } : {}),
    defeito: { startsWith: ASSINATURA },
  };
  const rows = await prisma.ordemServico.findMany({
    where,
    select: { id: true, numero: true, storeId: true, valorTotal: true, createdAt: true, defeito: true, payload: true },
    orderBy: { createdAt: "desc" },
  });

  // Defesa extra: nunca cancelar OS que TEVE recebimento no caixa.
  const caixaOps = await prisma.caixaOperacao.findMany({
    where: { ...(storeArg ? { storeId: storeArg } : {}), tipo: "recebimento_cr" },
    select: { payload: true },
  });
  const osComRecebimento = new Set();
  for (const op of caixaOps) {
    const id = asObj(op.payload)?.ordemServicoId;
    if (typeof id === "string") osComRecebimento.add(id);
  }

  const candidatas = [];
  for (const os of rows) {
    const payload = asObj(os.payload) ?? {};
    // assinatura de serviço rápido: defeito (coluna) e/ou tag de conclusão.
    const ehRapido =
      String(os.defeito ?? "").startsWith(ASSINATURA) || !!asObj(payload.atendimentoRapidoV3);
    if (!ehRapido) continue;
    const st = statusV3(payload);
    if (STATUS_FINAIS.has(st)) continue; // já entregue/cancelada
    if (recebido(payload) > 0) continue; // teve pagamento
    if (osComRecebimento.has(os.id)) continue; // teve caixaOperacao
    candidatas.push({ os, payload, st });
  }

  if (candidatas.length === 0) {
    console.log("Nenhuma OS órfã encontrada. ✅");
    return;
  }

  console.log(`Encontradas ${candidatas.length} OS órfã(s):\n`);
  let soma = 0;
  for (const c of candidatas) {
    const cli = asObj(c.payload.cliente)?.nome ?? "—";
    soma += Number(c.os.valorTotal) || 0;
    console.log(
      `- ${c.os.numero ?? c.os.id} · loja=${c.os.storeId} · R$ ${(Number(c.os.valorTotal) || 0).toFixed(2)} · ` +
        `${new Date(c.os.createdAt).toLocaleString("pt-BR")} · cliente="${cli}" · statusV3=${c.st} · ` +
        `motivo: serviço rápido (defeito "Atendimento rápido:") · sem pagamento · sem caixaOperacao · não entregue`,
    );
  }
  console.log(`\nTotal (valorTotal somado): R$ ${soma.toFixed(2)}`);

  if (!DO_CANCEL) {
    console.log(`\n(read-only) Para cancelar logicamente, re-rode com --cancel.`);
    return;
  }

  console.log(`\nCancelando logicamente ${candidatas.length} OS...`);
  let ok = 0;
  for (const c of candidatas) {
    const payload = c.payload;
    const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
    const nowIso = new Date().toISOString();
    const evento = {
      id: `ev_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      tipo: "mudanca_status",
      autor: "Script de limpeza",
      autorTipo: "usuario",
      conteudo: "OS órfã de Atendimento Rápido (recebimento nunca concluído) — cancelada logicamente pela limpeza.",
      metadata: { para: "cancelada", atendimentoRapido: true, limpezaOrfa: true },
      criadoEm: nowIso,
    };
    const prev = asObj(payload.atendimentoRapidoV3) ?? {};
    const next = {
      ...payload,
      operacaoStatusV3: "cancelada",
      status: "cancelada",
      atendimentoRapidoV3: { ...prev, canceladoOrfa: true, canceladoOrfaEm: nowIso },
      timeline: [...timeline, evento],
      atualizadoEm: nowIso,
    };
    await prisma.ordemServico.update({ where: { id: c.os.id }, data: { payload: next } });
    ok += 1;
    console.log(`  [OK] ${c.os.numero ?? c.os.id} cancelada.`);
  }
  console.log(`\nConcluído: ${ok}/${candidatas.length} canceladas logicamente. (Sem delete físico.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
