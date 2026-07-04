// ============================================================================
// Operações V4 — GOAL OPS-V4-ORC-ENVIO-WA-025 · mensagem + link de WhatsApp
// ----------------------------------------------------------------------------
// `montarMensagemOrcamentoV4` é PURO e recebe SOMENTE a projeção client-safe
// (`OrcamentoClienteViewV4`, GOAL 023) — nunca a OS, o orçamento ou o campo
// bruto de persistência. Zero aritmética própria: todo número exibido já vem
// calculado pela projeção (`totalComOpcao`, `totais.exato`/`faixa`,
// `valorCliente`). Mesma disciplina de exclusão do 023 — ver a lista
// verificada em orcamento-mensagem.test.ts: este arquivo nunca deveria
// precisar de dados internos de custo ou de acesso — a projeção já garante
// isso, aqui só se formata o que ela entrega.
//
// `montarLinkWaV4` normaliza o telefone SÓ EM RUNTIME (nunca na gravação —
// decisão registrada) reusando `lib/phone-br.ts` já existente.
// ============================================================================

import type { OrcamentoClienteViewV4 } from "./orcamento-cliente-view";
import { phoneDigitsAll } from "@/lib/phone-br";

function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(v) ? Math.max(0, v) : 0,
  );
}

function formatDataBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

/**
 * Monta a mensagem de orçamento em pt-BR (formatação *negrito* estilo
 * WhatsApp). Cobre os 3 estados: sem grupos (lista clássica), grupos sem
 * seleção (opções numeradas, cada uma com "Total com esta opção") e grupos
 * com seleção (a variante `selecionada` aparece marcada, mas a mensagem
 * sempre lista todas as opções — a escolha final acontece na resposta do
 * cliente, não nesta tela; seleção/aprovação são GOAL 026).
 */
export function montarMensagemOrcamentoV4(view: OrcamentoClienteViewV4): string {
  const linhas: string[] = [];
  linhas.push(`Olá! Aqui é da *${view.loja.nome}* 👋`);
  linhas.push(`Segue o orçamento para *${view.cliente.nome || "você"}*:`);
  linhas.push("");

  const aparelho = [view.aparelho.marca, view.aparelho.modelo].filter(Boolean).join(" ");
  if (aparelho) linhas.push(`📱 Aparelho: *${aparelho}*`);
  if (view.defeitoRelatado) linhas.push(`🔧 Defeito relatado: ${view.defeitoRelatado}`);
  linhas.push("");

  const itensCobrados = view.itensFixosVisiveis.filter((i) => !i.cortesia);
  const itensCortesia = view.itensFixosVisiveis.filter((i) => i.cortesia);

  if (view.grupos.length === 0) {
    if (itensCobrados.length > 0) {
      linhas.push("*Itens:*");
      for (const it of itensCobrados) linhas.push(`• ${it.descricao} — R$ ${formatBRL(it.valorCliente)}`);
      linhas.push("");
    }
    if (itensCortesia.length > 0) {
      linhas.push("🎁 *Cortesia — Grátis:*");
      for (const it of itensCortesia) linhas.push(`• ${it.descricao}`);
      linhas.push("");
    }
    if (typeof view.totais.exato === "number") {
      linhas.push(`*Total: R$ ${formatBRL(view.totais.exato)}*`);
    } else if (view.totais.faixa) {
      linhas.push(`*Total: de R$ ${formatBRL(view.totais.faixa.min)} a R$ ${formatBRL(view.totais.faixa.max)}*`);
    }
  } else {
    for (const grupo of view.grupos) {
      linhas.push(`*${grupo.rotulo}*`);
      grupo.variantes.forEach((v, i) => {
        const badge = v.badge ? ` ⭐ ${v.badge}` : "";
        const marcaSelecionada = v.selecionada ? " ✅" : "";
        linhas.push(`${i + 1}) *${v.rotulo}*${badge}${marcaSelecionada}`);
        if (v.descricaoCurta) linhas.push(`   ${v.descricaoCurta}`);
        if (typeof v.garantiaDias === "number") linhas.push(`   Garantia de ${v.garantiaDias} dias`);
        if (v.prazoTexto) linhas.push(`   Prazo: ${v.prazoTexto}`);
        linhas.push(`   Total com esta opção: R$ ${formatBRL(v.totalComOpcao)}`);
      });
      linhas.push("");
    }
    const todosItens = [...itensCobrados, ...itensCortesia];
    if (todosItens.length > 0) {
      linhas.push(`_Todas as opções incluem: ${todosItens.map((i) => i.descricao).join(", ")}._`);
      linhas.push("");
    }
    linhas.push("Responda com o *número* da opção escolhida.");
    linhas.push("");
  }

  if (view.validade.validoAte) {
    linhas.push(`⏳ Válido até ${formatDataBR(view.validade.validoAte)}`);
  } else if (view.validade.politicaTexto) {
    linhas.push(`⏳ ${view.validade.politicaTexto}`);
  }

  if (view.observacoesAoCliente) {
    linhas.push("");
    linhas.push(view.observacoesAoCliente);
  }

  return linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type LinkWaV4 = { valido: true; url: string } | { valido: false; motivo: string };

/**
 * Monta o link `wa.me` a partir de um telefone em formato livre (nunca
 * normalizado na gravação). Regras (reusando `lib/phone-br.ts`):
 *   • 10-11 dígitos (DDD + número, sem DDI) → prefixa 55.
 *   • 12-13 dígitos já iniciando em 55 → mantém como está.
 *   • qualquer outro caso → inválido, com motivo (UI oferece "Copiar" no lugar).
 */
export function montarLinkWaV4(telefoneLivre: string | undefined, mensagem: string): LinkWaV4 {
  const digitos = phoneDigitsAll(telefoneLivre ?? "");
  if (!digitos) return { valido: false, motivo: "Cliente sem telefone cadastrado." };

  let digitosComDDI: string | null = null;
  if (digitos.length === 10 || digitos.length === 11) {
    digitosComDDI = `55${digitos}`;
  } else if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    digitosComDDI = digitos;
  }

  if (!digitosComDDI) {
    return { valido: false, motivo: "Telefone inválido para WhatsApp." };
  }
  return { valido: true, url: `https://wa.me/${digitosComDDI}?text=${encodeURIComponent(mensagem)}` };
}
