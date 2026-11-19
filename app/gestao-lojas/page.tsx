import type { Metadata } from "next"
import Image from "next/image"
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google"
import "@/components/gestao-lojas/gestao-lojas.css"
import { SolicitacaoTesteForm, EscolherPlanoButton } from "@/components/gestao-lojas/SolicitacaoTesteForm"
import { OFERTA_NOME, PLANOS_GESTAO_LOJAS, formatarPrecoMensal, resolverGestaoLojasConfig } from "@/lib/comercial/gestao-lojas-oferta"

/*
 * Página comercial pública "OmniGestão Pro — Vendas e Estoque".
 * OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001 + adendo de design.
 *
 * Regras que esta página carrega (não "melhorar" sem decisão do proprietário):
 * - não anuncia IA, créditos, fiscal, marketplace nem recurso em rollout como pronto;
 * - preço só aparece com GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1 e sempre como proposta;
 * - download do Windows só aparece com URL https do instalador homologado;
 * - sem depoimento, avaliação, número de clientes ou estatística inventada;
 * - todas as telas são capturas reais do sistema com dados fictícios.
 */

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--gl-font-bricolage", display: "swap" })
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--gl-font-plex-mono", display: "swap" })

const TITULO = "Sistema de vendas, caixa e estoque para lojas | OmniGestão Pro"
const DESCRICAO = "PDV, caixa, estoque, clientes e comprovantes para lojas de variedades, acessórios e pequenos comércios. Funciona no navegador. Peça um teste acompanhado pela nossa equipe."

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/gestao-lojas" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", title: OFERTA_NOME, description: DESCRICAO, url: "/gestao-lojas", siteName: "OmniGestão Pro" },
  twitter: { card: "summary_large_image", title: OFERTA_NOME, description: DESCRICAO },
}

export const dynamic = "force-static"

function Tela({ src, alt, legenda, prioridade = false, largura = 1440, altura = 900 }: { src: string; alt: string; legenda: string; prioridade?: boolean; largura?: number; altura?: number }) {
  return <figure className="gl-shot">
    <div className="gl-shot__frame">
      <div className="gl-shot__bar" aria-hidden="true"><i /><i /><i /></div>
      <Image src={src} alt={alt} width={largura} height={altura} priority={prioridade} sizes="(min-width: 1024px) 680px, 100vw" />
    </div>
    <figcaption>{legenda}</figcaption>
  </figure>
}

function ComprovanteExemplo() {
  return <div className="gl-receipt" role="img" aria-label="Exemplo de comprovante com dados fictícios: 3 itens, total R$ 62,30 pago no Pix."><div className="gl-receipt__paper">
    <div className="gl-receipt__head" aria-hidden="true"><strong>Loja Exemplo</strong>Comprovante de venda</div>
    <ul className="gl-receipt__rows" aria-hidden="true">
      <li><span>Caderno 10 mat.</span><span>24,90</span></li>
      <li><span>3 x Caneta azul</span><span>7,50</span></li>
      <li><span>Cabo USB-C 1 m</span><span>29,90</span></li>
    </ul>
    <div className="gl-receipt__total" aria-hidden="true"><span>Total</span><span>R$ 62,30</span></div>
    <div className="gl-receipt__foot" aria-hidden="true">Pago no Pix<br />Exemplo com dados fictícios</div>
  </div></div>
}

const SEGMENTOS = [
  { nome: "Lojas de variedades", detalhe: "Muitos produtos, venda rápida no balcão.", ok: true },
  { nome: "Lojas de acessórios", detalhe: "Capas, cabos, películas e carregadores.", ok: true },
  { nome: "Pequenos comércios", detalhe: "Mercearias, papelarias, presentes.", ok: true },
  { nome: "Lojas de roupas", detalhe: "Venda simples já funciona. Grade de tamanho e cor ainda está em liberação.", ok: false },
  { nome: "Padarias", detalhe: "Venda por unidade já funciona. Venda por peso (kg) ainda está em liberação.", ok: false },
] as const

const DUVIDAS = [
  { p: "Preciso instalar alguma coisa?", r: "Não. O sistema funciona no navegador (Chrome ou Edge) do computador da loja. Uma versão para instalar no Windows está em homologação e aparece nesta página quando for liberada." },
  { p: "Como funciona o teste?", r: "Você envia o pedido nesta página. Nossa equipe entra em contato, cria o acesso da sua loja e acompanha os primeiros usos. Nada é cobrado sem que você contrate." },
  { p: "Funciona com a minha impressora?", r: "O comprovante pode ser impresso pela impressora configurada no computador da loja. Nem todo modelo é compatível: conferimos o seu durante o teste, antes de qualquer contratação." },
  { p: "O sistema emite nota fiscal?", r: "Não nesta oferta. A emissão de nota fiscal ainda está em homologação e não faz parte do plano Vendas e Estoque." },
  { p: "Quantas pessoas podem usar?", r: "Cada pessoa da loja tem login e senha próprios, com permissão de caixa, vendedor, gerente ou administrador. O número de pessoas por plano é combinado na contratação." },
  { p: "Os dados da minha loja ficam separados?", r: "Sim. Cada loja tem acesso próprio, e quem é de uma loja não vê os dados de outra. Veja a política de privacidade para saber como tratamos os dados." },
] as const

export default function GestaoLojasPage() {
  const config = resolverGestaoLojasConfig()
  return <div className={`gl ${display.variable} ${mono.variable}`}>
    <a className="gl-skip" href="#conteudo">Pular para o conteúdo</a>

    <header className="gl-header">
      <div className="gl-wrap gl-header__bar">
        <a className="gl-brand" href="/gestao-lojas" aria-label="OmniGestão Pro, Vendas e Estoque, início da página">
          <Image src="/omni-gestao-pro-icon.svg" alt="" width={34} height={34} />
          <span className="gl-brand__name">OmniGestão Pro<span>Vendas e Estoque</span></span>
        </a>
        <nav className="gl-nav" aria-label="Seções da página">
          <a href="#recursos">Recursos</a>
          <a href="#windows">Navegador e Windows</a>
          <a href="#planos">Planos</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className="gl-header__actions">
          <a className="gl-header__login" href="/login">Entrar</a>
          <a className="gl-btn gl-btn--primary gl-btn--sm gl-header__cta" href="#solicitar">Pedir teste</a>
        </div>
      </div>
    </header>

    <main id="conteudo">
      {/* A) Apresentação */}
      <section className="gl-hero" aria-labelledby="gl-titulo">
        <div className="gl-wrap gl-hero__grid">
          <div style={{ minWidth: 0 }}>
            <h1 id="gl-titulo">O balcão da sua loja, organizado.</h1>
            <p className="gl-hero__lead">Venda no caixa, controle o estoque e saiba quem compra de você. Um sistema simples para lojas de variedades, acessórios e pequenos comércios.</p>
            <div className="gl-hero__actions">
              <a className="gl-btn gl-btn--primary" href="#solicitar">Pedir um teste</a>
              <a className="gl-btn gl-btn--ghost" href="#recursos">Ver o sistema</a>
            </div>
            <p className="gl-hero__note">Funciona no navegador. A equipe libera o acesso e acompanha o começo.</p>
          </div>
          <div className="gl-hero__visual">
            <Tela src="/gestao-lojas/pdv.png" prioridade largura={1216} altura={480} alt="Tela real do PDV do OmniGestão Pro com produtos fictícios no carrinho e o total da venda." legenda="Tela real do PDV, com produtos fictícios." />
            <ComprovanteExemplo />
          </div>
        </div>
      </section>

      {/* B) Benefícios */}
      <section className="gl-section gl-section--line" aria-labelledby="gl-beneficios">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-beneficios">Feito para quem está no balcão</h2><p>Menos tempo com caderno e planilha, mais controle do que entra e sai da loja.</p></div>
          <ul className="gl-benefits">
            <li><h3>Venda sem complicação</h3><p>Busque pelo nome ou leia o código de barras, escolha a forma de pagamento e finalize.</p></li>
            <li><h3>Estoque que acompanha a venda</h3><p>Cada venda dá baixa no estoque do produto. Você vê o que está acabando antes de faltar.</p></li>
            <li><h3>Caixa conferido no fim do dia</h3><p>Abertura, sangria, suprimento e fechamento com o total de cada forma de pagamento.</p></li>
          </ul>
        </div>
      </section>

      {/* C–F) Recursos */}
      <section id="recursos" className="gl-section gl-section--line" aria-labelledby="gl-recursos">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-recursos">O que você usa no dia a dia</h2><p>As telas abaixo são do sistema de verdade, preenchidas com dados fictícios.</p></div>

          <article className="gl-feature" aria-labelledby="gl-pdv">
            <div className="gl-feature__text">
              <h3 id="gl-pdv">PDV e controle de caixa</h3>
              <p>A tela de venda foi pensada para o atendimento rápido, com teclado ou leitor de código de barras.</p>
              <ul className="gl-checks">
                <li>Dinheiro, Pix, cartão de débito e crédito, ou venda a prazo para o cliente.</li>
                <li>Abertura e fechamento do caixa com conferência por forma de pagamento.</li>
                <li>Histórico de vendas para consultar o que foi vendido.</li>
              </ul>
            </div>
            <Tela src="/gestao-lojas/caixa.png" largura={1264} altura={878} alt="Tela real de fechamento de caixa do OmniGestão Pro: recebido por forma de pagamento e dinheiro esperado na gaveta, com dados fictícios." legenda="Fechamento do caixa conferido por forma de pagamento, com dados fictícios." />
          </article>

          <article className="gl-feature gl-feature--flip" aria-labelledby="gl-estoque">
            <div className="gl-feature__text">
              <h3 id="gl-estoque">Produtos e estoque</h3>
              <p>Cadastre produtos com preço, código de barras e categoria. O estoque é atualizado a cada venda.</p>
              <ul className="gl-checks">
                <li>Entrada e ajuste de estoque registrados como movimentação.</li>
                <li>Aviso de produto com estoque baixo.</li>
                <li>Categorias para organizar o que a loja vende.</li>
              </ul>
            </div>
            <Tela src="/gestao-lojas/estoque.png" alt="Tela real de produtos e estoque do OmniGestão Pro com itens fictícios." legenda="Produtos e estoque, com itens fictícios." />
          </article>

          <article className="gl-feature" aria-labelledby="gl-clientes">
            <div className="gl-feature__text">
              <h3 id="gl-clientes">Clientes e histórico</h3>
              <p>Guarde o contato de quem compra e veja o que cada cliente já levou.</p>
              <ul className="gl-checks">
                <li>Cadastro com nome, telefone, email e CPF ou CNPJ.</li>
                <li>Compras do cliente reunidas no histórico.</li>
                <li>Venda a prazo ligada ao cliente certo.</li>
              </ul>
            </div>
            <Tela src="/gestao-lojas/clientes.png" alt="Tela real de clientes do OmniGestão Pro com cadastros fictícios." legenda="Clientes, com cadastros fictícios." />
          </article>

          <article className="gl-feature gl-feature--flip" aria-labelledby="gl-impressao">
            <div className="gl-feature__text">
              <h3 id="gl-impressao">Comprovantes e impressão</h3>
              <p>Ao finalizar a venda, imprima o comprovante para entregar ao cliente.</p>
              <ul className="gl-checks">
                <li>Comprovante não fiscal com itens, total e forma de pagamento.</li>
                <li>Impressão pela impressora configurada no computador da loja.</li>
                <li>Compatibilidade do seu modelo conferida durante o teste.</li>
              </ul>
            </div>
            <div style={{ display: "grid", placeItems: "center", minWidth: 0, paddingBlock: "1rem" }}><ComprovanteExemplo /></div>
          </article>
        </div>
      </section>

      {/* Para quem é */}
      <section className="gl-section gl-section--line" aria-labelledby="gl-para-quem">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-para-quem">Para que tipo de loja</h2><p>Dizemos com clareza o que já está pronto e o que ainda está sendo liberado.</p></div>
          <ul className="gl-segments">
            {SEGMENTOS.map((s) => <li key={s.nome}>
              <div style={{ minWidth: 0 }}><strong>{s.nome}</strong><small>{s.detalhe}</small></div>
              <span className={`gl-status ${s.ok ? "gl-status--ok" : "gl-status--wait"}`}>{s.ok ? "Disponível" : "Em liberação"}</span>
            </li>)}
          </ul>
        </div>
      </section>

      {/* G) Navegador ou Windows */}
      <section id="windows" className="gl-section gl-section--line" aria-labelledby="gl-windows">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-windows">No navegador ou no Windows</h2><p>Use no computador que a loja já tem.</p></div>
          <div className="gl-access">
            <div className="gl-access__option">
              <h3>Usar pelo navegador</h3>
              <p>Abra no Chrome ou no Edge e entre com o email e a senha da sua loja. Não precisa instalar nada.</p>
              <a className="gl-btn gl-btn--primary" href="/login">Entrar pelo navegador</a>
            </div>
            <div className="gl-access__option">
              <h3>Baixar para Windows</h3>
              {config.downloadWindowsUrl
                ? <><p>Instalador oficial para Windows 10 e 11, com impressão direta na impressora da loja.</p><a className="gl-btn gl-btn--primary" href={config.downloadWindowsUrl} rel="noopener">Baixar para Windows</a></>
                : <><p>O instalador para Windows está em homologação. Quando for liberado, o download oficial aparece aqui. Até lá, use pelo navegador.</p><span className="gl-btn" aria-disabled="true">Download ainda não liberado</span></>}
            </div>
          </div>
          <p className="gl-printer"><strong>Sobre a impressora:</strong> a impressora fica instalada no computador da loja. Conferimos com você se o seu modelo funciona antes de qualquer contratação.</p>
        </div>
      </section>

      {/* H) Planos */}
      <section id="planos" className="gl-section gl-section--line" aria-labelledby="gl-planos">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-planos">Planos e mensalidade</h2><p>Mensalidade simples, sem recursos de inteligência artificial ou créditos para comprar.</p></div>
          {config.exibirPrecosPropostos
            ? <>
              <p className="gl-proposal" role="note">Valores em avaliação. Ainda não estão à venda.</p>
              <ul className="gl-plans">
                {PLANOS_GESTAO_LOJAS.map((p) => <li key={p.id} className="gl-plan">
                  <h3>{p.nome}</h3>
                  <p className="gl-plan__price">{formatarPrecoMensal(p.precoMensalCentavos)} <small>por mês</small></p>
                  <p>{p.resumo} Proposta: {p.operadoresPropostos === 1 ? "1 pessoa no caixa" : `${p.operadoresPropostos} pessoas no caixa`}.</p>
                  <EscolherPlanoButton plano={p.id}>Pedir teste do {p.nome}</EscolherPlanoButton>
                </li>)}
              </ul>
              <p className="gl-plans__note">Todos os planos incluem PDV, caixa, estoque, clientes e comprovantes. Os valores e o número de pessoas por plano são propostas e podem mudar antes do lançamento.</p>
            </>
            : <div className="gl-price-consult">
              <p>Os planos de Vendas e Estoque estão em definição. Informamos o valor da mensalidade no contato, de acordo com o tamanho da sua loja, antes de qualquer cobrança.</p>
              <a className="gl-btn gl-btn--primary" href="#solicitar" style={{ justifySelf: "start" }}>Pedir um teste</a>
            </div>}
        </div>
      </section>

      {/* I) Solicitação real de teste */}
      <section id="solicitar" className="gl-request" aria-labelledby="gl-solicitar">
        <div className="gl-wrap gl-request__grid">
          <div className="gl-request__intro">
            <h2 id="gl-solicitar">Peça um teste para a sua loja</h2>
            <p>Leva um minuto. Sem cartão e sem compromisso.</p>
            <ol className="gl-steps">
              <li><span><strong>Você envia o pedido</strong>Recebe um protocolo na hora.</span></li>
              <li><span><strong>Nossa equipe fala com você</strong>Pelo WhatsApp ou email que você informar.</span></li>
              <li><span><strong>Liberamos o acesso da loja</strong>Você entra com email e senha e começa a usar.</span></li>
            </ol>
          </div>
          <SolicitacaoTesteForm exibirPlanos={config.exibirPrecosPropostos} />
        </div>
      </section>

      {/* J) Dúvidas */}
      <section id="duvidas" className="gl-section" aria-labelledby="gl-duvidas">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-duvidas">Dúvidas frequentes</h2></div>
          <div className="gl-faq">
            {DUVIDAS.map((d) => <details key={d.p}><summary>{d.p}</summary><div><p>{d.r}</p></div></details>)}
          </div>
        </div>
      </section>

      {/* K) Contato e suporte */}
      <section className="gl-section gl-section--line" aria-labelledby="gl-contato">
        <div className="gl-wrap">
          <div className="gl-section__head"><h2 id="gl-contato">Contato comercial e suporte</h2></div>
          <div className="gl-contact">
            <div><h3>Quero conhecer</h3><p>O pedido de teste é o nosso canal comercial: respondemos pelo contato que você deixar.</p><a href="#solicitar">Fazer o pedido de teste</a></div>
            <div><h3>Falar direto</h3>
              {config.contatoWhatsapp || config.contatoEmail
                ? <>{config.contatoWhatsapp && <a href={`https://wa.me/${config.contatoWhatsapp}`} rel="noopener">WhatsApp comercial</a>}{config.contatoEmail && <a href={`mailto:${config.contatoEmail}`}>{config.contatoEmail}</a>}</>
                : <p>Os canais diretos são enviados no contato da equipe, junto com o acesso da loja.</p>}
            </div>
            <div><h3>Já sou cliente</h3><p>Entre no sistema com o email e a senha da sua loja.</p><a href="/login">Entrar no sistema</a></div>
          </div>
        </div>
      </section>
    </main>

    {/* L) Privacidade e termos */}
    <footer className="gl-footer">
      <div className="gl-wrap gl-footer__grid">
        <div>
          <p><strong style={{ color: "var(--gl-ink)" }}>{OFERTA_NOME}</strong></p>
          <p>Os termos de uso são enviados junto com a proposta, antes da contratação.</p>
        </div>
        <nav aria-label="Rodapé">
          <ul>
            <li><a href="/privacy">Política de privacidade</a></li>
            <li><a href="#duvidas">Dúvidas</a></li>
            <li><a href="/login">Entrar</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  </div>
}
