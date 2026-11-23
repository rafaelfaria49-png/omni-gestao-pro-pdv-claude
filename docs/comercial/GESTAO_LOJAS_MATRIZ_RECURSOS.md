# Vendas e Estoque — matriz RECURSO / PLANO / STATUS REAL

GOAL `OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001` · auditoria de 2026-11-18 sobre `main` `b55a9d2`.

A página `/gestao-lojas` só anuncia o que está marcado **OPERACIONAL** abaixo. Itens
**EM LIBERAÇÃO** aparecem com esse rótulo; itens **FORA DA OFERTA** não aparecem como recurso.

## Planos

| Plano (proposta) | Mensalidade proposta | Pessoas no caixa (proposta) | Diferença aplicada pelo sistema hoje |
|---|---|---|---|
| Essencial | R$ 39,90 | 1 | **nenhuma** |
| Comércio | R$ 69,90 | 2 | **nenhuma** |
| Comércio Plus | R$ 99,90 | 3 | **nenhuma** |

- Valores em `lib/comercial/gestao-lojas-oferta.ts` (fonte única). Status: `PROPOSTA_QA_NAO_APROVADA`.
- A página só mostra preços com `GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1`, com o aviso
  "Valores em avaliação. Ainda não estão à venda." Sem a variável (padrão, inclusive Production): nenhum valor.
- **Não há limite de usuários por plano no código** (busca por `maxUsuarios`/`seatLimit`/similares: zero).
  Os três planos entregam exatamente o mesmo pacote (`BASIC_MODULE_ACCESS`). Antes de vender, é preciso
  implementar o limite de pessoas por loja — sem isso, a diferença entre planos é fictícia. **Bloqueio comercial.**
- Custos reais (infra Vercel + Neon, suporte, taxa de cobrança) **não foram calculados** neste GOAL: não há
  dado de custo no repositório. Precisa do proprietário antes de aprovar valores.
- Bronze/Prata/Ouro/Diamante (`lib/stripe.ts`, `lib/subscription-plans-catalog.ts`) **não foram tocados**.

## Recursos

| Recurso | Plano | Status real | Evidência |
|---|---|---|---|
| PDV Clássico | todos | OPERACIONAL | módulo `pdv` em `BASIC_MODULE_ACCESS`; E2E piloto "CAIXA básico abre sessão, vende…" |
| Venda Completa | todos | OPERACIONAL (tela de venda detalhada) | `components/dashboard/vendas/pdv-venda-completa-enterprise.tsx`, módulo `sales` |
| Formas de pagamento | todos | OPERACIONAL: dinheiro, Pix, débito, crédito, carnê, a prazo, vale-crédito | `payment-modal.tsx` (tipo `PaymentMethodId`) |
| Caixa (abertura, sangria, suprimento, fechamento conferido) | todos | OPERACIONAL | `components/dashboard/caixa/*`, fechamento por forma (#177) |
| Produtos (cadastro, código de barras, categoria) | todos | OPERACIONAL | módulo `catalog`; E2E `cadastro-categoria-estoque.spec.ts` |
| Estoque (baixa na venda, entrada, ajuste) | todos | OPERACIONAL | `api/ops/venda-persist` (transação com estoque insuficiente = recusa); E2E prova estoque 5→3 |
| Aviso de estoque baixo | todos | OPERACIONAL | `gestao-produtos.tsx` |
| Clientes (cadastro, histórico de compras) | todos | OPERACIONAL | `ClientesPageClient.tsx` (aba histórico OS + vendas) |
| Histórico de vendas | todos | OPERACIONAL | `/dashboard/vendas` |
| Comprovante (impressão pelo navegador) | todos | OPERACIONAL | `cupom-nao-fiscal.tsx` (não fiscal) |
| Impressão direta (Windows) | todos | EM LIBERAÇÃO | app Desktop 1.0.3 homologado internamente em 2026-11-17; distribuição pública não liberada |
| Relatórios básicos | todos | OPERACIONAL | módulo `reports` |
| Controle de usuários (CAIXA, VENDEDOR, GERENTE, ADMIN) | todos | OPERACIONAL | `UsuariosSection.tsx`, `/api/admin/users` |
| Configuração por loja | todos | OPERACIONAL | módulo `settings`, `/api/stores/[id]/settings` |
| Isolamento entre lojas | todos | OPERACIONAL | E2E piloto (dados B invisíveis para A) |
| Aplicativo Windows (download público) | — | EM LIBERAÇÃO | frente `OMNI-DESKTOP-DISTRIBUICAO-PUBLICA-SAAS-001`; botão leva sempre a `/baixar` (opções Windows 10/11; download liberado só com release assinada e homologada) |
| Padaria — venda por peso (kg) | — | EM LIBERAÇÃO | PRs #315/#335/#336 sem merge; NO_GO de janela presencial |
| Vestuário — grade de tamanho e cor | — | EM LIBERAÇÃO | P02 #358 em draft; flags `VESTUARIO_*` desligadas |
| Aparelhos por IMEI | — | FORA DA OFERTA | #347 mergeada, migration não aplicada em produção, recurso desligado |
| Relatórios Enterprise | — | FORA DA OFERTA | fora do pacote básico |
| Fiscal (NF-e / NFC-e) | — | FORA DA OFERTA | dormente, 0 callers produtivos; a página responde "Não nesta oferta" |
| Marketplace | — | FORA DA OFERTA | roadmap |
| IA, créditos, Marketing, Omni Agent, WhatsApp | — | FORA DA OFERTA | a oferta não depende de IA |

## Cobrança (Stripe) — auditoria, nada alterado

- Checkout (`app/api/billing/checkout/route.ts`) só conhece Bronze/Prata/Ouro/Diamante e cria
  `trial_period_days: 14`. A landing antiga promete **7 dias** grátis "sem cartão", mas o checkout exige cartão.
  Divergência confirmada; a landing antiga não está publicada (só `/dashboard/landing-preview`, plataforma).
- Webhook (`app/api/webhooks/stripe/route.ts`) verifica a assinatura (`constructEvent`), mas não registra
  `event.id` processado (sem idempotência explícita por evento) e grava assinatura no `AdminUser`, não na loja.
- Nenhum preço Stripe existe para Essencial/Comércio/Comércio Plus. **Cobrança automática da nova oferta:
  desligada** (não implementada), como exige o GOAL até homologação financeira.
