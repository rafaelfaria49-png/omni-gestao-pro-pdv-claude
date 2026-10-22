/**
 * Operações V4 — Novo orçamento (GOAL OPS-V4-NOVO-ATENDIMENTO-COMERCIAL-001).
 * Continua no motor `criarOrcamentoRapidoV3`. Depois carimba pré-OS no payload.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { C, fmt } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { criarOrcamentoRapidoV3 } from "@/lib/operacoes-v3/orcamento-rapido-actions";
import { prepararCompartilhamentoOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-envio-actions";
import { marcarOrcamentoPreOsV3, type MarcarPreOsInputV3 } from "@/lib/operacoes-v3/comercial-pre-os-actions";
import { MAX_LINHAS_POR_GRUPO_V3 } from "@/lib/operacoes-v3/orcamento-model";
import {
  adicionarItemFixoV4,
  adicionarVarianteV4,
  buildOrcamentoRapidoInputFromFormV4,
  cortesiaTelaIncluidaV4,
  definirCortesiaTelaV4,
  orcamentoRapidoFormVazioV4,
  previaResultadosAlternativasV4,
  previaTotaisOrcamentoRapidoV4,
  removerItemFixoV4,
  removerVarianteV4,
  validarOrcamentoRapidoFormV4,
  type OrcamentoRapidoFormV4,
} from "@/lib/operacoes-v4/orcamento-rapido-form";

import {
  alterarDataPropostaV3,
  resolverDatasOrcamentoFormV3,
  type CamposDatasOrcamentoV3,
} from "@/lib/operacoes-v3/orcamento-rapido-model";
import { diasEntreCivisV3, hojeNaLojaV3, validadeVencidaV3 } from "@/lib/operacoes-v3/datas-operacionais-model";
import { DataOperacionalCampoV3 } from "@/components/operacoes-v3/components/DataOperacionalCampoV3";
import { AtendimentoModalShell } from "./atendimento/AtendimentoModalShell";
import { AtendimentoAccordionSection } from "./atendimento/AtendimentoAccordionSection";
import { ClienteAtendimentoSection } from "./atendimento/ClienteAtendimentoSection";
import { AparelhoAtendimentoSection } from "./atendimento/AparelhoAtendimentoSection";
import { CommercialOptionEditor } from "./atendimento/CommercialOptionEditor";
import { ServicoCatalogLookup } from "./atendimento/ServicoCatalogLookup";
import {
  atendBlocoDatas,
  atendBlocoDatasTitulo,
  atendDataCampo,
  atendGradeDatas,
  atendInput,
  atendLabel,
} from "./atendimento/field-styles";

export function OrcamentoRapidoModal({ v }: { v: V4Vals }) {
  if (!v.orcamentoRapidoOpen) return null;
  return <OrcamentoRapidoModalSession v={v} />;
}

function OrcamentoRapidoModalSession({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  const sid = (lojaAtivaId ?? "").trim();
  const [lojaInicial] = useState(sid);
  // Trocar de loja descarta o formulário e o opt-in. Prefill de outra loja não é reutilizado.
  return <OrcamentoRapidoModalContent key={sid} v={v} sid={sid} initialValues={sid === lojaInicial ? v.orcamentoRapidoInitialValues : undefined} />;
}

function OrcamentoRapidoModalContent({ v, sid, initialValues }: { v: V4Vals; sid: string; initialValues?: OrcamentoRapidoFormV4 | null }) {
  const [form, setForm] = useState<OrcamentoRapidoFormV4>(() => initialValues ?? orcamentoRapidoFormVazioV4());
  const [precificacaoTela, setPrecificacaoTela] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emCurso = useRef(false);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const criado = useRef<{ osId: string; carimbo: MarcarPreOsInputV3 } | null>(null);
  const [criacaoParcial, setCriacaoParcial] = useState<{ preparar: boolean } | null>(null);
  const [abertos, setAbertos] = useState({ cliente: true, aparelho: true, diagnostico: false, proposta: true, condicoes: false });
  const [errosDatas, setErrosDatas] = useState<Record<string, string>>({});
  const refsDatas = {
    dataProposta: useRef<HTMLInputElement>(null),
    validoAte: useRef<HTMLInputElement>(null),
    dataEntrada: useRef<HTMLInputElement>(null),
  };
  const setDatas = (fn: (d: CamposDatasOrcamentoV3) => CamposDatasOrcamentoV3) => {
    setForm((f) => ({ ...f, datas: fn(f.datas) }));
    setErrosDatas({});
  };

  const invalido = validarOrcamentoRapidoFormV4(form);
  const podeSalvar = !!sid && !invalido && !busy;
  const totais = previaTotaisOrcamentoRapidoV4(form);
  const resultados = previaResultadosAlternativasV4(form);
  const hoje = hojeNaLojaV3();
  const diasProposta = form.datas.dataProposta.dia && form.datas.dataProposta.dia < hoje ? diasEntreCivisV3(form.datas.dataProposta.dia, hoje) : 0;
  const vencida = validadeVencidaV3(form.datas.validoAteDia);

  const persistir = async (preparar: boolean) => {
    if (emCurso.current) return;
    setErro(null);
    if (!sid) {
      setErro("Selecione uma loja ativa para criar o orçamento.");
      return;
    }
    // Datas primeiro (mesma regra do servidor), com foco no campo do problema.
    const datas = resolverDatasOrcamentoFormV3(form.datas);
    if (datas.erros.length > 0 || !datas.datas) {
      setErrosDatas(Object.fromEntries(datas.erros.map((e) => [e.campo, e.mensagem])));
      const alvo = refsDatas[datas.erros[0]?.campo as keyof typeof refsDatas];
      requestAnimationFrame(() => alvo?.current?.focus());
      setErro("Revise as datas do orçamento.");
      return;
    }
    const invalidoAgora = validarOrcamentoRapidoFormV4(form);
    if (invalidoAgora) {
      setErro(invalidoAgora);
      return;
    }
    const validadeDias = Math.max(0, diasEntreCivisV3(form.datas.dataProposta.dia, form.datas.validoAteDia));
    emCurso.current = true;
    setBusy(true);
    try {
      const carimbo: MarcarPreOsInputV3 = {
        origemAtendimento: form.origemAtendimento,
        validadeDias,
        prazoEstimado: form.prazoEstimado,
        observacaoCliente: form.observacaoCliente,
        observacaoInterna: form.observacaoInterna,
        diagnosticoInicial: {
          causaProvavel: form.causaProvavel || undefined,
          solucaoSugerida: form.solucaoSugerida || undefined,
          observacaoTecnica: form.observacaoTecnica || undefined,
        },
        aparelho: { tipo: form.equipamentoTipo, imei: form.aparelhoImei, cor: form.aparelhoCor },
        statusComercial: "rascunho",
      };
      if (!criado.current) {
        const resultado = await criarOrcamentoRapidoV3(sid, buildOrcamentoRapidoInputFromFormV4(form, datas.datas));
        criado.current = { osId: resultado.osId, carimbo };
        setCriacaoParcial({ preparar });
      }
      await marcarOrcamentoPreOsV3(sid, criado.current.osId, criado.current.carimbo);
      if (preparar) await prepararCompartilhamentoOrcamentoV3(sid, criado.current.osId, form.origemAtendimento === "whatsapp" ? "whatsapp" : "impresso");
      if (montado.current) v.onOrcamentoRapidoCriado(criado.current.osId);
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : "Não foi possível concluir o orçamento.";
      setErro(criado.current ? `Orçamento já criado em rascunho. Conclua o registro; para editar a proposta, abra depois a aba Orçamento. ${detalhe}` : detalhe);
      const novamente = resolverDatasOrcamentoFormV3(form.datas);
      if (novamente.erros.length > 0) setErrosDatas(Object.fromEntries(novamente.erros.map((x) => [x.campo, x.mensagem])));
    } finally {
      emCurso.current = false;
      setBusy(false);
    }
  };

  const clienteState = {
    modo: form.clienteModo,
    existente: form.clienteExistente,
    novo: { nome: form.clienteNovoNome, telefone: form.clienteNovoTelefone, documento: form.clienteNovoDocumento, email: form.clienteNovoEmail },
  };

  const faixa = totais.faixa;

  return (
    <AtendimentoModalShell
      titulo="Novo orçamento"
      subtitulo="Monte uma proposta profissional e envie ao cliente antes da abertura definitiva da OS."
      onClose={v.closeOrcamentoRapido}
      busy={busy}
      erro={erro}
      footer={
        <>
          <span style={{ fontSize: 12, color: C.subtle, minWidth: 0 }}>
            {faixa ? (
              <>Preço mínimo {fmt(faixa.min)} · máximo {fmt(faixa.max)}</>
            ) : (
              <>Total {fmt(totais.total)}</>
            )}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={v.closeOrcamentoRapido} disabled={busy} style={btnGhost}>Cancelar</button>
            <button type="button" onClick={() => void persistir(false)} hidden={!!criacaoParcial} disabled={!podeSalvar || !!criacaoParcial} style={btnGhost}>Salvar rascunho</button>
            <button type="button" onClick={() => void persistir(false)} hidden={!!criacaoParcial} disabled={!podeSalvar || !!criacaoParcial} style={btnGhost}>Criar sem enviar</button>
            <button type="button" onClick={() => void persistir(criacaoParcial?.preparar ?? true)} disabled={!podeSalvar} style={btnPrimary}>
              {busy ? "Salvando…" : criacaoParcial ? "Concluir orçamento já criado" : "Criar e preparar compartilhamento"}
            </button>
          </div>
        </>
      }
    >
      <fieldset disabled={busy || !!criacaoParcial} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section aria-labelledby="orc-datas-titulo" style={atendBlocoDatas}>
        <h3 id="orc-datas-titulo" style={atendBlocoDatasTitulo}>Datas e prazos</h3>
        <div style={atendGradeDatas}>
          <DataOperacionalCampoV3
            ref={refsDatas.dataProposta}
            id="orc-data"
            rotulo="Data do orçamento"
            ajuda="Quando a proposta foi feita. Hoje por padrão."
            obrigatorio
            permitirHora={false}
            maxDia={hoje}
            valor={form.datas.dataProposta}
            onChange={(c) => setDatas((d) => alterarDataPropostaV3(d, c))}
            erro={errosDatas.dataProposta || null}
            aviso={diasProposta > 0 ? `Proposta de ${diasProposta} ${diasProposta === 1 ? "dia" : "dias"} atrás. O cadastro continua com a data de hoje.` : null}
            estilos={atendDataCampo}
          />
          <DataOperacionalCampoV3
            ref={refsDatas.validoAte}
            id="orc-validade"
            rotulo="Válido até"
            ajuda="Último dia de validade da proposta."
            obrigatorio
            permitirHora={false}
            minDia={form.datas.dataProposta.dia || undefined}
            valor={{ dia: form.datas.validoAteDia, hora: "", horaAutomatica: false }}
            onChange={(c) => setDatas((d) => ({ ...d, validoAteDia: c.dia, validadeEditada: true }))}
            erro={errosDatas.validoAte || null}
            aviso={vencida ? "Proposta já vencida: fica registrada assim, sem prorrogação." : null}
            estilos={atendDataCampo}
          />
          <div style={{ minWidth: 0 }}>
            <label htmlFor="orc-tempo-estimado" style={{ ...atendLabel, display: "block" }}>Tempo estimado após aprovação</label>
            <input
              id="orc-tempo-estimado"
              value={form.prazoEstimado}
              onChange={(e) => setForm((f) => ({ ...f, prazoEstimado: e.target.value }))}
              placeholder="2 horas após aprovação"
              aria-describedby="orc-tempo-estimado-ajuda"
              style={atendInput}
              autoComplete="off"
            />
            <p id="orc-tempo-estimado-ajuda" style={atendDataCampo.ajuda}>Duração do serviço depois do sim do cliente. Não é data de entrega.</p>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 11, fontSize: 12.5, color: C.body, lineHeight: 1.4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.datas.aparelhoNaLoja}
            onChange={(e) => setDatas((d) => ({ ...d, aparelhoNaLoja: e.target.checked }))}
          />
          <span>
            <strong style={{ fontWeight: 600 }}>Aparelho já está na loja</strong>
            <span style={{ display: "block", fontSize: 11, color: C.subtle }}>Marque só se o aparelho ficou aqui. Não aprova, não abre OS e não cobra nada.</span>
          </span>
        </label>
        {form.datas.aparelhoNaLoja ? (
          <div style={{ marginTop: 10, maxWidth: 420 }}>
            <DataOperacionalCampoV3
              ref={refsDatas.dataEntrada}
              id="orc-entrada"
              rotulo="Data de entrada do aparelho"
              ajuda="Quando o aparelho realmente entrou na loja."
              obrigatorio
              maxDia={hoje}
              valor={form.datas.dataEntrada}
              onChange={(c) => setDatas((d) => ({ ...d, dataEntrada: c }))}
              erro={errosDatas.dataEntrada || null}
              estilos={atendDataCampo}
            />
          </div>
        ) : null}
      </section>

      <AtendimentoAccordionSection titulo="Cliente" aberto={abertos.cliente} onToggle={() => setAbertos((a) => ({ ...a, cliente: !a.cliente }))} resumo={form.clienteExistente?.nome || form.clienteNovoNome || undefined}>
        <ClienteAtendimentoSection
          storeId={sid || null}
          value={clienteState}
          origem={form.origemAtendimento}
          onOrigemChange={(o) => setForm((f) => ({ ...f, origemAtendimento: o }))}
          onChange={(c) =>
            setForm((f) => ({
              ...f,
              clienteModo: c.modo === "balcao" ? "existente" : c.modo,
              clienteExistente: c.existente,
              clienteNovoNome: c.novo.nome,
              clienteNovoTelefone: c.novo.telefone,
              clienteNovoDocumento: c.novo.documento,
              clienteNovoEmail: c.novo.email,
            }))
          }
        />
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Aparelho" aberto={abertos.aparelho} onToggle={() => setAbertos((a) => ({ ...a, aparelho: !a.aparelho }))} resumo={[form.aparelhoMarca, form.aparelhoModelo].filter(Boolean).join(" ") || undefined}>
        <AparelhoAtendimentoSection
          value={{
            tipo: form.equipamentoTipo,
            marca: form.aparelhoMarca,
            modelo: form.aparelhoModelo,
            imei: form.aparelhoImei,
            cor: form.aparelhoCor,
            defeitoRelatado: form.defeitoRelatado,
          }}
          onChange={(a) =>
            setForm((f) => ({
              ...f,
              equipamentoTipo: a.tipo,
              aparelhoMarca: a.marca,
              aparelhoModelo: a.modelo,
              aparelhoImei: a.imei,
              aparelhoCor: a.cor,
              defeitoRelatado: a.defeitoRelatado,
            }))
          }
        />
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Diagnóstico inicial" aberto={abertos.diagnostico} onToggle={() => setAbertos((a) => ({ ...a, diagnostico: !a.diagnostico }))} resumo="Opcional numa consulta de preço">
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={atendLabel}>Causa provável</div>
            <input value={form.causaProvavel} onChange={(e) => setForm((f) => ({ ...f, causaProvavel: e.target.value }))} placeholder="Display danificado após queda." style={atendInput} autoComplete="off" />
          </div>
          <div>
            <div style={atendLabel}>Solução sugerida</div>
            <input value={form.solucaoSugerida} onChange={(e) => setForm((f) => ({ ...f, solucaoSugerida: e.target.value }))} placeholder="Substituição completa do conjunto frontal." style={atendInput} autoComplete="off" />
          </div>
          <div>
            <div style={atendLabel}>Observação técnica inicial</div>
            <textarea value={form.observacaoTecnica} onChange={(e) => setForm((f) => ({ ...f, observacaoTecnica: e.target.value }))} style={area} autoComplete="off" />
          </div>
        </div>
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Proposta comercial" aberto={abertos.proposta} onToggle={() => setAbertos((a) => ({ ...a, proposta: !a.proposta }))}>
        <ServicoCatalogLookup
          storeId={sid || null}
          onSelect={(s) =>
            setForm((f) => ({
              ...f,
              itensFixos: [...f.itensFixos, { id: `fix_${Date.now()}`, descricao: s.nome, valor: s.preco, custoV3: s.custo, cortesia: false, quantidade: 1 }],
            }))
          }
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: ".04em", textTransform: "uppercase" }}>Itens fixos</div>
          <button type="button" onClick={() => setForm((f) => adicionarItemFixoV4(f))} style={chipBtn}>+ item</button>
        </div>
        {form.itensFixos.map((it) => (
          <div key={it.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,0.7fr) minmax(0,0.7fr) auto auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input value={it.descricao} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, descricao: e.target.value } : x)) }))} placeholder="Mão de obra" style={atendInput} maxLength={120} />
            <input type="number" min={0} step="0.01" value={it.valor || ""} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, valor: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="Venda" style={atendInput} disabled={it.cortesia} />
            <input type="number" min={0} step="0.01" value={it.custoV3 || ""} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, custoV3: Math.max(0, Number(e.target.value) || 0) } : x)) }))} placeholder="Custo" title="Custo interno — não aparece para o cliente." style={{ ...atendInput, background: C.muted100, color: C.subtle }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={it.cortesia} onChange={(e) => setForm((f) => ({ ...f, itensFixos: f.itensFixos.map((x) => (x.id === it.id ? { ...x, cortesia: e.target.checked, valor: e.target.checked ? 0 : x.valor } : x)) }))} />
              Cortesia
            </label>
            <button type="button" onClick={() => setForm((f) => removerItemFixoV4(f, it.id))} style={{ border: "none", background: "transparent", color: C.dangerFg, cursor: "pointer" }}>×</button>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: ".04em", textTransform: "uppercase" }}>{form.variantes.length > 1 ? "Grupo de escolha" : "Serviço único"}</div>
          <button type="button" onClick={() => setForm((f) => adicionarVarianteV4(f))} disabled={form.variantes.length >= MAX_LINHAS_POR_GRUPO_V3} style={chipBtn}>
            + opção ({form.variantes.length}/{MAX_LINHAS_POR_GRUPO_V3})
          </button>
        </div>
        {form.variantes.length > 1 && <div style={{ marginBottom: 8 }}>
          <div style={atendLabel}>Rótulo do grupo *</div>
          <input value={form.grupoRotulo} onChange={(e) => setForm((f) => ({ ...f, grupoRotulo: e.target.value }))} placeholder="ESCOLHA A TELA" style={atendInput} autoComplete="off" />
        </div>}
        <div style={{ minWidth: 0, padding: 12, marginBottom: 10, border: `1px solid ${C.line2}`, borderRadius: 8, fontSize: 12, color: C.body }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, cursor: "pointer" }}>
            <input type="checkbox" checked={precificacaoTela} disabled={busy || !sid} onChange={(e) => setPrecificacaoTela(e.target.checked)} aria-describedby="orc-regra-tela-ajuda" />
            <span style={{ minWidth: 0 }}>Usar sugestão de preço para troca de tela neste orçamento</span>
          </label>
          <p id="orc-regra-tela-ajuda" style={{ margin: "6px 0 0", fontSize: 11, color: C.subtle, lineHeight: 1.5 }}>
            Ativação opcional, apenas nesta proposta. Não salva uma configuração da loja. Revise a regra antes de usar.
          </p>
          {precificacaoTela ? (
            <>
              <p style={{ margin: "8px 0", fontSize: 11, lineHeight: 1.5 }}>
                Até R$ 200: custo + R$ 200; até R$ 700: custo × 2; até R$ 1.000: custo + R$ 700; acima: custo × 1,70. Mão de obra já incluída. Sem reserva automática de garantia.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, minWidth: 0 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <input type="checkbox" checked={cortesiaTelaIncluidaV4(form, "capinha")} disabled={busy} onChange={(e) => setForm((f) => definirCortesiaTelaV4(f, "capinha", e.target.checked))} />
                  Capinha de cortesia (custo de referência R$ 3,50)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <input type="checkbox" checked={cortesiaTelaIncluidaV4(form, "pelicula")} disabled={busy} onChange={(e) => setForm((f) => definirCortesiaTelaV4(f, "pelicula", e.target.checked))} />
                  Película de cortesia (custo de referência R$ 1,50)
                </label>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: C.subtle, lineHeight: 1.5 }}>
                Cortesias: R$ 0,00 ao cliente, uma unidade de cada no orçamento. Os custos podem ser revisados nos itens fixos.
              </p>
            </>
          ) : null}
        </div>
        {form.variantes.map((variante, i) => (
          <CommercialOptionEditor
            key={variante.id}
            index={i}
            value={variante}
            precificacaoTelaHabilitada={precificacaoTela}
            resultadoBrutoCentavos={resultados[i].resultadoBrutoCentavos}
            motivoResultado={resultados[i].motivo}
            disabled={busy}
            canRemove={form.variantes.length > 1}
            onRemove={() => setForm((f) => removerVarianteV4(f, variante.id))}
            onChange={(next) => setForm((f) => ({ ...f, variantes: f.variantes.map((x) => (x.id === variante.id ? next : x)) }))}
          />
        ))}
        <p style={{ minWidth: 0, margin: "8px 0 0", color: C.subtle, fontSize: 11, lineHeight: 1.5 }}>
          Cada resultado bruto é uma prévia interna da alternativa, incluindo os itens fixos uma só vez. Depende da escolha do cliente e da operação real. Tributos não parametrizados e taxas de pagamento sem dados reais não foram deduzidos. Não é lucro líquido.
        </p>
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Condições" aberto={abertos.condicoes} onToggle={() => setAbertos((a) => ({ ...a, condicoes: !a.condicoes }))}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
          <div>
            <div style={atendLabel}>Observação para o cliente</div>
            <textarea value={form.observacaoCliente} onChange={(e) => setForm((f) => ({ ...f, observacaoCliente: e.target.value }))} style={area} autoComplete="off" />
          </div>
          <div>
            <div style={atendLabel}>Observação interna</div>
            <textarea value={form.observacaoInterna} onChange={(e) => setForm((f) => ({ ...f, observacaoInterna: e.target.value }))} style={{ ...area, background: C.muted100 }} autoComplete="off" />
          </div>
        </div>
      </AtendimentoAccordionSection>
      </fieldset>
    </AtendimentoModalShell>
  );
}

const area: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  padding: "8px 11px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.body,
  resize: "vertical",
  fontFamily: "inherit",
  background: C.surface,
};

const btnGhost: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const chipBtn: React.CSSProperties = {
  height: 24,
  padding: "0 10px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
