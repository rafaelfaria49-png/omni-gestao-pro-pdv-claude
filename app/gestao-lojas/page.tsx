import type { Metadata } from "next"
import Image from "next/image"
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google"
import "@/components/gestao-lojas/gestao-lojas.css"
import { GestaoLojasHeader } from "@/components/gestao-lojas/GestaoLojasHeader"
import { HeroStage } from "@/components/gestao-lojas/HeroStage"
import { SistemaShowcase } from "@/components/gestao-lojas/SistemaShowcase"
import { SolicitacaoTesteForm } from "@/components/gestao-lojas/SolicitacaoTesteForm"
import { MobileStickyBar } from "@/components/gestao-lojas/MobileStickyBar"
import {
  OFERTA_COMERCIAL_GESTAO_LOJAS,
  OFERTA_NOME,
  formatarPrecoMensal,
  formatarWhatsappComercial,
  linkWhatsappComercial,
  resolverGestaoLojasConfig,
} from "@/lib/comercial/gestao-lojas-oferta"

/*
 * Página comercial pública "OmniGestão Pro — Vendas e Estoque" (/gestao-lojas).
 * OMNI-GESTAO-LOJAS-LANDING-PREMIUM-INTEGRACAO-001.
 *
 * Regras comerciais e de honestidade:
 * - oferta única autorizada: R$ 69,90/mês, até 2 usuários por loja, 7 dias de teste gratuito acompanhado;
 * - cobrança, acompanhamento e liberação de acesso são manuais pela equipe (sem checkout nem ativação automática);
 * - contato de WhatsApp/email lido exclusivamente das chaves GESTAO_LOJAS_CONTATO_* (falha fechado);
 * - canal único para opções de instalação no computador (Windows/PWA): /baixar (sem link .exe direto);
 * - não anuncia IA, créditos, fiscal, marketplace nem recurso indisponível;
 * - sem depoimentos, clientes ou estatísticas inventadas; capturas reais do sistema com dados fictícios.
 */

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--gl-font-jakarta",
  display: "swap",
})
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--gl-font-plex-mono",
  display: "swap",
})

const TITULO = "Sistema de vendas, caixa e estoque para lojas | OmniGestão Pro"
const DESCRICAO =
  "PDV, caixa, produtos, estoque, clientes e relatórios para lojas de variedades, acessórios e pequenos comércios. R$ 69,90/mês com até 2 usuários e 7 dias de teste grátis acompanhado pela equipe."

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/gestao-lojas" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: OFERTA_NOME,
    description: DESCRICAO,
    url: "/gestao-lojas",
    siteName: "OmniGestão Pro",
  },
  twitter: { card: "summary_large_image", title: OFERTA_NOME, description: DESCRICAO },
}

export const dynamic = "force-static"

const SEGMENTOS = [
  { nome: "Lojas de variedades", detalhe: "Muitos produtos no mix, busca rápida e leitura ágil no balcão.", ok: true },
  { nome: "Lojas de acessórios", detalhe: "Capas, cabos, películas, carregadores e controle de giro diário.", ok: true },
  { nome: "Pequenos comércios", detalhe: "Papelarias, mercearias, lojas de presentes e comércio de bairro.", ok: true },
  { nome: "Lojas de roupas", detalhe: "Venda simples já funciona. Grade de tamanho e cor ainda está em liberação.", ok: false },
  { nome: "Padarias", detalhe: "Venda por unidade já funciona. Venda por peso (kg) ainda está em liberação.", ok: false },
] as const

const MODULOS_INCLUSOS = [
  "PDV ágil para balcão",
  "Abertura e fechamento de caixa",
  "Cadastro de produtos e categorias",
  "Estoque com baixa automática",
  "Clientes e histórico de compras",
  "Relatórios operacionais",
  "Comprovante não fiscal",
  "Acesso pelo navegador (Chrome/Edge)",
] as const

const DUVIDAS = [
  {
    p: "Preciso instalar alguma coisa no computador da loja?",
    r: "Não é obrigatório. O sistema funciona direto no navegador (Google Chrome ou Microsoft Edge) do computador da loja. A página Instalar no computador (/baixar) reúne as opções disponíveis para o computador e mostra a situação do instalador nativo para Windows, que segue em homologação.",
  },
  {
    p: "Como funcionam os 7 dias de teste gratuito acompanhado?",
    r: "Você envia o pedido nesta página e recebe um protocolo. Nossa equipe entra em contato pelo WhatsApp ou email informado, cria o acesso da sua loja e acompanha os primeiros usos durante 7 dias. Nada é cobrado automaticamente sem a sua contratação.",
  },
  {
    p: "Qual é o valor da mensalidade e quantas pessoas podem usar?",
    r: "O plano OmniGestão Pro — Vendas e Estoque custa R$ 69,90 por mês e inclui até 2 usuários por loja, cada pessoa com login, senha e permissão própria de caixa, vendedor, gerente ou administrador. A contratação e a cobrança são combinadas diretamente com a equipe.",
  },
  {
    p: "Funciona com a minha impressora de comprovante?",
    r: "O comprovante não fiscal pode ser impresso pela impressora configurada no computador da loja. Como nem todo modelo tem o mesmo comportamento no navegador, conferimos o seu durante o teste acompanhado, antes de qualquer contratação.",
  },
  {
    p: "O sistema emite nota fiscal (NF-e / NFC-e)?",
    r: "Não nesta oferta. A emissão de nota fiscal ainda está em homologação e não faz parte do plano Vendas e Estoque.",
  },
  {
    p: "Os dados da minha loja ficam separados de outras lojas?",
    r: "Sim. Cada loja tem ambiente e acesso próprios, e quem é de uma loja não vê os dados de outra. Veja a política de privacidade para saber como tratamos os dados.",
  },
] as const

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function WhatsappIcon({ stroke = "currentColor" }: { stroke?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

export default function GestaoLojasPage() {
  const config = resolverGestaoLojasConfig()
  const precoFormatado = formatarPrecoMensal(OFERTA_COMERCIAL_GESTAO_LOJAS.precoMensalCentavos)
  const precoNumero = (OFERTA_COMERCIAL_GESTAO_LOJAS.precoMensalCentavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const waHref = config.contatoWhatsapp
    ? linkWhatsappComercial(config.contatoWhatsapp, "Olá! Quero conhecer o OmniGestão Pro — Vendas e Estoque.")
    : null
  const waFormatado = config.contatoWhatsapp ? formatarWhatsappComercial(config.contatoWhatsapp) : null

  return (
    <div className={`gl ${display.variable} ${mono.variable}`}>
      <a className="gl-skip" href="#conteudo">
        Pular para o conteúdo
      </a>

      <GestaoLojasHeader contatoWhatsapp={config.contatoWhatsapp} />

      <main id="conteudo">
        {/* 1. Hero Executivo */}
        <section className="gl-hero gl-dark-zone" aria-labelledby="gl-titulo">
          <div className="gl-wrap gl-hero__grid">
            <div style={{ minWidth: 0 }}>
              <div className="gl-eyebrow">
                <span className="gl-eyebrow__dot" aria-hidden="true" />
                Acesso pelo navegador · {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias de teste grátis acompanhado
              </div>

              <h1 id="gl-titulo">
                O balcão da sua loja, <span>sob controle profissional.</span>
              </h1>

              <p className="gl-hero__lead">
                PDV ágil, fechamento de caixa conferido, produtos, estoque, clientes e relatórios em um único sistema pensado para lojas de variedades, acessórios e pequenos comércios.
              </p>

              <div className="gl-hero__facts" aria-label="Resumo da oferta comercial">
                <div className="gl-fact">
                  <strong>{precoFormatado}</strong>
                  <span>por mês · plano único</span>
                </div>
                <div className="gl-fact">
                  <strong>Até {OFERTA_COMERCIAL_GESTAO_LOJAS.usuariosInclusos}</strong>
                  <span>usuários por loja</span>
                </div>
                <div className="gl-fact">
                  <strong>{OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias</strong>
                  <span>grátis acompanhados</span>
                </div>
              </div>

              <div className="gl-hero__actions">
                <a className="gl-btn gl-btn--primary" href="#solicitar">
                  Pedir {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias de teste grátis
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </a>
                {waHref ? (
                  <a className="gl-btn gl-btn--glass" href={waHref} target="_blank" rel="noopener noreferrer">
                    <WhatsappIcon stroke="#6ee7b7" />
                    Falar no WhatsApp
                  </a>
                ) : (
                  <a className="gl-btn gl-btn--glass" href="#sistema">
                    Ver o sistema
                  </a>
                )}
              </div>

              <p className="gl-hero__note">
                <span>
                  <CheckIcon />
                  Sem instalar nada
                </span>
                <span>
                  <CheckIcon />
                  Sem cartão para testar
                </span>
                <span>
                  <CheckIcon />
                  Liberação feita pela equipe
                </span>
              </p>
            </div>

            <HeroStage />
          </div>
        </section>

        {/* 2. Benefícios operacionais */}
        <section className="gl-section gl-section--white" aria-labelledby="gl-beneficios">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Operação diária</span>
              <h2 id="gl-beneficios">Feito para quem está no balcão o dia inteiro</h2>
              <p>Menos tempo com caderno e planilhas paralelas. Mais clareza sobre cada venda, cada produto na prateleira e o fechamento do dia.</p>
            </div>

            <ul className="gl-pillars">
              <li className="gl-pillar">
                <div className="gl-pillar__icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14" />
                  </svg>
                </div>
                <h3>Venda sem complicação</h3>
                <p>Leia o código de barras ou busque pelo nome, use atalhos de teclado (F1, F2, F12), escolha a forma de pagamento e finalize no balcão.</p>
              </li>

              <li className="gl-pillar">
                <div className="gl-pillar__icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
                  </svg>
                </div>
                <h3>Estoque que acompanha a venda</h3>
                <p>Cada venda dá baixa automática no produto. Entradas e ajustes ficam registrados como movimentação, com aviso visual de estoque baixo.</p>
              </li>

              <li className="gl-pillar">
                <div className="gl-pillar__icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20M6 15h4" />
                  </svg>
                </div>
                <h3>Caixa conferido no fim do dia</h3>
                <p>Abertura, sangria, suprimento e fechamento detalhado por Dinheiro, Pix, Débito e Crédito — mostrando quanto deve estar na gaveta.</p>
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Vitrine interativa de telas reais */}
        <section id="sistema" className="gl-section gl-section--steel" aria-labelledby="gl-sistema">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Conheça o sistema por dentro</span>
              <h2 id="gl-sistema">Telas reais do OmniGestão Pro no dia a dia</h2>
              <p>Explore os módulos abaixo. Todas as imagens são capturas reais do sistema em funcionamento, preenchidas com dados fictícios.</p>
            </div>

            <SistemaShowcase />
          </div>
        </section>

        {/* 4. Para que tipo de loja */}
        <section id="para-quem" className="gl-section gl-section--white" aria-labelledby="gl-para-quem">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Transparência comercial</span>
              <h2 id="gl-para-quem">Para que tipo de loja o sistema já está pronto</h2>
              <p>Dizemos com clareza o que já opera hoje e quais recursos específicos ainda estão sendo liberados.</p>
            </div>

            <ul className="gl-segments">
              {SEGMENTOS.map((s) => (
                <li key={s.nome}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{s.nome}</strong>
                    <small>{s.detalhe}</small>
                  </div>
                  <span className={`gl-status ${s.ok ? "gl-status--ok" : "gl-status--wait"}`}>
                    {s.ok ? "Disponível" : "Em liberação"}
                  </span>
                </li>
              ))}
            </ul>

            <p className="gl-honesty-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" style={{ flex: "none", marginTop: 2 }} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Sem promessas fora da realidade: você testa na prática durante {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias acompanhados para validar na rotina da sua loja.
            </p>
          </div>
        </section>

        {/* 5. Acesso — Navegador e canal único /baixar (conciliado com PR #385) */}
        <section id="acesso" className="gl-section gl-section--steel" aria-labelledby="gl-acesso">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Acesso simples</span>
              <h2 id="gl-acesso">Use direto pelo navegador, no computador que a loja já tem</h2>
              <p>Sem servidor local na loja e com canal oficial dedicado para as opções no computador.</p>
            </div>

            <div className="gl-access">
              <article className="gl-access-card gl-access-card--active">
                <span className="gl-status gl-status--ok" style={{ width: "fit-content" }}>
                  Disponível hoje
                </span>
                <h3>Usar pelo navegador</h3>
                <p>
                  Abra no Google Chrome ou Microsoft Edge no computador do balcão e entre com o email e a senha liberados para sua loja. Não precisa instalar nada.
                </p>
                <div className="gl-access-card__actions">
                  <a className="gl-btn gl-btn--navy gl-btn--sm" href="/login">
                    Entrar pelo navegador
                  </a>
                  <a className="gl-btn gl-btn--outline gl-btn--sm" href="#solicitar">
                    Pedir teste
                  </a>
                </div>
              </article>

              <article className="gl-access-card gl-access-card--muted">
                <span className="gl-status gl-status--wait" style={{ width: "fit-content" }}>
                  Windows em homologação
                </span>
                <h3>Instalar no computador</h3>
                <p>
                  O instalador nativo para Windows 10 e 11 segue em homologação e ainda não tem download público liberado. A página oficial mostra o que já está disponível para o computador e a situação da homologação.
                </p>
                <div className="gl-access-card__actions">
                  <a className="gl-btn gl-btn--outline gl-btn--sm" href="/baixar">
                    Ver opções em Instalar no computador
                  </a>
                </div>
              </article>
            </div>

            <div className="gl-printer-note">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" style={{ flex: "none", marginTop: 2 }} aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <p>
                <strong>Sobre a impressora da loja:</strong> o comprovante utiliza a impressora já instalada no computador do balcão. Conferimos com você se o seu modelo funciona durante o teste acompanhado, antes de qualquer contratação.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Oferta Comercial Autorizada — Plano único R$ 69,90/mês */}
        <section id="oferta" className="gl-section gl-section--white" aria-labelledby="gl-oferta">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Oferta comercial</span>
              <h2 id="gl-oferta">Um plano único, claro e sem surpresas na mensalidade</h2>
              <p>Mensalidade direta, sem recursos de inteligência artificial nem compra de créditos extras.</p>
            </div>

            <div className="gl-offer-grid">
              <div className="gl-offer-card gl-dark-zone">
                <div className="gl-offer-card__top">
                  <div>
                    <span className="gl-offer-card__label">Plano único</span>
                    <h3>
                      OmniGestão Pro
                      <br />
                      {OFERTA_COMERCIAL_GESTAO_LOJAS.subtitulo}
                    </h3>
                  </div>
                  <Image
                    src="/gestao-lojas/omni-logo-seal.webp"
                    alt="Selo oficial OmniGestão Pro"
                    width={64}
                    height={64}
                    loading="eager"
                    className="gl-offer-seal"
                  />
                </div>

                <div>
                  <div className="gl-offer-price">
                    <span className="gl-offer-price__currency">R$</span>
                    <span className="gl-offer-price__value">{precoNumero}</span>
                    <span className="gl-offer-price__period">/ mês</span>
                  </div>
                  <div className="gl-offer-highlights">
                    <span className="gl-offer-tag">{OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias de teste gratuito acompanhado</span>
                    <span className="gl-offer-tag">Até {OFERTA_COMERCIAL_GESTAO_LOJAS.usuariosInclusos} usuários por loja</span>
                  </div>
                </div>

                <ul className="gl-offer-list">
                  {MODULOS_INCLUSOS.map((item) => (
                    <li key={item}>
                      <CheckIcon />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
                  <a className="gl-btn gl-btn--primary" href="#solicitar">
                    Pedir {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias de teste grátis
                  </a>
                  <p className="gl-offer-fine">
                    Sem cobrança automática e sem checkout automático. Contratação e mensalidade são combinadas com a equipe só se você decidir continuar após o teste.
                  </p>
                </div>
              </div>

              <div className="gl-trial-panel">
                <div>
                  <span className="gl-kicker" style={{ marginBottom: 6 }}>
                    Teste assistido pela equipe
                  </span>
                  <h3>Como funciona a liberação do teste</h3>
                  <p style={{ marginTop: 8, fontSize: "14.5px", color: "var(--gl-ink-2)" }}>
                    A conta não é criada sozinha em um painel vazio: nossa equipe acompanha o início da sua loja durante os{" "}
                    {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias gratuitos.
                  </p>
                </div>

                <ol className="gl-steps-light">
                  <li>
                    <div>
                      <strong>Você solicita o teste nesta página</strong>
                      <span>Preenche os dados básicos da loja em menos de um minuto e recebe um protocolo na hora.</span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>Nossa equipe entra em contato</strong>
                      <span>Conversamos pelo WhatsApp ou email informado para alinhar o tipo de loja e tirar dúvidas iniciais.</span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>Liberamos o acesso e acompanhamos {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias</strong>
                      <span>
                        Criamos o ambiente da sua loja (até {OFERTA_COMERCIAL_GESTAO_LOJAS.usuariosInclusos} usuários), conferimos sua impressora e acompanhamos os primeiros usos.
                      </span>
                    </div>
                  </li>
                </ol>

                {waHref && waFormatado ? (
                  <div className="gl-wa-box">
                    <strong>Prefere tirar uma dúvida rápida no WhatsApp?</strong>
                    <p>
                      Fale direto com o atendimento comercial:{" "}
                      <strong style={{ fontFamily: "var(--gl-font-mono)" }}>{waFormatado}</strong>
                    </p>
                    <a className="gl-btn gl-btn--wa gl-btn--sm" style={{ justifySelf: "start" }} href={waHref} target="_blank" rel="noopener noreferrer">
                      <WhatsappIcon />
                      Conversar pelo WhatsApp
                    </a>
                  </div>
                ) : (
                  <div className="gl-wa-box gl-wa-box--neutral">
                    <strong>Prefere tirar dúvidas antes de contratar?</strong>
                    <p>
                      Envie seu pedido abaixo: nossa equipe responde pelo WhatsApp ou email que você informar, antes de qualquer cobrança.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 7. Solicitação real de teste */}
        <section id="solicitar" className="gl-section gl-section--navy gl-dark-zone" aria-labelledby="gl-solicitar">
          <div className="gl-wrap gl-request-grid">
            <div className="gl-request__intro">
              <span className="gl-kicker">Comece com segurança</span>
              <h2 id="gl-solicitar">Peça um teste para a sua loja</h2>
              <p>Leva um minuto. Sem cartão e sem compromisso — o acesso é liberado pela equipe.</p>

              <ol className="gl-steps-dark">
                <li>
                  <div>
                    <strong>Você envia o pedido</strong>
                    Recebe um protocolo registrado na hora.
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Nossa equipe fala com você</strong>
                    Pelo WhatsApp ou email que você informar.
                  </div>
                </li>
                <li>
                  <div>
                    <strong>Liberamos o acesso da loja</strong>
                    Você entra pelo navegador com email e senha e conta com {OFERTA_COMERCIAL_GESTAO_LOJAS.diasTesteGratuito} dias gratuitos acompanhados.
                  </div>
                </li>
              </ol>

              {waHref && waFormatado && (
                <div className="gl-wa-dark-card">
                  <div>
                    <strong>Atendimento comercial direto</strong>
                    <span>WhatsApp: {waFormatado}</span>
                  </div>
                  <a className="gl-btn gl-btn--glass gl-btn--sm" href={waHref} target="_blank" rel="noopener noreferrer">
                    Abrir WhatsApp
                  </a>
                </div>
              )}
            </div>

            <SolicitacaoTesteForm />
          </div>
        </section>

        {/* 8. Dúvidas frequentes */}
        <section id="duvidas" className="gl-section gl-section--white" aria-labelledby="gl-duvidas">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Esclarecimentos diretos</span>
              <h2 id="gl-duvidas">Dúvidas frequentes</h2>
              <p>Respostas objetivas sobre acesso, teste acompanhado, usuários, impressora e escopo do plano.</p>
            </div>

            <div className="gl-faq">
              {DUVIDAS.map((d) => (
                <details key={d.p}>
                  <summary>{d.p}</summary>
                  <div>
                    <p>{d.r}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9. Contato comercial e suporte */}
        <section id="contato" className="gl-section gl-section--steel" aria-labelledby="gl-contato">
          <div className="gl-wrap">
            <div className="gl-section__head">
              <span className="gl-kicker">Canais oficiais</span>
              <h2 id="gl-contato">Contato comercial e acesso ao sistema</h2>
            </div>

            <div className="gl-contact">
              <div>
                <h3>Quero conhecer</h3>
                <p>O pedido de teste é o nosso canal comercial: respondemos pelo contato que você deixar.</p>
                <a href="#solicitar">Fazer o pedido de teste →</a>
              </div>

              <div>
                <h3>Falar direto</h3>
                {waHref || config.contatoEmail ? (
                  <>
                    <p>Converse diretamente com a equipe comercial para tirar dúvidas sobre o sistema ou sua impressora.</p>
                    {waHref && waFormatado && (
                      <a className="gl-contact__wa" href={waHref} target="_blank" rel="noopener noreferrer">
                        WhatsApp {waFormatado} →
                      </a>
                    )}
                    {config.contatoEmail && (
                      <a href={`mailto:${config.contatoEmail}`}>{config.contatoEmail} →</a>
                    )}
                  </>
                ) : (
                  <p>Os canais diretos são enviados no contato da equipe, junto com o acesso da loja.</p>
                )}
              </div>

              <div>
                <h3>Já sou cliente</h3>
                <p>Entre no sistema pelo navegador com o email e a senha da sua loja.</p>
                <a href="/login">Entrar no sistema →</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 10. Rodapé */}
      <footer className="gl-footer gl-dark-zone">
        <div className="gl-wrap gl-footer__grid">
          <div>
            <div className="gl-brand">
              <Image
                src="/gestao-lojas/omni-logo-icon.webp"
                alt=""
                width={32}
                height={32}
                className="gl-brand__icon"
                style={{ width: 32, height: 32 }}
              />
              <span className="gl-brand__text">
                <span className="gl-brand__word" style={{ fontSize: 15 }}>
                  OmniGestão <span className="gl-brand__pro" style={{ fontSize: 10 }}>Pro</span>
                </span>
                <span className="gl-brand__sub">
                  {OFERTA_COMERCIAL_GESTAO_LOJAS.subtitulo} · {precoFormatado}/mês
                </span>
              </span>
            </div>
            <p className="gl-footer__note">
              {OFERTA_NOME}. Os termos de uso são apresentados junto com a proposta, antes da contratação.
              {waFormatado ? ` WhatsApp comercial: ${waFormatado}.` : ""}
            </p>
          </div>

          <nav aria-label="Rodapé">
            <ul>
              <li><a href="/privacy">Política de privacidade</a></li>
              <li><a href="/baixar">Instalar no computador</a></li>
              <li><a href="#duvidas">Dúvidas</a></li>
              <li><a href="/login">Entrar</a></li>
            </ul>
          </nav>
        </div>
      </footer>

      <MobileStickyBar contatoWhatsapp={config.contatoWhatsapp} />
    </div>
  )
}
