# Vendas e Estoque — design system da página comercial

Página: `app/gestao-lojas/page.tsx` · estilos: `components/gestao-lojas/gestao-lojas.css` (todos os tokens sob `.gl`, isolados do ERP).

Atualizado no `GOAL=OMNI-GESTAO-LOJAS-LANDING-PREMIUM-INTEGRACAO-001`.

## Direção visual

- **Identidade oficial:** derivada das logos aprovadas (`omni-logo-icon.webp` e `omni-logo-seal.webp`): azul-marinho profundo (`#061428` / `#0a2240`), azul elétrico (`#0ea5e9` / `#0284c7` / `#38bdf8`) e neutros de aço escovado (`#f8fafc` / `#f1f5f9` / `#e2e8f0`).
- **Elemento-assinatura preservado:** o comprovante térmico com picote serrilhado e tipografia monoespaçada aparece no Hero (sobre o canto inferior do palco do PDV sem cobrir o total), na seção de comprovantes e na confirmação do protocolo.
- **Honestidade comercial:** oferta única autorizada (`R$ 69,90/mês`, `até 2 usuários por loja`, `7 dias de teste gratuito acompanhado`), cobrança e acompanhamento manuais, sem checkout automático, sem prova social inventada e sem promessa de recursos indisponíveis (IA, fiscal, marketplace, EXE não homologado).

## Tipografia

- **Plus Jakarta Sans** (`600`, `700`, `800`) — títulos e CTAs.
- **Inter** (`--font-sans`) — corpo e continuidade com o sistema interno.
- **IBM Plex Mono** (`500`, `700`) — comprovante térmico, URL das molduras e protocolo.

## Componentes e interatividade

| Componente | Papel |
|---|---|
| `GestaoLojasHeader` | Cabeçalho fixo escuro, menu gaveta mobile (`hidden` quando fechado, fecha com `Escape`), WhatsApp só quando `GESTAO_LOJAS_CONTATO_WHATSAPP` estiver configurado |
| `HeroStage` | Captura real do PDV em moldura escura, botão `Ampliar`, atalhos para abas (`Ver Caixa`, `Ver Estoque`, `Ver Clientes`) e comprovante térmico |
| `SistemaShowcase` | Vitrine em 4 abas com teclado (`ArrowLeft`/`ArrowRight`/`Home`/`End`), Lightbox modal acessível (`Escape`, setas, retorno de foco) e complemento de Relatórios operacionais + Comprovantes |
| `SolicitacaoTesteForm` | Fluxo real persistente (`POST /api/comercial/solicitacoes-teste`), validação por campo, máscara amigável de WhatsApp, honeypot, confirmação com protocolo e recibo ("Acesso ainda não criado") |
| `MobileStickyBar` | Barra fixa inferior (`< 768px`) com `IntersectionObserver` em `#solicitar` para ocultar automaticamente ao chegar no formulário |

## Chaves de ambiente (falham fechado)

| Variável | Efeito |
|---|---|
| `GESTAO_LOJAS_CONTATO_WHATSAPP` | Número em dígitos (`55` + DDD + telefone); formatado automaticamente e oculto se ausente ou inválido |
| `GESTAO_LOJAS_CONTATO_EMAIL` | Email comercial direto; oculto se ausente ou inválido |

O canal de instalação no computador (Windows/PWA) é único em `/baixar` (conciliado com a frente Desktop / PR #385). A página `/gestao-lojas` não expõe links diretos `.exe`.
