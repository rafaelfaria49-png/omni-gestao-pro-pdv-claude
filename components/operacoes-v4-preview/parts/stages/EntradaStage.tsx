/** Operações V4 — etapa Entrada (REAL · slices OPS-V4-ENTRADA-RECEPCAO-REAL-003 + -DADOS-BASICOS-OS-REAL-003B + -SEGURANCA-ACESSO-PARITY-004A).
 *
 * Editável e persistido via reuso de actions V3 seguras (sem backend novo, sem
 * estoque/caixa/financeiro):
 *   • identificação/estado físico/avarias/credenciais/acessórios/checklist →
 *     `salvarIdentificacaoV3` / `salvarProvaEntradaV3` / `salvarAcessoriosEntradaV3` /
 *     `salvarChecklistEntradaV3` (slice 003);
 *   • dados básicos da recepção (defeito relatado, prioridade, origem, recebido por,
 *     localização, previsão/SLA, observações internas) → `salvarDadosBasicosOSV3`
 *     (slice 003B, payload-only + coluna `defeito`).
 * Quando `senhaTipo === "padrao"`, o campo "Senha / PIN" vira o widget `PatternPadV4`
 * (paridade com `PatternPadV3` da V3) — mesmo campo `credenciais.senha`, mesma
 * persistência via `salvarProvaEntrada` (slice 004A). É a senha REAL do aparelho
 * do cliente; não confundir com a autorização de gerente (100% preview em
 * `SegurancaStage.tsx`, não tocado por este slice).
 * Fotos de entrada (GOAL OPS-V4-DOCS-ASSINATURA-TERMOS-ANEXOS-012): a LISTAGEM já
 * lê `payload.provaEntradaV3.fotos` (real, via `adaptFotosEntrada`); o UPLOAD em
 * si ainda não tem botão nesta etapa. Assinatura de entrada, anexos genéricos e
 * documentos seguem PREVIEW. */
import { useState } from "react";
import { C, card, cardTitle, HATCH, MONO, upLabel } from "../../tokens";
import type { V4Vals } from "../../use-v4-preview";
import {
  CHECKLIST_ESTADO_META_V3,
  ESTADO_FISICO_STATUS_META_V3,
  TIPOS_AVARIA_V3,
  acessorioEntradaLabelV3,
  componenteFisicoLabelV3,
  addAvaria,
  cycleChecklistEstado,
  removeAvaria,
  setAvaria,
  setEstadoFisicoStatus,
  toAcessoriosInput,
  toChecklistInput,
  toIdentificacaoInput,
  toProvaEntradaInput,
  toggleAcessorio,
  type EntradaEditorV4,
  type EstadoFisicoStatusV3,
} from "@/lib/operacoes-v4/entrada-form";
import {
  LOCAL_FISICO_V3,
  ORIGEM_V3,
  PRIORIDADE_V3,
  setDadosBasicos,
  toDadosBasicosInput,
  type DadosBasicosEditorV4,
} from "@/lib/operacoes-v4/dados-basicos-form";
import { PatternPadV4 } from "../PatternPadV4";
import { EntradaPendenciasPanel } from "./EntradaPendenciasPanel";

// Colunas do stage colapsam 3→2→1 conforme o espaço (notebook 1366px com as
// gavetas abertas deixa o centro estreito — sem isso os cards ficam espremidos).
const col3 = "repeat(auto-fit, minmax(290px, 1fr))";
const col2 = "minmax(0,1fr) minmax(0,1fr)";
const emptyText = { fontSize: 12, color: C.subtle, padding: "10px 2px", lineHeight: 1.5 } as const;

const inp: React.CSSProperties = {
  width: "100%",
  height: 30,
  padding: "0 9px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 7,
  fontSize: 12,
  color: C.body,
  background: C.surface,
};
const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
const ta: React.CSSProperties = {
  width: "100%",
  minHeight: 74,
  padding: "7px 9px",
  border: `1px solid ${C.inputBd}`,
  borderRadius: 7,
  fontSize: 12,
  color: C.body,
  background: C.surface,
  resize: "vertical",
  lineHeight: 1.45,
  fontFamily: "inherit",
};

const CHECK_TONE: Record<string, { bg: string; fg: string; bd: string }> = {
  success: { bg: C.successBg, fg: C.successFg, bd: C.successBd },
  danger: { bg: C.dangerBg, fg: C.dangerFg, bd: C.dangerBd },
  neutral: { bg: C.infoBg, fg: C.infoFg, bd: C.infoBd },
};

export function EntradaStage({ v }: { v: V4Vals }) {
  if (!v.osSelected) {
    return (
      <div style={card}>
        <div style={{ ...cardTitle, marginBottom: 6 }}>Entrada</div>
        <div style={emptyText}>Selecione uma Ordem de Serviço para registrar a entrada.</div>
      </div>
    );
  }
  // Re-monta ao trocar de OS → re-semeia os campos com a prova de entrada real.
  return <EntradaEditor key={v.selectedOsId ?? "none"} v={v} />;
}

function btnPrimary(busy: boolean): React.CSSProperties {
  return { height: 32, padding: "0 14px", border: "none", background: C.primary, color: C.white, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, whiteSpace: "nowrap" };
}

function EntradaEditor({ v }: { v: V4Vals }) {
  const [ed, setEd] = useState<EntradaEditorV4>(() => v.entradaEditorSeed);
  const [db, setDb] = useState<DadosBasicosEditorV4>(() => v.dadosBasicosSeed);
  const [busy, setBusy] = useState(false);

  const runSave = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const setIdent = (patch: Partial<EntradaEditorV4["identificacao"]>) =>
    setEd((e) => ({ ...e, identificacao: { ...e.identificacao, ...patch } }));
  const setCred = (patch: Partial<EntradaEditorV4["credenciais"]>) =>
    setEd((e) => ({ ...e, credenciais: { ...e.credenciais, ...patch } }));
  const setBasico = <K extends keyof DadosBasicosEditorV4>(key: K, value: DadosBasicosEditorV4[K]) =>
    setDb((d) => setDadosBasicos(d, key, value));

  return (
    <div style={{ display: "grid", gridTemplateColumns: col3, gap: 12, alignItems: "start" }}>
      <EntradaPendenciasPanel v={v} />
      {/* Coluna 1 — Dados básicos + Identificação + Estado físico + Avarias */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div id="entrada-card-dados-basicos" style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Dados básicos / Recepção</div>
          <div>
            <div style={{ ...upLabel, marginBottom: 3 }}>Defeito relatado</div>
            <textarea value={db.defeitoRelatado} onChange={(e) => setBasico("defeitoRelatado", e.target.value)} maxLength={600} placeholder="Descreva o problema informado pelo cliente…" style={ta} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 8, marginTop: 8 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Prioridade</div>
              <select value={db.prioridade} onChange={(e) => setBasico("prioridade", e.target.value as DadosBasicosEditorV4["prioridade"])} style={sel}>
                {PRIORIDADE_V3.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
              </select>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Origem</div>
              <select value={db.origem} onChange={(e) => setBasico("origem", e.target.value as DadosBasicosEditorV4["origem"])} style={sel}>
                {ORIGEM_V3.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Localização física</div>
              <select value={db.localFisico} onChange={(e) => setBasico("localFisico", e.target.value as DadosBasicosEditorV4["localFisico"])} style={sel}>
                {LOCAL_FISICO_V3.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
              </select>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Recebido por</div>
              <input value={db.recebidoPor} onChange={(e) => setBasico("recebidoPor", e.target.value)} maxLength={80} placeholder="Atendente…" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ ...upLabel, marginBottom: 3 }}>Previsão de entrega / SLA</div>
              <input type="datetime-local" value={db.previsaoLocal} onChange={(e) => setBasico("previsaoLocal", e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ ...upLabel, marginBottom: 3 }}>Observações internas</div>
            <textarea value={db.observacoes} onChange={(e) => setBasico("observacoes", e.target.value)} maxLength={800} placeholder="Notas internas da recepção (não impressas ao cliente)…" style={ta} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => runSave(() => v.salvarDadosBasicos(toDadosBasicosInput(db)))} style={btnPrimary(busy)}>Salvar dados básicos</button>
          </div>
        </div>

        <div id="entrada-card-identificacao" style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>Identificação do aparelho</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 8 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>IMEI</div><input value={ed.identificacao.imei} onChange={(e) => setIdent({ imei: e.target.value })} maxLength={40} style={{ ...inp, fontFamily: MONO }} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Serial</div><input value={ed.identificacao.serial} onChange={(e) => setIdent({ serial: e.target.value })} maxLength={40} style={{ ...inp, fontFamily: MONO }} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Operadora</div><input value={ed.identificacao.operadora} onChange={(e) => setIdent({ operadora: e.target.value })} maxLength={40} placeholder="Vivo, Claro…" style={inp} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Cor</div><input value={ed.identificacao.cor} onChange={(e) => setIdent({ cor: e.target.value })} maxLength={40} placeholder="Grafite…" style={inp} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ ...upLabel, marginBottom: 3 }}>Modelo</div><input value={ed.identificacao.modelo} onChange={(e) => setIdent({ modelo: e.target.value })} maxLength={60} placeholder="iPhone 13 Pro…" style={inp} /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => runSave(() => v.salvarIdentificacao(toIdentificacaoInput(ed)))} style={btnPrimary(busy)}>Salvar identificação</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Estado físico</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ed.estadoFisico.map((item) => (
              <div key={item.componente} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{componenteFisicoLabelV3(item.componente)}</span>
                <select value={item.status} onChange={(e) => setEd((s) => setEstadoFisicoStatus(s, item.componente, e.target.value as EstadoFisicoStatusV3))} style={{ ...sel, width: 116 }}>
                  {(Object.keys(ESTADO_FISICO_STATUS_META_V3) as EstadoFisicoStatusV3[]).map((k) => (
                    <option key={k} value={k}>{ESTADO_FISICO_STATUS_META_V3[k].label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.subtle, marginTop: 8, lineHeight: 1.4 }}>
            Estado físico, avarias e acesso são salvos juntos no botão <b>“Salvar estado, avarias e acesso”</b> (coluna do meio).
          </div>
        </div>

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Avarias{ed.avarias.length > 0 ? ` · ${ed.avarias.length}` : ""}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
            {TIPOS_AVARIA_V3.map((t) => (
              <button key={t.id} type="button" onClick={() => setEd((s) => addAvaria(s, t.id))} style={{ height: 28, padding: "0 11px", border: `1px solid ${C.inputBd}`, background: C.surface, color: C.body, borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>+ {t.label}</button>
            ))}
          </div>
          {ed.avarias.length === 0 ? (
            <div style={emptyText}>Nenhuma avaria registrada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ed.avarias.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 64, flex: "none" }}>{TIPOS_AVARIA_V3.find((t) => t.id === a.tipo)?.label ?? a.tipo}</span>
                  <input value={a.local} onChange={(e) => setEd((s) => setAvaria(s, a.id, { local: e.target.value }))} placeholder="Local (ex.: canto inferior)" maxLength={80} style={{ ...inp, flex: 1, minWidth: 0 }} />
                  <button type="button" onClick={() => setEd((s) => removeAvaria(s, a.id))} aria-label="Remover avaria" style={{ width: 28, height: 30, border: `1px solid ${C.inputBd}`, background: C.surface, color: C.danger, borderRadius: 7, cursor: "pointer", flex: "none" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coluna 2 — Acesso/Credenciais (salva a prova) + Checklist + Fotos (preview) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div id="entrada-card-estado-avarias-acesso" style={card}>
          <div style={{ ...cardTitle, marginBottom: 10 }}>🔐 Segurança / Acesso</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 8 }}>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Tipo de senha</div>
              <select value={ed.credenciais.senhaTipo} onChange={(e) => setCred({ senhaTipo: e.target.value as EntradaEditorV4["credenciais"]["senhaTipo"] })} style={sel}>
                <option value="numerica">Numérica (PIN)</option>
                <option value="texto">Texto</option>
                <option value="padrao">Padrão</option>
              </select>
            </div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Conta Google</div><input value={ed.credenciais.contaGoogle} onChange={(e) => setCred({ contaGoogle: e.target.value })} maxLength={120} placeholder="email@gmail.com" style={inp} /></div>
            <div><div style={{ ...upLabel, marginBottom: 3 }}>Conta Apple</div><input value={ed.credenciais.contaApple} onChange={(e) => setCred({ contaApple: e.target.value })} maxLength={120} placeholder="email@icloud.com" style={inp} /></div>
          </div>
          <div style={{ marginTop: 8 }}>
            {ed.credenciais.senhaTipo === "padrao" ? (
              <>
                <div style={{ ...upLabel, marginBottom: 5 }}>Padrão 3×3 do aparelho</div>
                <PatternPadV4 value={ed.credenciais.senha} onChange={(val) => setCred({ senha: val })} />
              </>
            ) : (
              <>
                <div style={{ ...upLabel, marginBottom: 3 }}>Senha / PIN</div>
                <input value={ed.credenciais.senha} onChange={(e) => setCred({ senha: e.target.value })} maxLength={60} style={{ ...inp, fontFamily: MONO }} />
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 9 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.body, cursor: "pointer" }}>
              <input type="checkbox" checked={ed.credenciais.faceId} onChange={(e) => setCred({ faceId: e.target.checked })} /> Face ID
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.body, cursor: "pointer" }}>
              <input type="checkbox" checked={ed.credenciais.biometria} onChange={(e) => setCred({ biometria: e.target.checked })} /> Biometria
            </label>
          </div>
          <div style={{ fontSize: 10, color: C.subtle, margin: "10px 0", lineHeight: 1.4 }}>🔒 Credenciais são <b>mascaradas</b> na OS impressa entregue ao cliente.</div>
          <button type="button" disabled={busy} onClick={() => runSave(() => v.salvarProvaEntrada(toProvaEntradaInput(ed)))} style={{ ...btnPrimary(busy), width: "100%" }}>Salvar estado, avarias e acesso</button>
        </div>

        <div id="entrada-card-checklist" style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Checklist do aparelho</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 7 }}>
            {ed.checklist.map((c) => {
              const meta = CHECKLIST_ESTADO_META_V3[c.estado];
              const tone = CHECK_TONE[meta.tone] ?? CHECK_TONE.neutral;
              return (
                <button key={c.id} type="button" onClick={() => setEd((s) => cycleChecklistEstado(s, c.id))} title={`${c.label} — clique para alternar OK / Ruim / N/T`} style={{ border: `1px solid ${C.line2}`, borderRadius: 8, padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0, background: C.surface, cursor: "pointer" }}>
                  <span style={{ fontSize: 11.5, color: C.body, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.label}</span>
                  <span style={{ flex: "none", border: `1px solid ${tone.bd}`, background: tone.bg, color: tone.fg, borderRadius: 5, padding: "2px 7px", fontSize: 9.5, fontWeight: 700 }}>{meta.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => runSave(() => v.salvarChecklist(toChecklistInput(ed)))} style={btnPrimary(busy)}>Salvar checklist</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>
            Fotos de entrada{v.entradaFotos.length > 0 ? ` · ${v.entradaFotos.length}` : ""}
            {v.entradaFotos.length === 0 && (
              <span style={{ fontSize: 10, fontWeight: 500, color: C.subtle, marginLeft: 6 }}>(upload em breve)</span>
            )}
          </div>
          {v.entradaFotos.length === 0 ? (
            <div style={emptyText}>Nenhuma foto registrada na entrada desta OS.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
              {v.entradaFotos.map((f) => (
                <div key={f.id} title={f.name} style={{ aspectRatio: "1", borderRadius: 7, background: HATCH, position: "relative", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.dataUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", left: 3, top: 3, fontSize: 8, background: "rgba(0,0,0,.55)", color: C.white, padding: "1px 4px", borderRadius: 3 }}>{f.tag}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coluna 3 — Acessórios + Assinatura (preview) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div id="entrada-card-acessorios" style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>Acessórios recebidos</div>
          <div style={{ display: "grid", gridTemplateColumns: col2, gap: 6 }}>
            {ed.acessorios.map((a) => {
              const on = a.presente;
              return (
                <button key={a.id} type="button" onClick={() => setEd((s) => toggleAcessorio(s, a.id))} title={acessorioEntradaLabelV3(a.id)} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${on ? C.successBd : C.line2}`, background: on ? C.successBg : C.surface, borderRadius: 7, padding: "6px 8px", minWidth: 0, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 15, height: 15, borderRadius: 4, background: on ? C.success : C.muted100, color: on ? C.white : C.subtle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flex: "none" }}>{on ? "✓" : ""}</span>
                  <span style={{ fontSize: 11.5, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{acessorioEntradaLabelV3(a.id)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => runSave(() => v.salvarAcessorios(toAcessoriosInput(ed)))} style={btnPrimary(busy)}>Salvar acessórios</button>
          </div>
        </div>

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 9 }}>✍ Assinatura do cliente (entrada) <span style={{ fontSize: 10, fontWeight: 500, color: C.subtle }}>(preview)</span></div>
          <div style={emptyText}>Captura de assinatura chega em uma próxima etapa.</div>
        </div>
      </div>
    </div>
  );
}
