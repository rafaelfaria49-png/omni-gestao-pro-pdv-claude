"use client";

// ============================================================================
// Operações V3 — Fase 3A · Documento dedicado: TERMO DE ENTREGA (A4, cliente).
// Render puro de `TermoEntregaDocV3`. Cores fixas (documento impresso).
// `id="og-print-root"` é o alvo do CSS de impressão.
// ============================================================================

import type { TermoEntregaDocV3 as TermoEntregaDoc } from "@/lib/operacoes-v3/print-model";
import { formatData, formatDataHora } from "../../lib/format";

function Campo({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <p className="text-[12px] leading-snug text-black">
      <span className="text-zinc-500">{rotulo}: </span>
      {valor}
    </p>
  );
}

export function TermoEntregaDocV3({ doc }: { doc: TermoEntregaDoc }) {
  const { empresa, cliente, equipamento } = doc;
  const equip = [equipamento.marca, equipamento.modelo].filter(Boolean).join(" ") || equipamento.tipo;

  return (
    <div id="og-print-root" className="mx-auto w-full max-w-[794px] bg-white px-8 py-6 text-black">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="flex min-w-0 items-start gap-3">
          {empresa.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logoUrl} alt="" className="h-12 w-12 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-black">{empresa.nome}</p>
            {empresa.cnpj ? <p className="text-[11px] text-zinc-600">CNPJ: {empresa.cnpj}</p> : null}
            {empresa.endereco ? <p className="text-[11px] text-zinc-600">{empresa.endereco}</p> : null}
            <p className="text-[11px] text-zinc-600">{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Termo de Entrega</p>
          <p className="text-[16px] font-extrabold leading-none text-black">{doc.numero}</p>
          <p className="mt-1 text-[10px] text-zinc-600">Emitido: {formatDataHora(doc.impressoEm)}</p>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <section>
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Cliente</h2>
          <Campo rotulo="Nome" valor={cliente.nome} />
          <Campo rotulo="Telefone" valor={cliente.telefone} />
          <Campo rotulo="CPF / CNPJ" valor={cliente.documento} />
        </section>
        <section>
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Equipamento</h2>
          <Campo rotulo="Aparelho" valor={equip} />
          <Campo rotulo="IMEI / Série" valor={equipamento.numeroSerie} />
        </section>
      </div>

      {doc.servicoRealizado.length ? (
        <section className="mt-3">
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Serviço realizado</h2>
          <ul className="ml-4 list-disc text-[12px] text-black">
            {doc.servicoRealizado.map((sv, i) => (
              <li key={i}>{sv}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-3 break-inside-avoid">
        <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Entrega</h2>
        <Campo rotulo="Data da entrega" valor={doc.dataEntrega ? formatData(doc.dataEntrega) : undefined} />
        <Campo rotulo="Recebido por" valor={doc.recebidoPor} />
        {doc.observacao ? <Campo rotulo="Observação" valor={doc.observacao} /> : null}
      </section>

      <section className="mt-8 break-inside-avoid">
        <p className="text-[10px] text-zinc-600">
          Declaro que recebi o equipamento acima identificado, conferi seu funcionamento e estou ciente do serviço realizado e das
          condições de garantia informadas nesta Ordem de Serviço.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-10">
          <div className="text-center"><div className="border-t border-black pt-1 text-[11px] text-black">Assinatura do cliente</div></div>
          <div className="text-center"><div className="border-t border-black pt-1 text-[11px] text-black">Responsável pela entrega</div></div>
        </div>
        <p className="mt-4 text-right text-[10px] text-zinc-600">Data: ____ / ____ / ________</p>
      </section>
    </div>
  );
}
