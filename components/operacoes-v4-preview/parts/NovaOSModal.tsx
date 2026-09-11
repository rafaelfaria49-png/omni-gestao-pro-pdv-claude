/**
 * Operações V4 — Nova OS (GOAL OPS-V4-NOVO-ATENDIMENTO-COMERCIAL-001).
 * Continua em `criarOSEnterpriseV3`. Serviço autorizado materializa valor.
 */
"use client";

import { useRef, useState } from "react";
import { C } from "../tokens";
import type { V4Vals } from "../use-v4-preview";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { criarOSEnterpriseV3 } from "@/lib/operacoes-v3/nova-os-actions";
import { validarNovaOSDraftV3 } from "@/lib/operacoes-v3/nova-os-model";
import {
  buildNovaOSDraftFromFormV4,
  type TipoEntradaOSV4,
} from "@/lib/operacoes-v4/nova-os-draft-from-form";
import {
  atualizarLinhaServicoV4,
  erroLinhaServicoV4,
  linhaServicoDoCatalogoV4,
  novaLinhaServicoV4,
  paraServicosAutorizadosV4,
  removerLinhaServicoV4,
  totaisServicosV4,
  type ServicoLinhaFormV4,
} from "@/lib/operacoes-v4/servicos-autorizados-form";
import type { ServicoCatalogoV4 } from "../use-servicos-v4";
import {
  clienteAtendimentoVazioV4,
  aparelhoAtendimentoVazioV4,
  origemComercialParaV3,
  type ClienteAtendimentoStateV4,
  type AparelhoAtendimentoV4,
  type OrigemAtendimentoComercialV4,
} from "@/lib/operacoes-v4/atendimento-comercial";
import { AtendimentoModalShell } from "./atendimento/AtendimentoModalShell";
import { AtendimentoAccordionSection } from "./atendimento/AtendimentoAccordionSection";
import { ClienteAtendimentoSection } from "./atendimento/ClienteAtendimentoSection";
import { AparelhoAtendimentoSection } from "./atendimento/AparelhoAtendimentoSection";
import { ServicoCatalogLookup } from "./atendimento/ServicoCatalogLookup";
import { atendInput, atendLabel } from "./atendimento/field-styles";

const TIPOS: Array<{ key: TipoEntradaOSV4; titulo: string; texto: string }> = [
  { key: "servico_autorizado", titulo: "Serviço já autorizado", texto: "Cliente já aprovou o serviço e o valor." },
  { key: "precisa_diagnostico", titulo: "Precisa de diagnóstico", texto: "Aparelho entra para avaliação." },
  { key: "retorno_garantia", titulo: "Retorno / garantia", texto: "Não é uma venda nova." },
];

export function NovaOSModal({ v }: { v: V4Vals }) {
  if (!v.novaOSOpen) return null;
  return <NovaOSModalContent v={v} />;
}

function NovaOSModalContent({ v }: { v: V4Vals }) {
  const { lojaAtivaId } = useLojaAtiva();
  const [tipo, setTipo] = useState<TipoEntradaOSV4>("servico_autorizado");
  const [cliente, setCliente] = useState<ClienteAtendimentoStateV4>(() => clienteAtendimentoVazioV4("existente"));
  const [origem, setOrigem] = useState<OrigemAtendimentoComercialV4>("balcao");
  const [aparelho, setAparelho] = useState<AparelhoAtendimentoV4>(() => aparelhoAtendimentoVazioV4());
  // Multi-serviço (GOAL OPS-V4-MULTI-SERVICOS-UI-003): linhas da mesma OS.
  // Começa com 1 editor aberto — equivalente ao formulário singular anterior.
  const [servicos, setServicos] = useState<ServicoLinhaFormV4[]>(() => [novaLinhaServicoV4("linha-1")]);
  const seqRef = useRef(1);
  const novaChave = () => {
    seqRef.current += 1;
    return `linha-${seqRef.current}`;
  };
  const [recebidoPor, setRecebidoPor] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [localFisico, setLocalFisico] = useState<"balcao" | "bancada" | "aguardando_diagnostico">("balcao");
  const [previsao, setPrevisao] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState({ cliente: true, aparelho: true, comercial: true, recepcao: false, prova: false });

  /** Remove uma linha; se era a última, abre um editor vazio (validação segue no submit). */
  const removerLinha = (key: string) => {
    setServicos((prev) => {
      const resto = removerLinhaServicoV4(prev, key);
      if (resto.length > 0) return resto;
      seqRef.current += 1;
      return [novaLinhaServicoV4(`linha-${seqRef.current}`)];
    });
  };

  /** Confirma editores válidos e abre um novo editor (sem apagar as linhas). */
  const adicionarServico = () => {
    const chave = novaChave();
    setServicos((prev) => [
      ...prev.map((l) => {
        if (l.confirmada) return l;
        const erro = erroLinhaServicoV4(l);
        return erro ? { ...l, erro } : { ...l, confirmada: true, erro: null };
      }),
      novaLinhaServicoV4(chave),
    ]);
  };

  const handleCriar = async () => {
    setErro(null);
    const sid = (lojaAtivaId ?? "").trim();
    if (!sid) {
      setErro("Selecione uma loja ativa para abrir a OS.");
      return;
    }
    if (tipo === "servico_autorizado" && paraServicosAutorizadosV4(servicos).length === 0) {
      setErro("Informe ao menos um serviço com descrição e valor de venda.");
      return;
    }
    const draft = buildNovaOSDraftFromFormV4({
      clienteExistente: cliente.modo === "existente" ? cliente.existente : null,
      clienteNovo: cliente.novo,
      equipamentoTipo: aparelho.tipo,
      marca: aparelho.marca,
      modelo: aparelho.modelo,
      imei: aparelho.imei,
      cor: aparelho.cor,
      defeitoRelatado: aparelho.defeitoRelatado,
      recebidoPor,
      origem: tipo === "retorno_garantia" ? "garantia" : origemComercialParaV3(origem),
      tipoEntrada: tipo,
      prioridade,
      localFisico,
      previsaoEntrega: previsao || undefined,
      // Somente linhas válidas viram contrato (item fantasma vazio nunca persiste).
      servicosAutorizados: tipo === "servico_autorizado" ? paraServicosAutorizadosV4(servicos) : undefined,
    });
    const invalido = validarNovaOSDraftV3(draft);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setBusy(true);
    try {
      const { os } = await criarOSEnterpriseV3(sid, draft);
      v.onOSCriada(os.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a OS.");
    } finally {
      setBusy(false);
    }
  };

  // Totais derivados das linhas válidas (matemática do contrato, sem conta nova).
  const tot = totaisServicosV4(servicos);
  const resumoComercial =
    tipo !== "servico_autorizado" || tot.qtd === 0
      ? "Sem valor obrigatório"
      : tot.qtd === 1
        ? `Valor comercial ${moeda(tot.venda)}`
        : `${tot.qtd} serviços · Valor comercial ${moeda(tot.venda)}`;

  return (
    <AtendimentoModalShell
      titulo="Nova Ordem de Serviço"
      subtitulo="Crie uma OS para serviço autorizado ou diagnóstico técnico."
      onClose={v.closeNovaOS}
      busy={busy}
      erro={erro}
      footer={
        <>
          <span style={{ fontSize: 12, color: C.subtle }}>
            {resumoComercial}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={v.closeNovaOS} disabled={busy} style={ghost}>Cancelar</button>
            <button type="button" onClick={() => void handleCriar()} disabled={busy} style={primary}>
              {busy ? "Abrindo…" : "Criar Ordem de Serviço"}
            </button>
          </div>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Tipo de entrada</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
          {TIPOS.map((t) => {
            const sel = tipo === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTipo(t.key);
                  setAbertos((a) => ({ ...a, comercial: t.key === "servico_autorizado", recepcao: t.key !== "servico_autorizado" }));
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 11px",
                  border: `1px solid ${sel ? C.primaryBd : C.line2}`,
                  background: sel ? C.primaryBg : C.surface,
                  borderRadius: 10,
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{t.titulo}</div>
                <div style={{ fontSize: 11, color: C.subtle, marginTop: 3, lineHeight: 1.4 }}>{t.texto}</div>
              </button>
            );
          })}
        </div>
      </div>

      <AtendimentoAccordionSection titulo="Cliente" aberto={abertos.cliente} onToggle={() => setAbertos((a) => ({ ...a, cliente: !a.cliente }))} resumo={cliente.existente?.nome || cliente.novo.nome || undefined}>
        <ClienteAtendimentoSection storeId={lojaAtivaId} value={cliente} onChange={setCliente} origem={origem} onOrigemChange={setOrigem} />
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Aparelho" aberto={abertos.aparelho} onToggle={() => setAbertos((a) => ({ ...a, aparelho: !a.aparelho }))} resumo={[aparelho.marca, aparelho.modelo].filter(Boolean).join(" ") || undefined}>
        <AparelhoAtendimentoSection value={aparelho} onChange={setAparelho} />
      </AtendimentoAccordionSection>

      {tipo === "servico_autorizado" ? (
        <AtendimentoAccordionSection titulo="Serviços e valores" aberto={abertos.comercial} onToggle={() => setAbertos((a) => ({ ...a, comercial: !a.comercial }))}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {servicos.map((linha) =>
              linha.confirmada ? (
                <LinhaServicoCard
                  key={linha.key}
                  linha={linha}
                  onEditar={() => setServicos((prev) => atualizarLinhaServicoV4(prev, linha.key, { confirmada: false, erro: null }))}
                  onRemover={() => removerLinha(linha.key)}
                />
              ) : (
                <LinhaServicoEditor
                  key={linha.key}
                  linha={linha}
                  storeId={lojaAtivaId}
                  onPatch={(patch) => setServicos((prev) => atualizarLinhaServicoV4(prev, linha.key, { ...patch, erro: null }))}
                  onSelectCatalogo={(s) => setServicos((prev) => prev.map((l) => (l.key === linha.key ? { ...linhaServicoDoCatalogoV4(linha.key, s) } : l)))}
                  onConfirmar={() =>
                    setServicos((prev) =>
                      prev.map((l) => {
                        if (l.key !== linha.key) return l;
                        const erro = erroLinhaServicoV4(l);
                        return erro ? { ...l, erro } : { ...l, confirmada: true, erro: null };
                      }),
                    )
                  }
                  onRemover={() => removerLinha(linha.key)}
                />
              ),
            )}
          </div>

          <button
            type="button"
            onClick={adicionarServico}
            aria-label="Adicionar serviço"
            style={{
              marginTop: 8,
              width: "100%",
              height: 34,
              border: `1px dashed ${C.primaryBd}`,
              background: C.primaryBg,
              color: C.primaryHover,
              borderRadius: 9,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Adicionar serviço
          </button>

          {tot.qtd > 0 ? (
            <div style={{ marginTop: 8, border: `1px solid ${C.line2}`, borderRadius: 9, padding: "9px 11px", fontSize: 12, color: C.body }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.subtle }}>{tot.qtd === 1 ? "1 serviço" : `${tot.qtd} serviços`}</span>
                <span style={{ fontWeight: 700, color: C.ink }}>Valor comercial {moeda(tot.venda)}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: C.subtle }}>
                Interno: custo {moeda(tot.custo)} · lucro {moeda(tot.lucro)}
                {tot.margem != null ? ` · ${tot.margem.toFixed(1)}%` : ""}
              </div>
            </div>
          ) : null}
        </AtendimentoAccordionSection>
      ) : null}

      <AtendimentoAccordionSection titulo="Recepção" aberto={abertos.recepcao} onToggle={() => setAbertos((a) => ({ ...a, recepcao: !a.recepcao }))}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
          <div>
            <div style={atendLabel}>Recebido por</div>
            <input value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} placeholder="Nome do atendente" style={atendInput} autoComplete="off" />
          </div>
          <div>
            <div style={atendLabel}>Prioridade</div>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as typeof prioridade)} style={atendInput}>
              <option value="baixa">Baixa</option>
              <option value="media">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <div style={atendLabel}>Localização</div>
            <select value={localFisico} onChange={(e) => setLocalFisico(e.target.value as typeof localFisico)} style={atendInput}>
              <option value="balcao">Balcão</option>
              <option value="bancada">Bancada</option>
              <option value="aguardando_diagnostico">Aguardando diagnóstico</option>
            </select>
          </div>
          <div>
            <div style={atendLabel}>Previsão / SLA</div>
            <input type="datetime-local" value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={atendInput} autoComplete="off" />
          </div>
        </div>
      </AtendimentoAccordionSection>

      <AtendimentoAccordionSection titulo="Prova de entrada" aberto={abertos.prova} onToggle={() => setAbertos((a) => ({ ...a, prova: !a.prova }))} resumo="Completar depois no workspace">
        <p style={{ margin: 0, fontSize: 12.5, color: C.subtle, lineHeight: 1.5 }}>
          Segurança, inspeção, acessórios, fotos e assinatura ficam no workspace da Entrada depois da criação.
        </p>
      </AtendimentoAccordionSection>
    </AtendimentoModalShell>
  );
}

function moeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Card compacto de um serviço confirmado (snapshot comercial da linha). */
function LinhaServicoCard({
  linha,
  onEditar,
  onRemover,
}: {
  linha: ServicoLinhaFormV4;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const detalhes = [
    moeda(Math.max(0, linha.valor)),
    linha.garantia > 0 ? `Garantia ${linha.garantia}d` : null,
    linha.prazo.trim() ? `Prazo ${linha.prazo.trim()}` : null,
  ].filter(Boolean) as string[];
  return (
    <div
      role="group"
      aria-label={`Serviço ${linha.nome}`}
      style={{ border: `1px solid ${C.line2}`, background: C.surface, borderRadius: 10, padding: "9px 11px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🔧 {linha.nome}
          </div>
          <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 2 }}>{detalhes.join(" • ")}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button type="button" onClick={onEditar} aria-label={`Editar serviço ${linha.nome}`} style={miniGhost}>Editar</button>
          <button type="button" onClick={onRemover} aria-label={`Remover serviço ${linha.nome}`} style={miniDanger}>Remover</button>
        </div>
      </div>
    </div>
  );
}

/** Editor de uma linha (catálogo + campos editáveis + confirmação). */
function LinhaServicoEditor({
  linha,
  storeId,
  onPatch,
  onSelectCatalogo,
  onConfirmar,
  onRemover,
}: {
  linha: ServicoLinhaFormV4;
  storeId: string | null;
  onPatch: (patch: Partial<Omit<ServicoLinhaFormV4, "key">>) => void;
  onSelectCatalogo: (s: ServicoCatalogoV4) => void;
  onConfirmar: () => void;
  onRemover: () => void;
}) {
  return (
    <div
      style={{ border: `1px solid ${C.primaryBd}`, background: C.primaryBg, borderRadius: 10, padding: "10px 11px" }}
    >
      <ServicoCatalogLookup storeId={storeId} onSelect={onSelectCatalogo} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.7fr) minmax(0,0.7fr)", gap: 8 }}>
        <div>
          <div style={atendLabel}>Serviço *</div>
          <input
            value={linha.nome}
            onChange={(e) => onPatch({ nome: e.target.value, catalogoServicoId: null })}
            placeholder="Troca de tela"
            aria-label="Nome do serviço"
            style={atendInput}
            autoComplete="off"
          />
        </div>
        <div>
          <div style={atendLabel}>Venda *</div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={linha.valor || ""}
            onChange={(e) => onPatch({ valor: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Valor de venda"
            style={atendInput}
            autoComplete="off"
          />
        </div>
        <div>
          <div style={atendLabel}>Custo interno</div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={linha.custo || ""}
            onChange={(e) => onPatch({ custo: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Custo interno"
            style={{ ...atendInput, background: C.muted100 }}
            title="Custo interno — não aparece para o cliente."
            autoComplete="off"
          />
        </div>
        <div>
          <div style={atendLabel}>Garantia (dias)</div>
          <input
            type="number"
            min={0}
            value={linha.garantia || ""}
            onChange={(e) => onPatch({ garantia: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
            aria-label="Garantia em dias"
            style={atendInput}
            autoComplete="off"
          />
        </div>
        <div>
          <div style={atendLabel}>Prazo</div>
          <input
            value={linha.prazo}
            onChange={(e) => onPatch({ prazo: e.target.value })}
            placeholder="2 horas"
            aria-label="Prazo estimado"
            style={atendInput}
            autoComplete="off"
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignSelf: "end", justifyContent: "flex-end" }}>
          <button type="button" onClick={onConfirmar} aria-label={`Confirmar serviço ${linha.nome || "sem nome"}`} style={miniPrimary}>Confirmar</button>
          <button type="button" onClick={onRemover} aria-label={`Remover serviço ${linha.nome || "sem nome"}`} style={miniGhost}>Remover</button>
        </div>
      </div>
      {linha.erro ? (
        <div role="alert" style={{ fontSize: 11.5, color: C.dangerFg, marginTop: 6 }}>{linha.erro}</div>
      ) : null}
    </div>
  );
}

const ghost: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  height: 36,
  padding: "0 16px",
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const miniPrimary: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: "none",
  background: C.primary,
  color: C.white,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const miniGhost: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: `1px solid ${C.inputBd}`,
  background: C.surface,
  color: C.body,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const miniDanger: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: `1px solid ${C.dangerBd}`,
  background: C.surface,
  color: C.dangerFg,
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
