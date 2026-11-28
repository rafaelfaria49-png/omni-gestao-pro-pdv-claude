---
title: ADR-0026 · Contrato comercial da venda — data efetiva (retroativa), brindes e características não exclusivas
status: proposta
data: 2026-11-27
autor: Claude (Opus 5.5) — GOAL OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001
revisores: [revisor independente (agente), proprietário]
hub: pdv
tags: [vendas, retroativa, caixa, brindes, competencia, idempotencia]
---

# ADR-0026 · Contrato comercial da venda

> **Status:** proposta (implementada em PR draft, sem migration)
> **Decisão em uma frase:** `Venda.payload.comercial` é um namespace cuja única autoridade é o servidor; a data efetiva é atributo comercial (competência), nunca reescreve o registro, a numeração, o caixa nem o recebimento.

## 1. Contexto

- O motor grava em `payload` tudo o que o cliente envia (`...sale`). Sem sanitização, um campo comercial vindo do navegador seria tratado como fato.
- "Venda Comum / Com Garantia / A Prazo / Orçamento Conv." eram excludentes na Venda Completa e só gravavam um enriquecimento posterior — nunca chegavam ao motor.
- Já existia no motor o contrato de lançar na **sessão original fechada** (`allowClosedOriginalSession`), usado na sincronização retroativa e na regularização de troca.

## 2. Decisão

- O motor descarta `sale.comercial` e grava somente `UpsertVendaOptions.comercial`, montado por `lib/comercial/venda/servidor.ts` nas rotas V1/V2. Venda comum continua sem o campo (regressão zero).
- Venda retroativa (recurso `sales.retroactive`, desligado por padrão; permissão de gerente `pdv.cancelarVenda`; limite configurável 1–365 dias, padrão 30; justificativa ≥ 10; dia civil em `America/Sao_Paulo`; nada no futuro):
  - **A — pagamento hoje**: venda registrada agora, no caixa aberto de hoje; `retroativa.dataEfetivaVenda/Entrega` = competência comercial.
  - **B — regularização** (venda e pagamento na data efetiva): exige sessão da loja **FECHADA** que cubra o instante informado; o motor grava na sessão original com `retroactiveSync`, sem reabrir caixa. Venda com aparelho não regulariza (a garantia exige relógio do servidor e conta da entrega efetiva).
  - **C** (pagamento já registrado sem venda) e **D** (aparelho vendido antes da implantação): não aceitos por este contrato — exigem vínculo financeiro explícito (pendência).
  - `registradoEm` e `operador` são do servidor; o retry de 36 h do aparelho **não** é reutilizado.
- Brindes (`sales.gifts`): linha de preço **zero**, produto do estoque (não avulso, não aparelho), motivo. Baixa e custo histórico pelo motor (saída do ledger pelo custo médio); sem receita.
- Características derivadas (não exclusivas): a prazo/crediário da loja, cartão de crédito (nunca confundido com crediário), com garantia, pagamento misto, retroativa, com brinde.

- Replay antes da validação: a rota procura a venda pela identidade (`clientSaleId`/`pedidoId`) ANTES de validar `comercial`; reenvio de venda já gravada segue para o replay idempotente do motor (nunca é "recusado" por relógio, permissão ou flag de agora).
- Recusas comerciais em duas classes: **estruturais** (só dependem do conteúdo) são definitivas; **contextuais** (dia, permissão, flag, sessão) só encerram a finalização ao vivo de identidade nova e, no reenvio automático, ficam pendentes com ação do operador.
- Regularização grava `reason: "regularizacao_retroativa"` (distinto do reenvio de venda pendente).

## 3. Consequências

- Somente o Relatório comercial usa a data efetiva (`payload.comercial.retroativa.dataEfetivaVenda`) como competência. DRE, Relatório Geral, caixa e recebimentos continuam pela data real do registro — adaptar os demais relatórios à competência comercial é pendência declarada (sem dupla contagem: a venda aparece uma vez em cada visão).
- A garantia do aparelho continua contada pelo relógio do servidor a partir do registro (nunca encurta o prazo do consumidor); `dataEfetivaEntrega` é registro comercial, sem efeito de garantia nesta fase.
- A regularização altera os totais esperados de uma sessão já fechada (mesmo efeito da sincronização retroativa existente); não há evento de ajuste na `SessaoCaixa` — o vínculo fica em `payload.comercial.retroativa.sessaoOriginalId` (pendência).
- Fluxos de recuperação (quarentena) que reenviam payload antigo **não** preservam `comercial` (descartado por desenho até haver revalidação).
- Emissão fiscal nunca é retrodatada por este contrato.
