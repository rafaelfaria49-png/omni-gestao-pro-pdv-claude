"use client"
import { useEffect, useId, useRef, useState } from "react"
import { RAMOS_SOLICITACAO, PLANOS_GESTAO_LOJAS, formatarPrecoMensal } from "@/lib/comercial/gestao-lojas-oferta"

export const EVENTO_ESCOLHER_PLANO = "gl:escolher-plano"

type Campos = Partial<Record<"nome" | "nomeLoja" | "email" | "whatsapp" | "ramo" | "consentimento" | "form", string>>
type Estado =
  | { fase: "editando"; erros: Campos; alerta?: string }
  | { fase: "enviando" }
  | { fase: "recebida"; protocolo: string; repetida: boolean; email: string; whatsapp: string }

const ORDEM: (keyof Campos)[] = ["nome", "nomeLoja", "email", "whatsapp", "ramo", "consentimento"]

/**
 * Pedido de teste real: POST /api/comercial/solicitacoes-teste. A confirmação só
 * aparece com o protocolo devolvido pelo servidor depois de gravar no banco.
 * O texto nunca diz "conta criada" ou "teste iniciado": o acesso é liberado pela equipe.
 */
export function SolicitacaoTesteForm({ exibirPlanos }: { exibirPlanos: boolean }) {
  const id = useId()
  const [estado, setEstado] = useState<Estado>({ fase: "editando", erros: {} })
  const [plano, setPlano] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const confirmRef = useRef<HTMLHeadingElement>(null)
  const alertaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exibirPlanos) return
    const ouvir = (e: Event) => { const v = (e as CustomEvent<string>).detail; if (typeof v === "string") setPlano(v) }
    window.addEventListener(EVENTO_ESCOLHER_PLANO, ouvir)
    return () => window.removeEventListener(EVENTO_ESCOLHER_PLANO, ouvir)
  }, [exibirPlanos])

  useEffect(() => {
    if (estado.fase === "recebida") confirmRef.current?.focus()
    if (estado.fase === "editando") {
      const primeiro = ORDEM.find((k) => estado.erros[k])
      if (primeiro) formRef.current?.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus()
      else if (estado.alerta) alertaRef.current?.focus()
    }
  }, [estado])

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const corpo = {
      nome: String(f.get("nome") ?? ""), nomeLoja: String(f.get("nomeLoja") ?? ""), email: String(f.get("email") ?? ""),
      whatsapp: String(f.get("whatsapp") ?? ""), ramo: String(f.get("ramo") ?? ""),
      planoInteresse: exibirPlanos && plano ? plano : undefined,
      mensagem: String(f.get("mensagem") ?? "") || undefined,
      consentimento: f.get("consentimento") === "on",
      site: String(f.get("site") ?? ""),
    }
    setEstado({ fase: "enviando" })
    try {
      const r = await fetch("/api/comercial/solicitacoes-teste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      const data = await r.json().catch(() => null)
      if (data?.ok === true && typeof data.protocolo === "string") {
        setEstado({ fase: "recebida", protocolo: data.protocolo, repetida: data.repetida === true, email: corpo.email.trim(), whatsapp: corpo.whatsapp })
        return
      }
      if (data?.codigo === "INVALIDO") {
        const erros: Campos = data.campos ?? {}
        const alerta = erros.form ?? (erros as Record<string, string>).site
        setEstado({ fase: "editando", erros, alerta: alerta ?? (Object.keys(erros).length ? undefined : "Confira os campos e tente de novo.") })
        return
      }
      setEstado({ fase: "editando", erros: {}, alerta: data?.mensagem ?? "Não conseguimos registrar seu pedido agora. Nada foi salvo. Tente de novo em instantes." })
    } catch {
      setEstado({ fase: "editando", erros: {}, alerta: "Sem conexão com o servidor. Seu pedido não foi enviado. Confira a internet e tente de novo." })
    }
  }

  if (estado.fase === "recebida") {
    return <div className="gl-confirm" aria-live="polite">
      <h3 ref={confirmRef} tabIndex={-1}>{estado.repetida ? "Seu pedido já estava registrado" : "Pedido de teste recebido"}</h3>
      <div className="gl-confirm__body">
        <div className="gl-receipt" aria-hidden="true"><div className="gl-receipt__paper">
          <div className="gl-receipt__head"><strong>OmniGestão Pro</strong>Pedido de teste</div>
          <ul className="gl-receipt__rows"><li><span>Protocolo</span><span>{estado.protocolo}</span></li><li><span>Situação</span><span>Recebido</span></li></ul>
          <div className="gl-receipt__foot">Acesso ainda não criado</div>
        </div></div>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <p>Protocolo <span className="gl-confirm__protocol" data-testid="protocolo">{estado.protocolo}</span></p>
          <p>{estado.repetida
            ? "Já havia um pedido aberto com este email. Mantivemos o mesmo protocolo e não criamos outro."
            : "Seu pedido foi registrado. O acesso ainda não foi criado: nossa equipe libera a sua loja no contato."}</p>
          <p>Vamos falar com você pelo WhatsApp <strong>{estado.whatsapp}</strong> ou pelo email <strong style={{ overflowWrap: "anywhere" }}>{estado.email}</strong>. Se precisar falar com a equipe, informe o protocolo.</p>
          <button type="button" className="gl-btn gl-btn--ghost gl-btn--sm" style={{ justifySelf: "start" }} onClick={() => setEstado({ fase: "editando", erros: {} })}>Enviar outro pedido</button>
        </div>
      </div>
    </div>
  }

  const erros = estado.fase === "editando" ? estado.erros : {}
  const enviando = estado.fase === "enviando"
  const campo = (nome: keyof Campos) => ({
    id: `${id}-${nome}`, name: nome, "aria-invalid": erros[nome] ? true : undefined,
    "aria-describedby": erros[nome] ? `${id}-${nome}-erro` : undefined,
  })
  const erro = (nome: keyof Campos) => erros[nome] ? <span id={`${id}-${nome}-erro`} className="gl-field__error">{erros[nome]}</span> : null

  return <form ref={formRef} className="gl-form" noValidate onSubmit={enviar} aria-describedby={`${id}-obrig`}>
    <p id={`${id}-obrig`} className="gl-form__fine">Todos os campos são obrigatórios, menos a mensagem.</p>
    {estado.fase === "editando" && estado.alerta && <div ref={alertaRef} tabIndex={-1} role="alert" className="gl-form__alert">{estado.alerta}</div>}
    <div className="gl-form__row">
      <div className="gl-field"><label htmlFor={`${id}-nome`}>Seu nome</label><input className="gl-input" autoComplete="name" maxLength={120} required {...campo("nome")} />{erro("nome")}</div>
      <div className="gl-field"><label htmlFor={`${id}-nomeLoja`}>Nome da loja</label><input className="gl-input" autoComplete="organization" maxLength={160} required {...campo("nomeLoja")} />{erro("nomeLoja")}</div>
    </div>
    <div className="gl-form__row">
      <div className="gl-field"><label htmlFor={`${id}-email`}>Email</label><input className="gl-input" type="email" autoComplete="email" inputMode="email" maxLength={254} required {...campo("email")} />{erro("email")}</div>
      <div className="gl-field"><label htmlFor={`${id}-whatsapp`}>WhatsApp com DDD</label><input className="gl-input" type="tel" autoComplete="tel-national" inputMode="tel" maxLength={30} placeholder="(11) 91234-5678" required {...campo("whatsapp")} />{erro("whatsapp")}</div>
    </div>
    <div className="gl-form__row">
      <div className="gl-field"><label htmlFor={`${id}-ramo`}>Tipo de loja</label>
        <select className="gl-input" required defaultValue="" {...campo("ramo")}>
          <option value="" disabled>Escolha uma opção</option>
          {Object.entries(RAMOS_SOLICITACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>{erro("ramo")}</div>
      {exibirPlanos && <div className="gl-field"><label htmlFor={`${id}-plano`}>Plano de interesse</label>
        <select id={`${id}-plano`} className="gl-input" value={plano} onChange={(e) => setPlano(e.target.value)}>
          <option value="">Ainda não sei</option>
          {PLANOS_GESTAO_LOJAS.map((p) => <option key={p.id} value={p.id}>{p.nome} ({formatarPrecoMensal(p.precoMensalCentavos)}/mês, proposta)</option>)}
        </select></div>}
    </div>
    <div className="gl-field"><label htmlFor={`${id}-mensagem`}>Mensagem <small>(opcional)</small></label><textarea className="gl-input" id={`${id}-mensagem`} name="mensagem" maxLength={1000} placeholder="Ex.: uso impressora térmica, tenho 2 caixas, vendo por código de barras." /></div>
    <div className="gl-trap" aria-hidden="true"><label htmlFor={`${id}-site`}>Não preencha este campo</label><input id={`${id}-site`} name="site" tabIndex={-1} autoComplete="off" /></div>
    <div className="gl-field">
      <div className="gl-consent"><input type="checkbox" required {...campo("consentimento")} /><label htmlFor={`${id}-consentimento`} style={{ fontWeight: 400 }}>Concordo que a equipe do OmniGestão Pro use estes dados para falar comigo sobre o teste, conforme a <a href="/privacy">política de privacidade</a>.</label></div>
      {erro("consentimento")}
    </div>
    <button type="submit" className="gl-btn gl-btn--primary" disabled={enviando} aria-disabled={enviando || undefined}>{enviando ? "Enviando pedido…" : "Enviar pedido de teste"}</button>
    <p className="gl-form__fine">Enviar o pedido não gera cobrança e não cria conta.</p>
  </form>
}

/** Botão "Pedir teste" de um plano: seleciona o plano no formulário e leva até ele. */
export function EscolherPlanoButton({ plano, children }: { plano: string; children: React.ReactNode }) {
  return <a href="#solicitar" className="gl-btn gl-btn--ghost" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ESCOLHER_PLANO, { detail: plano }))}>{children}</a>
}
