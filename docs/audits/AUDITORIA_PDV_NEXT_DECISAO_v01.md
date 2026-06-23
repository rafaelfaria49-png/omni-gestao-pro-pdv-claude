---
title: Auditoria PDV Next / Black Edition — Decisão de Produto (v01)
status: read-only (diagnóstico + recomendação — sem correção)
data: 2026-06-16
autor: Opus 4.8 (Claude Code)
hub: pdv
tags: [pdv, pdv-next, black-edition, decisao, paridade, feature-flag, experimental]
escopo: GOAL PDV_NEXT_DECISAO_READONLY
relacionado: docs/audits/AUDITORIA_COMPLETA_PDV_PARIDADE_UX_FUNCIONAL_v01.md
---

# Auditoria PDV Next / Black Edition — Decisão · v01

> **Natureza:** READ-ONLY. Nenhum código, flag, schema, commit ou push.
> Tudo abaixo é verificado contra o código real (arquivo:linha citados no working tree atual).

---

## 1. Resumo executivo

- **O PDV Next / Black Edition está em LIMBO controlado, não em risco.** É um shell próprio
  (`PdvBlackEdition` + `PdvBlackShell`) **bloqueado por padrão** em produção via
  `experimentalPdvEnabled` (env `NEXT_PUBLIC_OG_EXPERIMENTAL=1`). Em produção: rota retorna
  "em desenvolvimento", card de seleção é ocultado e qualquer preferência salva `"next"` é
  **rebaixada para `classic`**. Só roda com a env de dev ligada.
- **A contradição central é documental, não de motor.** O código **JÁ persiste de verdade**:
  `handlePaymentConfirm` chama `finalizeSaleTransaction` (`PdvBlackEdition.tsx:359`) — mesmo motor
  central, com **gate de caixa** (`:345`), idempotência/retry e **estoque anti-negativo**. Porém
  **três lugares ainda afirmam que "não persiste vendas"** (`page.tsx:8-17`, `feature-flags.ts:18-22`,
  `PdvSection.tsx:468-469`). Isso é um **P1 informacional**: induz decisão de produto errada e pode
  levar alguém a apagar código que funciona.
- **A base é sólida, o acabamento é incompleto.** Tem: caixa (abertura/fechamento/sangria/suprimento
  via `CaixaStatusBar`), busca textual nova, **barcode remoto**, cliente, formas de pagamento
  (modal compartilhado), operador por nome, pendências/offline. **Faltam:** desconto (zerado),
  impressão de cupom, devolução/troca, venda em espera, item avulso, fila de produtos a cadastrar.
- **O valor real do Black é VISUAL + ergonomia de teclado** (tela única, sidebar de pagamento,
  barra F2–F12, multi-tema), **não um motor diferente**. Trazê-lo à paridade total = **refazer**
  tudo que o Clássico já tem. A GOAL de paridade da Venda Completa acabou de demonstrar o custo de
  manter shells paralelos.

**Recomendação (detalhe na seção 5):** **B — converter o Black Edition em tema/skin do PDV Clássico**
(que já tem paridade completa), precedido de um **micro-fix P1** que corrige a mensagem falsa de
"não persiste". Até B ser executado, manter **gated** (estado C). **Não** investir em levar o shell
paralelo à paridade (opção A) nem arquivar o visual (opção D — o produto claramente quer o look premium).

---

## 2. Mapa de rotas e entrada

| Aspecto | Evidência | Estado |
|---|---|---|
| Rota | `app/dashboard/pdv-next/page.tsx` | Existe |
| Gate da rota | `page.tsx:10` → se `!experimentalPdvEnabled` renderiza `ModuleEmDesenvolvimento` | Bloqueada em produção |
| Mensagem do gate | `page.tsx:8-17`: "ainda NÃO persiste vendas no banco" | ⚠️ **FALSA** (código persiste) |
| Flag | `lib/feature-flags.ts:16,23` → `experimentalPdvEnabled = process.env.NEXT_PUBLIC_OG_EXPERIMENTAL === "1"` | Off por padrão |
| Comentário da flag | `feature-flags.ts:18-22`: "ainda NÃO persiste vendas" | ⚠️ **FALSO/stale** |
| Card no menu/seleção | `PdvSection.tsx` (Configurações → PDV) card `id:"next"` "PDV Next" (`:91-95`) | Existe, mas… |
| Visibilidade do card | `PdvSection.tsx:470` → `visibleFlows = experimentalPdvEnabled ? FLOWS : FLOWS.filter(f.id !== "next")` | Oculto em produção |
| Comentário do card | `PdvSection.tsx:468-469`: "experimental (não persiste vendas)" | ⚠️ **FALSO/stale** |
| Persistência da escolha | `PdvSection.tsx:430-431` grava `writePdvMainLayout(loja,"next")` | Possível só em dev |
| Redirect runtime | `vendas-page-client.tsx:56-62`: se layout `"next"` **e** `experimentalPdvEnabled` → `router.replace("/dashboard/pdv-next")`; **senão rebaixa para `classic`** | Salvaguarda dupla |
| Link direto no sidebar | Nenhum (Topbar só usa o path p/ breadcrumb `Topbar.tsx:94,103`) | Sem item de menu |
| AppShell | `app/dashboard/layout.tsx`: só `pdv-github-original` fica fora do AppShell; **`pdv-next` está DENTRO** (`:29` isFixedScreen) | Topbar global + 👁 Alta Legibilidade + `PwaUpdatePrompt` presentes |

**Como o usuário chega (apenas em dev, env ligada):** Configurações → PDV → card "PDV Next" →
"Usar layout"/"Salvar" → grava `"next"` → `vendas-page-client` redireciona para `/dashboard/pdv-next`.
Ou URL direta `/dashboard/pdv-next`. **Em produção (default): inacessível em três camadas** (rota
+ card + rebaixamento).

---

## 3. Matriz de paridade

Comparação com os 4 PDVs de varejo de referência. Legenda: ✅ existe · ⚠️ parcial · ❌ ausente ·
➖ n/a. (Clássico/Super/Assistência consolidados como "Ativos"; Venda Completa pós-GOAL de paridade.)

| Funcionalidade | Ativos (Clás/Super/Assist) | Venda Completa | **PDV Next/Black** | Evidência Black |
|---|---|---|---|---|
| Gate caixa aberto/fechado | ✅ | ✅ | ✅ | `PdvBlackEdition.tsx:345` |
| Abertura de caixa in-shell | ✅ | ✅ | ✅ | `:503` + `CaixaStatusBar` + header `Shell:474` |
| Fechamento de caixa in-shell | ✅ | ✅ | ✅ | `:504` + header `Shell:467` |
| Sangria / Suprimento | ✅ | ✅ | ✅ | `CaixaStatusBar` (`:411`) |
| Busca textual nova (`filterPdvCatalogBySearch`) | ✅ | ✅ | ✅ | `:226`, `Shell:301` |
| Barcode local (`findPdvProductByScan`) | ✅ | ✅ | ✅ | `:218` |
| **Barcode remoto (`lookupPdvScanRemote`)** | ✅ | ✅ | ✅ | `:239` |
| Multiplicador `3x`/`3*` | ✅ | ⚠️ | ✅ | `:210` |
| Cliente | ✅ | ✅ | ✅ | `useClienteSearch :121`, F5 |
| CPF/CNPJ na nota | ✅ | ✅ | ⚠️ (F9 só reabre busca de cliente) | `:298-300` |
| Formas de pagamento (PIX/dinheiro/cartão) | ✅ | ✅ | ✅ | `PaymentModal :507` |
| Venda a prazo | ✅ | ✅ | ⚠️ (passa `aPrazoConfig`, sem UI dedicada) | `:358,366` |
| Crédito (vale/loja) | ✅ | ✅ | ❌ | — |
| **Desconto (item/venda)** | ✅ | ✅ | ❌ (zerado + noop; F8 placeholder) | `:512-515`, `:295-296` |
| **Item avulso (INSERT)** | ✅ | ✅ | ❌ | sem `ItemAvulsoModal` |
| **Item avulso c/ código/SKU** | ✅ | ✅ | ❌ | — |
| **Fila "produtos a cadastrar"** | ✅ | ✅ | ❌ | sem `enfileirarProdutosACadastrar` |
| **Venda em espera** | ✅ | ✅ | ❌ (F11 placeholder) | `:305-306` |
| Pendências / offline + badge | ✅ | ✅ | ✅ | `CaixaStatusBar`→`PdvPendingSyncBadge` |
| **Impressão de cupom** | ✅ | ✅ | ❌ (só incrementa nº; "Finalizar c/ NF-e" não imprime) | `Shell:732-747`, `:372-374` |
| **Reimpressão** | ✅ (arquivo) | ✅ (arquivo) | ⚠️ (venda persiste → aparece no arquivo; sem reimpressão in-shell) | — |
| Operador por nome (nunca UUID) | ✅ | ✅ | ✅ | `operatorDisplayName :104` |
| Alta legibilidade (Alt+L global) | ⚠️ | ⚠️ | ⚠️ (toggle global ok; mas `bg-[#000000]` fixo ignora tokens) | `:407` |
| `finalizeSaleTransaction` | ✅ | ✅ | ✅ | `:359` |
| Estoque anti-negativo | ✅ | ✅ | ✅ | central (motor) |
| **Devolução / Troca** | ✅ | ⚠️/❌ | ❌ (F6 placeholder) | `:289-291` |
| Responsividade/UX | ✅ | ✅ | ⚠️ (sidebar de pagamento `hidden … lg:flex` some <1024px; cor fixa) | `Shell:590`, `:407` |

**Leitura:** o Black já está **acima** da Venda Completa pré-GOAL em caixa/barcode, mas **atrás dos
Ativos** em desconto, impressão, devolução, espera, item avulso e fila a cadastrar — exatamente os
recursos que já existem prontos e compartilhados no ecossistema do Clássico.

---

## 4. Riscos classificados

| ID | Risco | Sev. | Evidência |
|---|---|---|---|
| — | **Nenhum P0.** Venda persiste pelo motor central (gate de caixa + anti-negativo + fila offline). Sem fallback `loja-1`. | **P0** | `:345,359` |
| N-1 | **Doc/gate mente que "não persiste"** → decisão de produto errada; risco de remover código que funciona. | **P1** | `page.tsx:8-17`; `feature-flags.ts:18-22`; `PdvSection.tsx:468-469` |
| N-2 | **Sem impressão de cupom** → operador finaliza e não entrega comprovante (quebra de fluxo de balcão). Se promovido sem isso = P1. | **P2** (gated) | `Shell:732-747`; `:372-374` |
| N-3 | **Filtro silencioso de linhas** em `handlePaymentConfirm` descarta itens sem `inventoryId` resolvível **sem avisar**. Hoje inócuo (catálogo = só inventory real), mas latente se voltar catálogo mock/item avulso. | **P2** (latente) | `:350-351` |
| N-4 | **Desconto totalmente ausente** (zerado + handlers noop) → não cobre negociação de balcão. | **P2** | `:512-515` |
| N-5 | **Paridade incompleta**: item avulso, espera, devolução, fila a cadastrar, crédito. | **P2** | placeholders `:289-307` |
| N-6 | **Cor fixa `bg-[#000000]`** fora dos tokens semânticos → Alta Legibilidade/temas não respondem no shell; viola regra visual do projeto. | **P3** | `:407` |
| N-7 | **Sidebar de pagamento some <1024px** (`hidden … lg:flex`) → total/troco/pagamento inacessíveis em telas pequenas. | **P3** | `Shell:590` |
| N-8 | **Indicadores cosméticos** ("Online" fixo; toggle NF-e F7 sem emissão real). | **P3** | `Shell:512-515`, `:292-294` |

---

## 5. Decisão recomendada

> **B) Converter o visual Black Edition em TEMA/SKIN do PDV Clássico** — com um **micro-fix P1
> de documentação como pré-requisito imediato**, e mantendo o estado **C (gated)** como ponte até B.

**Por quê B (e não A/C/D):**

- **Contra A (oficializar o shell paralelo):** levaria a um **5º motor** a manter (desconto,
  impressão, devolução, espera, item avulso, fila a cadastrar — tudo já pronto no Clássico). A GOAL
  de paridade da Venda Completa provou que paridade-por-duplicação é cara e gera drift. Custo alto,
  valor incremental baixo (o motor já é o mesmo `finalizeSaleTransaction`).
- **A favor de B:** o `pdv-omni-classic-shell` já abstrai aparência via `uiShell` (ex.: `"omni-smart"`).
  O que o Black tem de único é **visual + layout de teclado**, que cabe como **variante de shell/tema**
  reusando 100% do motor e dos modais compartilhados (caixa, pagamento, item avulso, espera, impressão).
  Elimina duplicação e entrega o look premium que o produto deseja (há screenshots e card de seleção).
- **Contra C como destino final:** "esconder e manter" perpetua código morto/parcial e a mentira do
  gate. Serve só como **ponte** temporária.
- **Contra D (arquivar):** o produto claramente quer a estética premium (multi-tema, capturas em
  `public/images/pdv-next/`, card dedicado). Jogar fora o visual desperdiça intenção de produto.

**Antes de qualquer coisa (P1, barato, independente da decisão maior):** corrigir as 3 mensagens
falsas de "não persiste" para refletir a realidade ("persiste de verdade; experimental por falta de
impressão/desconto/devolução/espera"). Isso impede decisões erradas e remoções indevidas. Mantém o
gate `experimentalPdvEnabled` (continua off em produção).

---

## 6. Plano de ação (para B, com ponte C)

### Etapa 0 — Micro-fix P1 (pré-requisito, ~S)
- **Editar texto, não comportamento:** `page.tsx:8-17`, `feature-flags.ts:18-22`, `PdvSection.tsx:468-469`
  → trocar "não persiste vendas" por descrição correta ("persiste; experimental por acabamento
  incompleto"). Manter `experimentalPdvEnabled` off.
- **NÃO mexer** em motor, gate booleano, schema, nem na lógica de venda.

### Etapa 1 — Provar o tema como variante do Clássico (~M)
- **Manter:** identidade visual do Black (paleta, barra F2–F12, layout tela-única, multi-tema) como
  um `uiShell`/tema do `pdv-omni-classic-shell` — **tokenizando** a cor (resolver N-6: trocar
  `bg-[#000000]` por token de tema escuro).
- **Migrar para o Clássico (reuso, sem reescrever):** desconto, impressão (`pdv-post-sale-dialog` +
  `CupomNaoFiscal`), item avulso (`ItemAvulsoModal`), venda em espera (`pdv-hold`/`VendaEsperaModal`),
  fila "produtos a cadastrar", devolução/troca — **todos já existem** no ecossistema do Clássico.
- **Resolver N-7:** layout responsivo da sidebar de pagamento (não esconder <1024px).

### Etapa 2 — Aposentar o shell paralelo (~S, só depois de 1 validado)
- **Arquivar:** `components/pdv-next/PdvBlackEdition.tsx` e `PdvBlackShell.tsx` (após o tema cobrir o
  visual). Apontar a rota/seleção "next" para o Clássico+tema.
- **Decidir destino** de `/dashboard/pdv-next` (manter como alias do tema ou remover) e do card
  `id:"next"` em `PdvSection`.

### O que **NÃO** mexer (qualquer etapa)
- `finalizeSaleTransaction` e o motor `lib/operations-store.tsx` (núcleo transacional saudável).
- `prisma/schema.prisma`, auth/proxy, financeiro, fiscal (NF-e real), WhatsApp, Omni Agent, BL-07.
- Modais compartilhados (`payment-modal`, `pdv-post-sale-dialog`, `item-avulso-modal`, caixa) —
  **reusar**, nunca duplicar/garfar para o Black.
- O booleano `experimentalPdvEnabled` permanece como salvaguarda até B concluir.

> **Ponte C (enquanto B não é priorizado):** após a Etapa 0, o Black fica como **laboratório
> honesto** — gated, com docs corretas, sem investimento adicional. Estado seguro e sem mentira.

---

## 7. Próximos GOALs recomendados

1. **GOAL_PDV_NEXT_DOC_FIX** — Etapa 0: corrigir as 3 mensagens "não persiste" (texto-only). P1, esforço S.
2. **GOAL_PDV_BLACK_TEMA_CLASSICO** — Etapas 1–2: Black vira tema/skin do Clássico, tokenizar cor,
   migrar desconto/impressão/avulso/espera/devolução por reuso, responsividade. P2, esforço M.
3. **GOAL_PDV_NEXT_SILENT_DROP_GUARD** — N-3: se o filtro de linhas descartar item, avisar (toast)
   em vez de silenciar. P2, esforço S (independente; vale mesmo se B atrasar).
4. **GOAL_PDV_LIMPEZA_ORFAOS** — alinhado à v01: arquivar shells mortos e definir destino de
   `pdv-github-original/**` após B. P3.

---

## Anexo — Método e evidência

- **Read-only.** Verificado contra: `app/dashboard/pdv-next/page.tsx`, `app/dashboard/layout.tsx`,
  `components/pdv-next/PdvBlackEdition.tsx`, `components/pdv-next/PdvBlackShell.tsx`,
  `lib/feature-flags.ts`, `app/dashboard/vendas/vendas-page-client.tsx`,
  `components/configuracoes-v3/features/settings/sections/PdvSection.tsx`,
  `components/painel-inicial/Topbar.tsx`.
- **Sem build** (auditoria/docs). Nenhuma alteração de código/flag/schema. Validação: `git diff --stat`
  deve listar **apenas** este arquivo novo.
- **Limites de confiança:** emissão fiscal (NF-e) é fora de escopo (protegida) — o toggle F7 do Black
  é cosmético; "reimpressão via arquivo" assume o pipeline central de `vendas-arquivo-geral` (não
  reexecutado nesta passada estática).
