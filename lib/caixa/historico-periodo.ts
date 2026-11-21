/**
 * Período do Histórico de Caixa (RELATORIOS-FASE-A-001 · A5).
 *
 * Converte as datas dos campos `<input type="date">` ("AAAA-MM-DD") em instantes ISO
 * dos limites do dia **no fuso do navegador**. `new Date("AAAA-MM-DD")` seria meia-noite
 * UTC (21h do dia anterior em Brasília) — por isso a hora é sempre explícita aqui.
 *
 * Limitação conhecida: o "dia" é o do **navegador**, não o da loja. Uma loja em outro fuso
 * acessada de um navegador em outro fuso vê o dia desse navegador. A futura configuração
 * de fuso por loja (auditoria multissegmento 001, decisão R-4 / item A1) deve substituir
 * este cálculo por um helper único compartilhado com Histórico de Vendas e Financeiro.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/

export type PeriodoCaixa =
  | { ok: true; from?: string; to?: string }
  | { ok: false; motivo: "data-invalida" | "inicio-depois-do-fim" }

function local(dia: string, hora: string): Date | null {
  if (!DIA.test(dia)) return null
  const d = new Date(`${dia}T${hora}`)
  if (Number.isNaN(d.getTime())) return null
  // O V8 aceita "2026-02-31" e vira 03/03: o dia precisa existir no calendário.
  const [a, m, di] = dia.split("-").map(Number)
  return d.getFullYear() === a && d.getMonth() + 1 === m && d.getDate() === di ? d : null
}

export function periodoCaixaParaConsulta(de: string, ate: string): PeriodoCaixa {
  const ini = de.trim() ? local(de.trim(), "00:00:00.000") : undefined
  const fim = ate.trim() ? local(ate.trim(), "23:59:59.999") : undefined
  if (ini === null || fim === null) return { ok: false, motivo: "data-invalida" }
  if (ini && fim && ini.getTime() > fim.getTime()) return { ok: false, motivo: "inicio-depois-do-fim" }
  return { ok: true, ...(ini ? { from: ini.toISOString() } : {}), ...(fim ? { to: fim.toISOString() } : {}) }
}
