"use client";

// ============================================================================
// Operações V4 Preview — GOAL OPS-V4-ORC-VIEWMODEL-DOC-023
// ----------------------------------------------------------------------------
// Render puro do documento "Orçamento (via cliente)" — A4, mesmo motor de
// impressão da V3 (`PrintPreviewV3`, `id="og-print-root"`). Consome SOMENTE a
// projeção client-safe (`OrcamentoClienteViewV4`), nunca a OS ou o orçamento
// crus. Renderiza os 3 estados: sem grupos (lista clássica), grupos sem
// seleção (cards com faixa) e seleção feita (opção escolhida em destaque).
// ============================================================================

import type { OrcamentoClienteViewV4, OrcamentoClienteVarianteV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { formatBRL, formatData } from "@/components/operacoes-v3/lib/format";

function Campo({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <p className="text-[12px] leading-snug text-black">
      <span className="text-zinc-500">{rotulo}: </span>
      {valor}
    </p>
  );
}

function VarianteCard({ variante }: { variante: OrcamentoClienteVarianteV4 }) {
  return (
    <div
      className={`rounded-md border p-2.5 ${variante.selecionada ? "border-black bg-zinc-100" : "border-zinc-300"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-black">{variante.rotulo}</p>
        {variante.badge ? (
          <span className="shrink-0 rounded-full border border-zinc-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-700">
            {variante.badge}
          </span>
        ) : null}
      </div>
      {variante.descricaoCurta ? <p className="mt-0.5 text-[11px] text-zinc-600">{variante.descricaoCurta}</p> : null}
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-zinc-600">
        {typeof variante.garantiaDias === "number" ? <span>Garantia: {variante.garantiaDias} dias</span> : null}
        {variante.prazoTexto ? <span>Prazo: {variante.prazoTexto}</span> : null}
      </div>
      <p className="mt-1.5 text-[11px] text-black">
        Valor desta opção: <span className="font-semibold">{formatBRL(variante.valorVariante)}</span>
      </p>
      <p className="text-[11.5px] font-bold text-black">Total com esta opção: {formatBRL(variante.totalComOpcao)}</p>
      {variante.selecionada ? (
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-black">✓ Opção escolhida</p>
      ) : null}
    </div>
  );
}

export function OrcamentoClienteDocV4({ doc }: { doc: OrcamentoClienteViewV4 }) {
  const { loja, cliente, aparelho, itensFixosVisiveis, grupos, totais, validade, observacoesAoCliente } = doc;
  const aparelhoLabel = [aparelho.marca, aparelho.modelo].filter(Boolean).join(" ");
  const itensCobrados = itensFixosVisiveis.filter((i) => !i.cortesia);
  const itensCortesia = itensFixosVisiveis.filter((i) => i.cortesia);

  return (
    <div id="og-print-root" className="mx-auto w-full max-w-[794px] bg-white px-8 py-6 text-black">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-black">{loja.nome}</p>
          {loja.documento ? <p className="text-[11px] text-zinc-600">CNPJ: {loja.documento}</p> : null}
          {loja.contato ? <p className="text-[11px] text-zinc-600">{loja.contato}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Orçamento</p>
          <p className="text-[16px] font-extrabold leading-none text-black">{doc.osNumero}</p>
          {doc.dataCriacao ? <p className="mt-1 text-[10px] text-zinc-600">Emitido: {formatData(doc.dataCriacao)}</p> : null}
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <section>
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Cliente</h2>
          <Campo rotulo="Nome" valor={cliente.nome} />
        </section>
        <section>
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Aparelho</h2>
          <Campo rotulo="Aparelho" valor={aparelhoLabel} />
          <Campo rotulo="Defeito relatado" valor={doc.defeitoRelatado} />
        </section>
      </div>

      {itensCobrados.length > 0 ? (
        <section className="mt-3">
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Itens</h2>
          <table className="w-full text-[12px] text-black">
            <tbody>
              {itensCobrados.map((item, i) => (
                <tr key={i} className="border-b border-zinc-200">
                  <td className="py-1">{item.descricao}</td>
                  <td className="py-1 text-center text-zinc-600">{item.quantidade}×</td>
                  <td className="py-1 text-right font-medium">{formatBRL(item.valorCliente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {itensCortesia.length > 0 ? (
        <section className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Cortesia — Grátis</p>
          <ul className="ml-4 list-disc text-[12px] text-black">
            {itensCortesia.map((item, i) => (
              <li key={i}>{item.descricao}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {grupos.map((grupo, gi) => (
        <section key={gi} className="mt-3 break-inside-avoid">
          <h2 className="mb-1.5 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">{grupo.rotulo}</h2>
          <div className="grid grid-cols-2 gap-2">
            {grupo.variantes.map((variante, vi) => (
              <VarianteCard key={vi} variante={variante} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-4 break-inside-avoid border-t-2 border-black pt-2">
        {typeof totais.exato === "number" ? (
          <p className="text-right text-[15px] font-extrabold text-black">Total: {formatBRL(totais.exato)}</p>
        ) : totais.faixa ? (
          <p className="text-right text-[15px] font-extrabold text-black">
            Total: de {formatBRL(totais.faixa.min)} a {formatBRL(totais.faixa.max)}
          </p>
        ) : null}
        {totais.faixa ? (
          <p className="text-right text-[10.5px] text-zinc-600">Valor final depende da opção escolhida em cada grupo acima.</p>
        ) : null}
      </section>

      <section className="mt-2 break-inside-avoid">
        {validade.validoAte ? (
          <p className="text-[11px] text-black">Válido até: {formatData(validade.validoAte)}</p>
        ) : validade.politicaTexto ? (
          <p className="text-[11px] text-black">{validade.politicaTexto}</p>
        ) : null}
      </section>

      {observacoesAoCliente ? (
        <section className="mt-2 break-inside-avoid">
          <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">Observações</h2>
          <p className="text-[12px] text-black">{observacoesAoCliente}</p>
        </section>
      ) : null}
    </div>
  );
}
