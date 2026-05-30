# Inventário de Lojas & Plano de Limpeza — 2026-05-30

> Auditoria **read-only** (count/groupBy/aggregate no banco real). Nenhum dado foi
> alterado, atualizado ou excluído. Documento de apoio à decisão de limpeza/exclusão
> de unidades de teste. Revisar antes de qualquer DELETE.

## 1. Inventário por loja (10 lojas)

| storeId | nome | protegida | produtos | clientes | vendas | OS | caixa | C.Receber | C.Pagar | mov.Fin | WhatsApp (conv/msg) | Classificação |
|---|---|:---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| **loja-1** | RAFACELL ASSISTEC | 🔒 SIM | 260 | 40 | 336 | 0 | 13 | 309 | 38 | 143 | 2 / 118 | **REAL_PROTEGER** |
| **loja-2** | RAFA BRINQUEDOS E VARIEDADES | 🔒 (Fase 1) | 5.093 | 81 | 0 | 0 | 0 | 49 | 0 | 0 | 1 / 2 | **REAL_LIMPAR_PRODUTOS** |
| **loja-11** | RAFA BRINQUEDOS E VARIEDADES | — | 4.639 | 80 | 0 | 0 | 0 | 15 | 0 | 0 | 0 / 0 | **AMBIGUA_CONFIRMAR** |
| **loja-teste-caixa** | 🧪 LOJA TESTE CAIXA | — | 1.597 | 40 | 0 | 0 | 1 | 0 | 0 | 1 | 1 / 1 | **TESTE_MANTER** (lab) |
| loja-10 | 123teste | — | 231 | 0 | 6 | 0 | 3 | 0 | 0 | 6 | 1 / 8 | **TESTE_EXCLUIR** |
| loja-5 | TESTE 123 | — | 800 | 0 | 4 | 0 | 1 | 0 | 0 | 10 | 1 / 12 | **TESTE_EXCLUIR** |
| loja-6 | smart | — | 499 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | **TESTE_EXCLUIR** |
| loja-7 | teste produtos gestao | — | 231 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | **TESTE_EXCLUIR** |
| loja-8 | smart teste 500 | — | 499 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | **TESTE_EXCLUIR** |
| loja-9 | gestao teste 239 | — | 231 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | **TESTE_EXCLUIR** |

- Marketplace/marketing: zero em todas (exceto 2 posts IA em loja-1). WhatsApp real só em loja-1.
- Nenhum `storeId` órfão (todo dado tem `Store` correspondente).

## 2. Comparativo loja-2 × loja-11 (Rafa Brinquedos)

| Critério | loja-2 | loja-11 |
|---|---|---|
| Produtos | 5.093 (4.964 c/ preço, 1.669 c/ SKU, 3.467 c/ barcode) | 4.639 (4.521 c/ preço, 1.119 c/ SKU, 3.403 c/ barcode) |
| Loja criada em | 2026-04-21 (mais antiga) | 2026-05-29 |
| Importação dos produtos | 2 lotes: 724 em 28/05 + 4.369 em 30/05 (hoje) | 1 lote único: tudo em 29/05 (17:55→19:27) |
| Ainda recebendo escrita? | Sim — produto criado hoje 12:50 | Não (parou em 29/05) |
| Clientes / C.Receber | 81 / 49 | 80 / 15 |
| WhatsApp | 1 conversa | nenhuma |
| Natureza provável | Loja ativa + mistura de lotes/testes | Import único "limpo" da planilha completa |

## 3. Recomendações

- **Manter `loja-2` como Rafa Brinquedos final** → limpar SÓ produtos e reimportar o
  catálogo correto. Motivos: id estável/baixo, loja mais antiga, **viva** (escrita hoje),
  mais dados ancilares (49 C.Receber + WhatsApp). *Confirmar destino dos clientes/contas
  da loja-11 antes de excluí-la.*
- **Estratégia alternativa válida:** manter loja-11 (import único e limpo) e descartar
  loja-2. Decisão de negócio — os dados sustentam as duas leituras.
- **Lab/teste a manter:** `loja-teste-caixa` (nome declara função, tem fluxo de caixa).
  Alternativa: `loja-10` (tem vendas+caixa de teste).
- **Excluir com baixo risco:** loja-6, loja-7, loja-8, loja-9 (só produtos + terminais).
  Com nota (têm vendas/caixa de teste): loja-5, loja-10.
- **loja-1: nunca limpar nem excluir.**

## 4. Plano em fases

- **Fase 0** — Revisão deste relatório + confirmação (loja-2 final, destino loja-11, lab).
- **Fase 1** — Proteção em código (whitelist `loja-1`, `loja-2` + loja ativa + bloqueio
  acidental) ANTES de qualquer DELETE. ⬅️ *em implementação*
- **Fase 2** — Excluir risco mínimo (loja-6, 7, 8, 9).
- **Fase 3** — Excluir teste com dados (loja-5, loja-10) após confirmação.
- **Fase 4** — Limpar produtos da loja-2 (preserva loja, clientes, C.Receber) + reimportar.
- **Fase 5** — Resolver loja-11 (excluir após migração vs manter como backup).

## 5. Ordem segura de exclusão (FKs)

`onDelete: Restrict` bloqueiam a store e precisam sair antes; `onDelete: Cascade` caem junto.
Pontos críticos de ordem:
- `estoque_produtos` ← `ordem_servico_item.produtoId` (Restrict) → apagar itens de OS antes.
- `clientes_importados` ← `ordens_servico.clienteId` (Restrict) → apagar OS antes de clientes.
- `vendas.clienteId` → SetNull (seguro).

Filhos sem `storeId` (apagar via pai): `venda_itens`, `itens_devolucao_venda`,
`ordem_servico_item`, `financial_attachments`, `whatsapp_conversa_etiquetas`.
Órfão sem FK p/ store: `ledger_snapshots` (apagar por `storeId` explicitamente).
`caixa_operacoes` e `omni_agent_automation_runs` caem por cascade do pai.

## 6. Riscos & rollback

- Confirmar loja-2 vs loja-11 antes de excluir (ambíguas — nunca auto-excluir).
- `loja-11` estava **desprotegida** na API antes da Fase 1 (só loja-1 era protegida).
- Nunca `DELETE FROM stores` direto numa loja com dados (cascade cego em financeiro auditável).
- Transação atômica + `pg_dump` da loja antes. Pós-COMMIT é irreversível: backup é a única volta.

---
Gerado em 2026-05-30 a partir de consulta read-only ao banco de produção.
