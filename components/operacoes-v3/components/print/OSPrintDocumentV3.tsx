"use client";

// ============================================================================
// Operações V3 — Fase 1D · Documento A4 da OS (via cliente).
// ----------------------------------------------------------------------------
// Render PURO de `DocumentoOSV3`. Usa cores fixas (branco/preto/cinza) por ser
// um DOCUMENTO IMPRESSO — exceção documentada às regras de token (CORE_RULES §7).
// Nenhuma lógica de negócio aqui (vem toda de lib/operacoes-v3/print-model).
// ============================================================================

import type { DocumentoOSV3, PrintItemV3 } from "@/lib/operacoes-v3/print-model";
import { formatBRL, formatData, formatDataHora } from "../../lib/format";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 break-inside-avoid">
      <h2 className="mb-1 border-b border-zinc-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-700">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <p className="text-[12px] leading-snug text-black">
      <span className="text-zinc-500">{rotulo}: </span>
      {valor}
    </p>
  );
}

function PadraoVisual({ sequencia }: { sequencia: number[] }) {
  return (
    <div className="inline-grid grid-cols-3 gap-1.5 rounded border border-zinc-300 p-1.5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const idx = sequencia.indexOf(n);
        const on = idx >= 0;
        return (
          <span
            key={n}
            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold ${on ? "border-black bg-black text-white" : "border-zinc-300 text-transparent"}`}
          >
            {on ? idx + 1 : "·"}
          </span>
        );
      })}
    </div>
  );
}

function LinhaItem({ item }: { item: PrintItemV3 }) {
  return (
    <tr className="border-b border-zinc-200">
      <td className="px-2 py-1 text-[11px] text-zinc-600">{item.categoria}</td>
      <td className="px-2 py-1 text-[12px] text-black">
        {item.descricao}
        {item.brinde ? <span className="ml-1 rounded border border-zinc-400 px-1 text-[9px] uppercase text-zinc-600">Brinde</span> : null}
      </td>
      <td className="px-2 py-1 text-center text-[12px] text-black">{item.qtd}</td>
      <td className="px-2 py-1 text-right text-[12px] text-black">{item.brinde ? "R$ 0,00" : formatBRL(item.valorUnitario)}</td>
      <td className="px-2 py-1 text-right text-[12px] font-medium text-black">{item.brinde ? "R$ 0,00" : formatBRL(item.subtotal)}</td>
    </tr>
  );
}

/** A4 (≈ 794px @ 96dpi). `id="og-print-root"` é o alvo do CSS de impressão. */
export function OSPrintDocumentV3({ doc }: { doc: DocumentoOSV3 }) {
  const { empresa, cliente, equipamento, senha, recepcao, checklist, diagnostico, financeiro, garantia, provaEntrada } = doc;
  const temDiagnostico = !!(diagnostico.inicial || diagnostico.final || diagnostico.causa || diagnostico.solucao || doc.observacoesCliente.length);
  const interna = doc.variante === "interna";

  return (
    <div id="og-print-root" className="mx-auto w-full max-w-[794px] bg-white px-8 py-6 text-black">
      {interna ? (
        <div className="mb-2 rounded border border-black bg-zinc-100 px-3 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-black">
          Via interna — não entregar ao cliente
        </div>
      ) : null}
      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="flex min-w-0 items-start gap-3">
          {empresa.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-tight text-black">{empresa.nome}</p>
            {empresa.cnpj ? <p className="text-[11px] text-zinc-600">CNPJ: {empresa.cnpj}</p> : null}
            {empresa.endereco ? <p className="text-[11px] text-zinc-600">{empresa.endereco}</p> : null}
            {empresa.cidadeUf ? <p className="text-[11px] text-zinc-600">{empresa.cidadeUf}</p> : null}
            <p className="text-[11px] text-zinc-600">
              {[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}
            </p>
            {empresa.responsavel ? <p className="text-[11px] text-zinc-600">Responsável: {empresa.responsavel}</p> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ordem de Serviço</p>
          <p className="text-[22px] font-extrabold leading-none text-black">{doc.numero}</p>
          <p className="mt-1 inline-block rounded border border-zinc-400 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-700">{doc.statusLabel}</p>
          <p className="mt-1 text-[10px] text-zinc-600">Criada: {doc.criadoEm ? formatDataHora(doc.criadoEm) : "—"}</p>
          <p className="text-[10px] text-zinc-600">Impressa: {formatDataHora(doc.impressoEm)}</p>
        </div>
      </header>

      {!empresa.temDados ? (
        <p className="mt-1 text-[10px] italic text-zinc-500">Dados da empresa não preenchidos — complete em Configurações para o cabeçalho oficial.</p>
      ) : null}

      {/* Cliente + Recepção */}
      <div className="grid grid-cols-2 gap-4">
        <Secao titulo="Cliente">
          <Campo rotulo="Nome" valor={cliente.nome} />
          <Campo rotulo="Telefone / WhatsApp" valor={cliente.telefone} />
          <Campo rotulo="CPF / CNPJ" valor={cliente.documento} />
          <Campo rotulo="E-mail" valor={cliente.email} />
          {!cliente.nome && !cliente.telefone && !cliente.documento ? <p className="text-[11px] text-zinc-400">—</p> : null}
        </Secao>
        <Secao titulo="Recepção">
          <Campo rotulo="Entrada" valor={recepcao.dataEntrada ? formatDataHora(recepcao.dataEntrada) : undefined} />
          <Campo rotulo="Previsão de entrega" valor={recepcao.previsaoEntrega ? formatDataHora(recepcao.previsaoEntrega) : undefined} />
          <Campo rotulo="Origem" valor={recepcao.origem} />
          <Campo rotulo="Recebido por" valor={recepcao.recebidoPor} />
        </Secao>
      </div>

      {/* Equipamento */}
      <Secao titulo="Equipamento">
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <Campo rotulo="Tipo" valor={equipamento.tipo} />
            <Campo rotulo="Marca" valor={equipamento.marca} />
            <Campo rotulo="Modelo" valor={equipamento.modelo} />
            <Campo rotulo="IMEI / Série" valor={equipamento.numeroSerie} />
            <Campo rotulo="Acessórios" valor={equipamento.acessorios.length ? equipamento.acessorios.join(", ") : undefined} />
            <Campo rotulo="Condição" valor={equipamento.condicao} />
          </div>
          <div>
            {senha.temSenha ? (
              senha.isPadrao ? (
                <div>
                  <p className="text-[12px] text-zinc-500">Senha padrão:</p>
                  <PadraoVisual sequencia={senha.sequencia} />
                </div>
              ) : (
                <Campo rotulo="Senha / código" valor={senha.valor} />
              )
            ) : null}
          </div>
        </div>
        {equipamento.defeitoRelatado ? (
          <p className="mt-1 text-[12px] text-black">
            <span className="text-zinc-500">Defeito relatado: </span>
            {equipamento.defeitoRelatado}
          </p>
        ) : null}
      </Secao>

      {/* Checklist de entrada */}
      {checklist.length ? (
        <Secao titulo="Checklist de entrada">
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
            {checklist.map((c) => (
              <p key={c.label} className="text-[11px] text-black">
                <span className="text-zinc-600">{c.label}:</span> <span className={c.estado === "ruim" ? "font-bold" : c.estado === "nao_testado" ? "text-zinc-500" : ""}>{c.estadoLabel}</span>
              </p>
            ))}
          </div>
        </Secao>
      ) : null}

      {/* Prova de entrada (SPRINT_3E.1) — estado físico + acessórios + credenciais mascaradas */}
      {provaEntrada.temDados ? (
        <Secao titulo="Prova de entrada">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            {provaEntrada.estadoFisico.map((c) => (
              <p key={c.label} className="text-[11px] text-black">
                <span className="text-zinc-600">{c.label}:</span>{" "}
                <span className={c.status === "avariado" ? "font-bold" : c.status === "ausente" ? "font-bold text-zinc-700" : "text-zinc-500"}>{c.statusLabel}</span>
              </p>
            ))}
          </div>
          {provaEntrada.avarias.length ? (
            <div className="mt-1">
              <p className="text-[11px] font-medium text-zinc-700">Avarias registradas:</p>
              <ul className="ml-3 list-disc text-[11px] text-black">
                {provaEntrada.avarias.map((a, i) => (
                  <li key={i}>{a.tipo} — {a.local}{a.descricao ? ` (${a.descricao})` : ""}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-1 text-[11px] text-black">
            <span className="text-zinc-600">Acessórios recebidos: </span>
            {provaEntrada.acessorios.filter((a) => a.presente).map((a) => a.label).join(", ") || "—"}
          </p>
          {provaEntrada.credenciais.length ? (
            <p className="mt-0.5 text-[11px] text-black">
              <span className="text-zinc-600">Credenciais (registradas, mascaradas): </span>
              {provaEntrada.credenciais.map((c) => `${c.rotulo}: ${c.valor}`).join(" · ")}
            </p>
          ) : null}
          {provaEntrada.totalFotos > 0 ? <p className="mt-0.5 text-[10px] text-zinc-500">{provaEntrada.totalFotos} foto(s) de entrada arquivada(s) no sistema.</p> : null}
        </Secao>
      ) : null}

      {/* Diagnóstico + solução */}
      {temDiagnostico ? (
        <Secao titulo="Diagnóstico e solução">
          <Campo rotulo="Diagnóstico inicial" valor={diagnostico.inicial || undefined} />
          <Campo rotulo="Diagnóstico final" valor={diagnostico.final || undefined} />
          <Campo rotulo="Causa encontrada" valor={diagnostico.causa || undefined} />
          <Campo rotulo="Solução aplicada" valor={diagnostico.solucao || undefined} />
          {doc.observacoesCliente.map((o, i) => (
            <p key={i} className="text-[12px] text-black"><span className="text-zinc-500">Observação: </span>{o}</p>
          ))}
        </Secao>
      ) : null}

      {/* Itens */}
      <Secao titulo="Serviços e peças">
        {doc.itens.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-400 text-left text-[10px] uppercase tracking-wide text-zinc-600">
                <th className="px-2 py-1 font-semibold">Item</th>
                <th className="px-2 py-1 font-semibold">Descrição</th>
                <th className="px-2 py-1 text-center font-semibold">Qtd</th>
                <th className="px-2 py-1 text-right font-semibold">Valor unit.</th>
                <th className="px-2 py-1 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {doc.itens.map((it, i) => <LinhaItem key={i} item={it} />)}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] text-zinc-500">Nenhum serviço/peça lançado.</p>
        )}
      </Secao>

      {/* Resumo financeiro */}
      <Secao titulo="Resumo financeiro">
        <div className="ml-auto w-full max-w-[280px] text-[12px]">
          <div className="flex justify-between py-0.5"><span className="text-zinc-600">Subtotal</span><span>{formatBRL(financeiro.subtotal)}</span></div>
          {financeiro.desconto > 0 ? <div className="flex justify-between py-0.5"><span className="text-zinc-600">Desconto</span><span>- {formatBRL(financeiro.desconto)}</span></div> : null}
          <div className="flex justify-between border-t border-zinc-400 py-1 text-[14px] font-bold"><span>Total da OS</span><span>{formatBRL(financeiro.total)}</span></div>
          {financeiro.recebido !== undefined ? <div className="flex justify-between py-0.5"><span className="text-zinc-600">Sinal/recebido (previsto)</span><span>{formatBRL(financeiro.recebido)}</span></div> : null}
          {financeiro.saldo !== undefined ? <div className="flex justify-between py-0.5"><span className="text-zinc-600">Saldo previsto</span><span>{formatBRL(financeiro.saldo)}</span></div> : null}
        </div>
        <div className="mt-1">
          <Campo rotulo="Forma de pagamento (prevista)" valor={financeiro.formaPagamento} />
          <Campo rotulo="Vencimento previsto" valor={financeiro.vencimento ? formatData(financeiro.vencimento) : undefined} />
          <Campo rotulo="Observação" valor={financeiro.observacao} />
          <p className="mt-0.5 text-[10px] italic text-zinc-500">Valores previstos. O recebimento é confirmado no momento do pagamento.</p>
        </div>
      </Secao>

      {/* Garantia */}
      <Secao titulo="Garantia">
        <p className="text-[12px] font-semibold text-black">{garantia.titulo}{garantia.prazoDias ? ` — ${garantia.prazoDias} dias` : ""}</p>
        {garantia.semCobertura ? (
          <p className="mt-0.5 text-[11px] text-black">{garantia.observacao}</p>
        ) : (
          <>
            {garantia.cobertura.length ? (
              <div className="mt-0.5">
                <p className="text-[11px] font-medium text-zinc-700">Cobre:</p>
                <ul className="ml-3 list-disc text-[11px] text-black">{garantia.cobertura.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            ) : null}
            {garantia.exclusoes.length ? (
              <div className="mt-0.5">
                <p className="text-[11px] font-medium text-zinc-700">Não cobre:</p>
                <ul className="ml-3 list-disc text-[11px] text-black">{garantia.exclusoes.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            ) : null}
            {garantia.observacao ? <p className="mt-0.5 text-[11px] text-black">{garantia.observacao}</p> : null}
          </>
        )}
      </Secao>

      {/* Bloco INTERNO (somente via interna) */}
      {interna && doc.interno ? (
        <section className="mt-3 break-inside-avoid rounded border border-black p-2">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-black">Uso interno — confidencial</h2>
          <div className="grid grid-cols-2 gap-x-4">
            <p className="text-[12px] text-black"><span className="text-zinc-500">Custo interno: </span>{formatBRL(doc.interno.custo)}</p>
            <p className="text-[12px] text-black"><span className="text-zinc-500">Lucro estimado: </span>{formatBRL(doc.interno.lucro)}</p>
          </div>
          {doc.interno.itensInternos.length ? (
            <div className="mt-1">
              <p className="text-[11px] font-medium text-zinc-700">Itens internos:</p>
              <ul className="ml-4 list-disc text-[11px] text-black">
                {doc.interno.itensInternos.map((it, i) => <li key={i}>{it.qtd}× {it.descricao} — {formatBRL(it.custo)}</li>)}
              </ul>
            </div>
          ) : null}
          {doc.interno.observacoesInternas.length ? (
            <div className="mt-1">
              <p className="text-[11px] font-medium text-zinc-700">Observações internas:</p>
              {doc.interno.observacoesInternas.map((o, i) => <p key={i} className="text-[11px] text-black">• {o}</p>)}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Assinaturas */}
      <section className="mt-6 break-inside-avoid">
        <p className="text-[10px] text-zinc-600">
          {interna
            ? "Via interna de controle — documento de uso da assistência."
            : "Declaro que recebi o equipamento e estou ciente das condições descritas nesta Ordem de Serviço."}
        </p>
        <div className="mt-8 grid grid-cols-2 gap-10">
          <div className="text-center">
            <div className="border-t border-black pt-1 text-[11px] text-black">Assinatura do cliente</div>
          </div>
          <div className="text-center">
            <div className="border-t border-black pt-1 text-[11px] text-black">Assinatura do técnico / responsável</div>
          </div>
        </div>
        <p className="mt-4 text-right text-[10px] text-zinc-600">Data: ____ / ____ / ________</p>
      </section>
    </div>
  );
}
