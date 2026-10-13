"use client";
import { useEffect, useRef, useState } from "react";
import type { OrdemServico } from "@/types/os";
import type { SalvarGarantiaInputV3 } from "@/lib/operacoes-v3/garantia-actions";
import { GARANTIA_CATALOGO_V3, garantiaCatalogoV3, prazoPadraoGarantiaV3, sugerirGarantiaPorDescricaoV3 } from "@/lib/operacoes-v3/garantia-textos";
import { assinaturaGarantiasServicosV3, condicaoUnicaGarantiaV3, lerCoberturasGarantiaV3 } from "@/lib/operacoes-v3/garantia-servicos-model";
import { lerGarantiaV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { lerVersoesTermoGarantiaV3 } from "@/lib/operacoes-v3/garantia-termos-model";

const campo = "w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function GarantiaEditorV3({ os, salvar, pending = false, origem = "v3" }: {
  os: OrdemServico | null; salvar: (input: SalvarGarantiaInputV3) => Promise<boolean>; pending?: boolean; origem?: "v3" | "v4";
}) {
  const linhas = lerCoberturasGarantiaV3(os), geral = lerGarantiaV3(os);
  const [linhaId, setLinhaId] = useState(linhas[0]?.linhaId ?? "");
  const selecionada = linhas.find((c) => c.linhaId === linhaId) ?? linhas[0];
  const modeloSeed = selecionada?.modeloId ?? (geral.temGarantia ? geral.modeloId : "sem_garantia");
  const prazoSeed = selecionada?.prazoDias ?? (geral.temGarantia ? geral.prazoDias : 0);
  const [modelo, setModelo] = useState(modeloSeed), [prazo, setPrazo] = useState(String(prazoSeed));
  const [motivo, setMotivo] = useState(""), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [erro, setErro] = useState("");
  const assinatura = assinaturaGarantiasServicosV3(os);
  const [esperado, setEsperado] = useState(assinatura);
  const alvo = `${os?.storeId}:${os?.id}:${selecionada?.linhaId ?? ""}`;
  const alvoRef = useRef(alvo); alvoRef.current = alvo;
  useEffect(() => {
    if (dirty || busy) return;
    setModelo(modeloSeed); setPrazo(String(prazoSeed)); setEsperado(assinatura);
    // Rascunho sujo mantém o snapshot visto; o servidor recusa concorrência.
  }, [assinatura, modeloSeed, prazoSeed, dirty, busy]);
  const semCobertura = garantiaCatalogoV3(modelo).semCobertura;
  const mudou = modelo !== modeloSeed || Number(prazo) !== prazoSeed;
  const emitido = lerVersoesTermoGarantiaV3(os).length > 0;
  const sugestao = sugerirGarantiaPorDescricaoV3(selecionada?.descricao);
  const escolherModelo = (id: string) => { setModelo(id); setPrazo(String(prazoPadraoGarantiaV3(id))); setDirty(true); setErro(""); };
  const salvarAgora = async () => {
    if (busy || pending || !os) return;
    const dias = Number(prazo);
    if (!semCobertura && (!Number.isSafeInteger(dias) || dias <= 0)) { setErro("Informe um prazo inteiro positivo."); return; }
    if (mudou && !motivo.trim()) { setErro("Informe o motivo obrigatório da alteração."); return; }
    const destino = alvo;
    setBusy(true); setErro("");
    try {
      const ok = await salvar({ modeloId: modelo, prazoDias: semCobertura ? 0 : dias, ...(selecionada ? { linhaId: selecionada.linhaId } : {}), esperado, motivo, origem });
      if (alvoRef.current !== destino) return;
      if (ok) { setDirty(false); setMotivo(""); } else setErro("Não foi possível salvar. Revise a mensagem e tente novamente.");
    } catch (e) { if (alvoRef.current === destino) setErro(e instanceof Error ? e.message : "Falha ao salvar garantia."); }
    finally { if (alvoRef.current === destino) setBusy(false); }
  };
  return <div className="space-y-3">
    {linhas.length > 1 ? <label className="block text-xs">Serviço
      <select className={campo} value={selecionada?.linhaId ?? ""} disabled={busy || pending} onChange={(e) => {
        const c = linhas.find((l) => l.linhaId === e.target.value)!;
        setLinhaId(c.linhaId); setModelo(c.modeloId); setPrazo(String(c.prazoDias)); setMotivo(""); setDirty(false); setErro(""); setEsperado(assinatura);
      }}>{linhas.map((c, i) => <option key={c.linhaId} value={c.linhaId}>{i + 1}. {c.descricao}</option>)}</select>
    </label> : null}
    {sugestao && sugestao !== modelo ? <div className="text-xs text-muted-foreground">Sugestão pela descrição: {garantiaCatalogoV3(sugestao).titulo}. <button type="button" className="underline" disabled={busy || pending} onClick={() => escolherModelo(sugestao)}>Aplicar sugestão</button></div> : null}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block text-xs">Modelo de garantia<select className={campo} value={modelo} disabled={busy || pending} onChange={(e) => escolherModelo(e.target.value)}>
        {!GARANTIA_CATALOGO_V3.some((m) => m.id === modelo) ? <option value={modelo}>Modelo legado não identificado</option> : null}
        {GARANTIA_CATALOGO_V3.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
      </select></label>
      <label className="block text-xs">{semCobertura ? "Sem cobertura — prazo 0" : "Prazo em dias"}<input className={campo} type="number" min={semCobertura ? 0 : 1} step={1} value={semCobertura ? "0" : prazo} disabled={semCobertura || busy || pending} onChange={(e) => { setPrazo(e.target.value); setDirty(true); setErro(""); }} /></label>
    </div>
    <label className="block text-xs">Motivo da alteração{mudou ? " (obrigatório)" : ""}<textarea className={campo} rows={2} value={motivo} disabled={busy || pending} onChange={(e) => setMotivo(e.target.value)} /></label>
    <p className="text-xs text-muted-foreground">{emitido ? "A alteração cria um aditivo e preserva as versões anteriores e o início da garantia." : "A garantia fica prevista e começa na entrega."} Mudanças exigem permissão de garantia e motivo.</p>
    <button type="button" disabled={busy || pending || !dirty} onClick={() => void salvarAgora()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : "Salvar garantia"}</button>
    {erro ? <p role="alert" className="text-xs text-destructive">{erro}</p> : null}
  </div>;
}

export function CoberturasGarantiaResumoV3({ os, condicoes = false }: { os: OrdemServico | null; condicoes?: boolean }) {
  const garantia = lerGarantiaV3(os);
  const linhas = garantia.coberturas;
  if (!linhas?.length) return <p className="text-sm">{garantia.temGarantia ? `${garantia.label} · ${garantia.prazoDias} dias` : "Garantia não definida."}</p>;
  const unica = condicaoUnicaGarantiaV3(linhas);
  if (linhas.length > 1 && unica && !condicoes) return <div className="space-y-2">
    <p className="text-sm font-medium">{linhas.length} serviços · condições iguais</p>
    <p className="text-xs"><span>{unica.prazoDias} dias</span> · {linhas[0].situacao === "prevista" ? "A partir da entrega" : linhas[0].situacao === "ativa" ? "Vigente" : linhas[0].situacao === "vencida" ? "Vencida" : "Sem cobertura"}</p>
    <ul className="list-inside list-disc text-xs text-muted-foreground">{linhas.map((c) => <li key={c.linhaId}>{c.descricao}</li>)}</ul>
  </div>;
  return <div className="space-y-3">{linhas.map((c) => <div key={c.linhaId} className="border-b border-border pb-2 last:border-0">
    <p className="text-sm font-medium">{c.descricao}</p>
    <p className="text-xs"><span>{c.prazoDias} dias</span> · <span>{c.modeloId === "nao_definida" ? "Condição não informada" : c.situacao === "prevista" ? "A partir da entrega" : c.situacao === "ativa" ? "Vigente" : c.situacao === "vencida" ? "Vencida" : "Sem cobertura"}</span></p>
    {c.inicio && c.vencimento ? <p className="text-xs text-muted-foreground">{new Date(c.inicio).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a {new Date(c.vencimento).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p> : null}
    {condicoes ? <div className="mt-2 whitespace-pre-line text-xs text-muted-foreground"><p>{c.termo.titulo}</p>{c.termo.cobertura.map((t, i) => <p key={i}>{t}</p>)}{c.termo.exclusoes.length ? <><p>Condições aplicáveis:</p><ul className="list-inside list-disc">{c.termo.exclusoes.map((t, i) => <li key={i}>{t}</li>)}</ul></> : null}{c.termo.observacao ? <p>{c.termo.observacao}</p> : null}</div> : null}
  </div>)}</div>;
}
