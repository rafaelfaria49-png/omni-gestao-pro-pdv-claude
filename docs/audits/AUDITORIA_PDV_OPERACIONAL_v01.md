---
title: Auditoria Operacional dos PDVs — comparativo interno + benchmark + GAP
hub: pdv
tipo: auditoria read-only (sem alteração de código)
status: v01
data: 2026-06-02
owner_humano: Rafael
owner_ia: Opus
roadmap: docs/roadmaps/ROADMAP_PDV.md
escopo: Clássico · Supermercado · Assistência · Venda Completa · Black Edition/Next · legado
---

# 🛒 Auditoria Operacional dos PDVs — v01

> **Read-only.** Nenhum código/schema/commit. Evidência: leitura de `components/dashboard/vendas/**`,
> `lib/pdv-keymap.ts`, `lib/operations-store.tsx`, `app/api/ops/venda-persist`, `ROADMAP_PDV.md`,
> `CURRENT_STATUS.md` e memórias persistentes do projeto.
> **Entrega:** inventário · matriz comparativa (12 dimensões) · diferenças · GAP vs mercado ·
> funcionalidades faltantes · melhorias prioritárias (P0–P3) · plano por fases.

---

## 1. Inventário dos PDVs

| PDV | Arquivo-fonte | Perfil | Persiste no servidor? |
|---|---|---|---|
| **Clássico** | `pdv-classic.tsx` → `pdv-omni-classic-shell.tsx` | Balcão geral (referência) | ✅ via `operations-store` → `venda-persist` (`enforceStock`) |
| **Supermercado** | `pdv-supermercado.tsx` | Alta cadência / bipe-first | ✅ |
| **Assistência** | `pdv-assistencia-enterprise.tsx` | Vinculado a OS | ✅ |
| **Venda Completa** | `pdv-venda-completa-enterprise.tsx` + `venda-completa-enterprise.tsx` | Catálogo rico | ✅ via `app/actions/vendas-enterprise.ts` |
| **Black Edition / Next** | `pdv-neon-shell.tsx` + `app/dashboard/pdv-next` | Premium escuro (shell apresentacional) | 🔴 **NÃO** — localStorage apenas (**DT-01 / BL-14, P0**) |
| **Legado (GitHub original)** | `components/pdv-github-original/**` (mirror completo: próprio `ops-upsert-venda`, `operations-store`, `venda-persist`) | Arquivado | env-gated; **código morto** (não importado ativamente) |

**Componentes compartilhados:** `payment-modal.tsx` (pagamento), `pdv-recebimento-modal.tsx` (F9/F5),
`item-avulso-modal.tsx` (INSERT), `venda-espera-modal.tsx` (F7), `pdv-cliente-picker.tsx` (F2),
`cupom-nao-fiscal.tsx` (impressão HTML), `trocas-devolucao.tsx` (devolução — módulo à parte),
`terminal-selector.tsx` (multi-terminais), `CaixaStatusBar`/`CaixaProvider` (caixa), `tabela-itens.tsx`,
`painel-total.tsx`, `controle-consumo.tsx` (comanda/mesa — embrionário), `pdv-post-sale-dialog.tsx`.

**Arquitetura de teclado (achado central):** `lib/pdv-keymap.ts` é a **fonte canônica** dos atalhos,
mas é **só base** — *"cada PDV mantém seu próprio handler de `keydown`"* (comentário do próprio
arquivo). Não há despacho unificado → **divergência de teclado entre PDVs** e risco recorrente de
*stale closure* nos `keydown` (memória `project_pdv_keydown_modal_deps`).

---

## 2. Matriz comparativa — 12 dimensões

> Legenda: ✅ completo · 🟡 parcial/divergente · ❌ ausente · 🔴 risco. "Canônico" = `pdv-keymap.ts`.

### 2.1 Atalhos / teclado
| Atalho (canônico) | Clássico | Supermercado | Assistência | Venda Completa | Black/Next |
|---|:--:|:--:|:--:|:--:|:--:|
| F1 Finalizar/pagamento | ✅ | 🟡 (botão/Space) | ✅ | 🟡 | rótulo F1 |
| F2 Cliente | ✅ | ✅ | ✅ | 🟡 | rótulo F2 |
| F3 Buscar produto | ✅ (tabela pro) | ✅ (bipe-first) | ✅ | ✅ (catálogo) | rótulo F3 |
| F4 Editar quantidade | ✅ | ✅ | ✅ | 🟡 | ❌ |
| F5/F9 Receber conta | ✅ | ✅ | ✅ | ❌ | ❌ |
| F6 Cancelar venda | ✅ | 🟡 | ✅ | 🟡 | ❌ |
| F7 Venda em espera | ✅ | ✅ | ✅ | 🟡 | ❌ |
| F10 Desconto | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| F12 Pagamento múltiplo | ✅ | ✅ | ✅ (modal próprio) | 🟡 diverge | ❌ |
| Insert Item avulso | ✅ | ✅ | ✅ | 🟡 | ❌ |
| Delete Cancelar item | ✅ | 🟡 (ESC) | ✅ | 🟡 | ❌ |
| End Ajuda (painel) | ✅ (lê keymap) | ❌ | ❌ | ❌ | ❌ |
| Ctrl+L Limpar carrinho | — | — | ✅ (migrou de F9) | — | — |

**Conclusão:** **Clássico = padrão-ouro** (keymap completo + painel de ajuda). Supermercado e
Assistência cobrem o núcleo operacional (parcial). **Venda Completa é o menos convergente** dos
persistidos (sem F9; F12/INSERT divergem). **Black/Next** só expõe rótulos F1/F2/F3 (shell
apresentacional; handlers dependem do pai).

### 2.2 Busca de produto
| | Clássico | Supermercado | Assistência | Venda Completa |
|---|---|---|---|---|
| Mecanismo | F3 → **tabela profissional** (Cód/SKU·EAN·Produto·Un·Estoque·Preço) + teclado ↑↓/Enter + contador | Bipe-first (barcode) + busca multi-termo | Busca padrão | Catálogo rico (grid) |
| Ranking | `scorePdvSearch` (multi-termo) | `scorePdvSearch` | `scorePdvSearch` | catálogo |
| Bipe (EAN) | ✅ | ✅ (foco volta ao bipe) | ✅ | 🟡 |

Busca é **forte e convergente** no ranking (`scorePdvSearch`); a **UX da busca diverge** (tabela pro
só no Clássico — memória `project_pdv_f3_busca_tabela`).

### 2.3 Pagamento
| | Clássico | Supermercado | Assistência | Venda Completa |
|---|---|---|---|---|
| Modal | **compartilhado** `payment-modal.tsx` (branch `twoColumn` opt-in) | compartilhado (byte-idêntico) | **próprio** (visual 2-campos lado a lado) | compartilhado, **multipay diverge** |
| Múltiplo (split) F12 | ✅ | ✅ | ✅ (modal próprio) | 🟡 |
| À Prazo Enterprise (entrada + N parcelas + vencimento → `ContaReceberTitulo`) | ✅ | ✅ | ✅ | 🟡 |
| Sem F11 (scroll único + Confirmar muted) | ✅ | (herdado) | n/a (modal próprio) | n/a |

Pagamento múltiplo **convergiu nos 3 principais** (memória `project_payment_modal_twocolumn` +
CURRENT_STATUS "Convergência operacional PDV"); **Assistência mantém modal próprio** por decisão de
UX; **Venda Completa diverge** (gap de convergência declarado no roadmap §5).

### 2.4 Exclusão de item
- **Canônico:** `Delete` = cancelar item selecionado (ou último do carrinho); `ESC` = remover último
  no modo rápido. Cancelamento da **venda inteira** = `F6`.
- **Estado:** Clássico/Assistência ✅; Supermercado usa ESC; Venda Completa/Black divergem. Não há
  política única de "estornar item já bipado" entre PDVs.

### 2.5 Devolução / troca
- Vive em **módulo separado** `trocas-devolucao.tsx` (substancial — 179 ocorrências de teclado/print),
  **não integrado ao fluxo de venda do PDV**.
- Roadmap §5/§6: **"Devolução parcial direto no PDV" — P1, ausente** (hoje só pela tela Trocas/Devolução).
- Não há botão/atalho de devolução dentro dos shells de PDV.

### 2.6 Impressão
- **3 pipelines paralelos** (memória `project_impressao_comprovantes_auditoria`):
  1. **Térmico** (config por loja) — **NÃO** imprime operador/cliente/forma de pagamento.
  2. **Rico** `CupomNaoFiscal` (HTML, `window.print`) — fora do fluxo PoS.
  3. **Assinatura** — só no recibo de crediário.
- **Sem emissão fiscal real (NFC-e/SAT)** → venda encerra como "comprovante interno" (**P0**, roadmap §5).
- **Inconsistência** entre pipelines (campos diferentes) é um gap de UX/fiscal.

### 2.7 Cliente
- `pdv-cliente-picker.tsx` (F2) compartilhado; FK `Venda.clienteId` ✅; **crédito persistente**
  (`ClienteCredito` + `UsoCreditoCliente`) ✅; match por telefone (WhatsApp HUB).
- Divergência menor: Assistência usa `customerName` (state local) para pré-filtro; Supermercado sem
  state de cliente em alguns fluxos. Pré-filtro de recebimento (F9) pelo nome do cliente selecionado.

### 2.8 Caixa
- `CaixaStatusBar` + `CaixaProvider` **compartilhados**: abertura, sangria, suprimento, fechamento
  (com retry/idempotência `lib/pdv-caixa-operacao.ts`).
- **Fechamento premium** (memória `project_fechamento_caixa_erp_premium`): resumo por origem/forma de
  pagamento + conferência por dinheiro físico + resumo no `payload`.
- **Fechamento exige confirmação do servidor** (memória `project_fechamento_caixa_server_confirm`) —
  acabou a divergência UI=fechado/banco=ABERTA.
- **Multi-terminais**: `PdvTerminal` (PDV1/2/3) + lock server-side + heartbeat (TTL 120s) +
  Assumir/Liberar admin. **Gap:** venda **não revalida lock por transação** (Fase 2 incompleta, P1).

### 2.9 Performance
| Aspecto | Estado |
|---|---|
| Leitura de saldo no PDV | `Produto.stock` (cache O(1)) — bom |
| Busca | `scorePdvSearch` client-side — ok para catálogos médios; **sem virtualização** declarada p/ 50k SKUs (meta roadmap < 200 ms não medida) |
| Recebimento (F9) | lista **todos** os títulos da loja e filtra client-side → **lento com > 5k títulos** (gap, paginação server-side é follow-up) |
| Anti-negativo | baixa atômica `stock >= qty` (DT-B) — sem corrida |
| Black/Next | localStorage (rápido, **mas inseguro** — perda de venda) |
| Latência crítica | **não há telemetria** (`finalizarVenda` < 200 ms é meta não medida) |

### 2.10 Funcionalidades transversais (convergência)
| Funcionalidade | Clássico | Supermercado | Assistência | Venda Completa |
|---|:--:|:--:|:--:|:--:|
| INSERT item avulso (`isVirtualSaleLine`) | ✅ | ✅ | ✅ (corrigido) | 🟡 |
| F7 venda em espera (LS por `storeId+terminalId`) | ✅ | ✅ | ✅ | 🟡 |
| F9 recebimento de contas (modal compartilhado) | ✅ | ✅ | ✅ | ❌ |
| F12 pagamento múltiplo | ✅ | ✅ | ✅ | 🟡 |
| Cancelamento auditado (status + corrige fechamento) | ✅ | ✅ | ✅ | ✅ |
| Persistência server-side (`venda-persist`) | ✅ | ✅ | ✅ | ✅ |
| PIN supervisor | 🟡 contra `User.pin` (não `AdminUser` — **DT-05**) | 🟡 | 🟡 | 🟡 |

---

## 3. Diferenças entre os PDVs (resumo)

1. **Teclado divergente** — cada PDV tem handler próprio; só o Clássico cobre o keymap inteiro + ajuda
   (End). Não há dispatch unificado a partir de `pdv-keymap.ts`. **Maior dívida arquitetural do HUB.**
2. **Pagamento** — 3 usam o modal compartilhado; Assistência tem modal próprio (decisão de UX);
   Venda Completa diverge no múltiplo.
3. **Busca** — ranking convergente (`scorePdvSearch`), UX divergente (tabela pro só no Clássico).
4. **Venda Completa** é o persistido **menos convergente** (sem F9, INSERT/F12/F7 parciais).
5. **Black/Next** é o **único que não persiste** (P0) e só apresenta rótulos de atalho.
6. **Legado** (`pdv-github-original`) é um **mirror completo morto** (próprio backend) — risco de
   confusão/manutenção; candidato a descomissionamento.

---

## 4. GAP Analysis vs mercado

> Benchmark contextual (capacidades consolidadas + `ROADMAP_PDV §3`). ✅ tem · 🟡 parcial · ❌ não tem.

| Capacidade | Smart Genius | Tiny PDV | Bling PDV | Varejo moderno (Avantpro/Linx/cloud) | **OmniGestão hoje** |
|---|:--:|:--:|:--:|:--:|:--:|
| Multi-perfil de PDV (balcão/super/assistência/completa) | 🟡 (assistência) | 🟡 | 🟡 | 🟡 | ✅ **diferencial** |
| Atalhos teclado-first | ✅ | 🟡 | 🟡 | ✅ | 🟡 (só Clássico completo) |
| Busca rápida + bipe EAN | ✅ | ✅ | ✅ | ✅ | ✅ |
| **NFC-e / SAT (fiscal)** | 🟡 | ✅ | ✅ | ✅ | ❌ **(P0)** |
| **TEF / pinpad (cartão integrado)** | 🟡 | ✅ | ✅ | ✅ | ❌ **(P0/P1)** |
| À prazo / crediário no PDV | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial (Enterprise)** |
| Sangria / suprimento / fechamento | ✅ | ✅ | ✅ | ✅ | ✅ (premium) |
| Multi-terminais com lock | 🟡 | 🟡 | 🟡 | ✅ | ✅ (lock+heartbeat; falta revalidar por tx) |
| Balança eletrônica (Toledo/Filizola) | ❌ | 🟡 | ✅ | ✅ | ❌ (P1) |
| Devolução/troca integrada ao PDV | 🟡 | ✅ | ✅ | ✅ | 🟡 (módulo à parte) |
| Impressão de cupom consistente (operador/cliente/pagamento) | ✅ | ✅ | ✅ | ✅ | 🟡 (3 pipelines divergentes) |
| Modo offline (vende sem internet) | ❌ | 🟡 | 🟡 | ✅ | ❌ (P2) |
| Fidelidade / pontos | 🟡 | 🟡 | 🟡 | ✅ | ❌ (P3) |
| Comanda / mesa (restaurante) | ❌ | 🟡 | 🟡 | ✅ | 🟡 (`controle-consumo` embrionário) |
| Cupom eletrônico via QR/WhatsApp | ❌ | 🟡 | 🟡 | ✅ | ❌ (P2/P3) |
| Ledger/auditoria imutável da venda | 🟡 | 🟡 | 🟡 | 🟡 | ✅ **diferencial** (`payload.historico[]` + cancelamento auditado) |
| Persistência garantida (zero venda perdida) | ✅ | ✅ | ✅ | ✅ | 🟡 (3 PDVs ✅; **Black/Next ❌**) |

**Leitura:** o OmniGestão **supera o mercado SMB** em multi-perfil, à-prazo nativo e
auditoria/cancelamento; **fica atrás** no **fiscal (NFC-e/SAT)**, **TEF/pinpad**, **balança**, **modo
offline** e **consistência de impressão** — exatamente o que separa um "PDV interno" de um "PDV de
varejo homologado".

---

## 5. Funcionalidades faltantes (consolidado)

### 🔴 Bloqueantes / críticas
- **Emissão fiscal NFC-e / SAT** (1 clique pós-venda) — hoje só comprovante interno.
- **Persistência server-side do Black/Next** (DT-01/BL-14) — risco de venda perdida.
- **TEF / pinpad** (cartão integrado) — padrão de varejo; hoje a forma de pagamento é só metadado.

### 🟡 Importantes
- **Convergência total de teclado** (dispatch único via `pdv-keymap.ts`) + Venda Completa em paridade (F9/F12/F7/INSERT).
- **Revalidação de lock por transação** (multi-terminais Fase 2).
- **Balança eletrônica** (WebSerial Toledo/Filizola) no Supermercado.
- **Devolução parcial dentro do PDV** (hoje só módulo Trocas/Devolução).
- **Impressão unificada** (cupom único com operador/cliente/forma de pagamento) + **export PDF/Excel do fechamento**.
- **PIN supervisor unificado** (`AdminUser`/tabela única — DT-05).
- **Paginação server-side do recebimento (F9)** (perf com muitos títulos).

### 🟢 Evolutivas
- Modo **offline** com fila (IndexedDB) + sync idempotente.
- **Comanda/mesa** madura (a partir de `controle-consumo`).
- **Fidelidade/pontos**, **cupom via QR/WhatsApp**, **Item Avulso com CFOP/categoria** (DT-06, pré-req fiscal).
- **Telemetria de latência** (`finalizarVenda`, busca) p/ a meta < 200 ms.
- **Descomissionar `pdv-github-original`** (mirror legado morto).

---

## 6. Melhorias prioritárias (P0–P3)

| Prioridade | Item | Por quê | Origem |
|---|---|---|---|
| **P0** | Persistência server-side do Black/Next | zero venda perdida | DT-01 / BL-14 |
| **P0** | NFC-e/SAT (adapter fiscal + ADR de provedor) | obrigação fiscal / paridade de mercado | BL-01, roadmap §6 |
| **P0/P1** | TEF/pinpad (adapter de cartão) | padrão de varejo; conciliação real | gap de mercado |
| **P1** | Convergência de teclado (dispatch único) + Venda Completa paridade | elimina divergência + bug de stale closure | `project_pdv_keydown_modal_deps` |
| **P1** | Revalidar lock no `finalizarVenda` | corrida multi-terminal | `project_pdv_multi_terminais_fase2_lock` |
| **P1** | Balança eletrônica (WebSerial) | Supermercado real | roadmap §6 |
| **P1** | Devolução parcial no PDV | fluxo de varejo | roadmap §6 |
| **P1** | Impressão unificada + export fechamento | consistência operacional/fiscal | `project_impressao_comprovantes_auditoria` |
| **P1** | PIN supervisor unificado | segurança/ACL | DT-05 |
| **P2** | Modo offline (IndexedDB + sync) | resiliência | roadmap §6 |
| **P2** | Paginação server-side do F9 | performance | roadmap (Lote 3 risco) |
| **P2** | Item Avulso CFOP/categoria | pré-req fiscal | DT-06 |
| **P2** | Comanda/mesa madura | vertical restaurante | `controle-consumo` |
| **P3** | Fidelidade · QR/WhatsApp cupom · voz/câmera | encantamento | roadmap §6 |

---

## 7. Plano de implementação por fases

> Alinhado a `ROADMAP_PDV §8`. S = ½ dia · M = 1–2 d · L = 3–5 d · XL = > 5 d.

### Fase 1 — Confiabilidade & Convergência (fechar o que está ~70%)
**Objetivo:** zero venda perdida + os 4 PDVs no mesmo motor de teclado/pagamento + multi-terminais robusto.
| Item | Esforço |
|---|---|
| Persistência server-side do Black/Next (plugar `operations-store`/`venda-persist`) | M |
| Dispatch único de teclado a partir de `pdv-keymap.ts` (adoção incremental, 1 PDV por vez) | L |
| Venda Completa em paridade (F9 + F12 + F7 + INSERT) | M |
| Revalidar lock no `finalizarVenda` (TTL crítico → 30s) | S |
| Unificar PIN supervisor (DT-05) | M |
| Testes E2E (Vitest + Playwright) dos 4 fluxos | L |
| Descomissionar `pdv-github-original` (mirror morto) | S |

### Fase 2 — Fiscal & Pagamento homologado
| Item | Esforço |
|---|---|
| **ADR de provedor fiscal** (TecnoSpeed/Focus/SAT próprio) + **adapter fiscal** (interface) | M |
| NFC-e/SAT em 1 clique pós-venda (POC → loja-piloto) | XL |
| **TEF/pinpad** adapter (cartão integrado + conciliação) | L |
| Item Avulso com CFOP/categoria padrão (DT-06) | S |
| Reimpressão, contingência e cancelamento fiscal | M |

### Fase 3 — Periféricos & Impressão pro
| Item | Esforço |
|---|---|
| Balança Toledo/Filizola via WebSerial | M |
| Leitor BT com fallback teclado + driver de gaveta | M |
| **Impressão unificada** (cupom com operador/cliente/forma) + export PDF/Excel do fechamento | M |

### Fase 4 — Offline & Fidelidade
| Item | Esforço |
|---|---|
| Modo offline (IndexedDB + fila + sync idempotente) | XL |
| Paginação server-side do recebimento (F9) | S |
| Programa de fidelidade/pontos integrado ao CRM | L |
| Comanda/mesa madura (a partir de `controle-consumo`) | L |

### Fase 5 — Mobile & Omnichannel
| Item | Esforço |
|---|---|
| PWA mobile com câmera (barcode) | XL |
| Cupom eletrônico via QR/WhatsApp | M |
| Venda iniciada no marketplace → finalizada no balcão (depende do BL-07 + Marketplace) | XL |

---

## 8. Riscos de execução
- **PDV é área protegida** (`GOVERNANCA §4`) — qualquer mudança no core exige autorização explícita.
- **Convergência pode quebrar fluxos legados** — convergir 1 PDV por vez, com E2E antes de cada merge.
- **Provedor fiscal único = ponto de falha** — arquitetar adapter (interface) antes de escolher.
- **Sem telemetria** hoje → as metas de performance (< 200 ms) não são verificáveis; instrumentar cedo.

---

## 9. Referências
- `docs/roadmaps/ROADMAP_PDV.md` (§3 concorrentes, §5 gaps, §6 futuras, §8 fases, §10 riscos).
- `lib/pdv-keymap.ts` · `lib/operations-store.tsx` · `app/api/ops/venda-persist/route.ts` · `app/actions/vendas-enterprise.ts`.
- `components/dashboard/vendas/**` (shells + modais compartilhados).
- Memórias: `project_pdv_caixa_estabilizacao`, `project_pdv_keydown_modal_deps`, `project_pdv_item_avulso_insert`, `project_payment_modal_twocolumn`, `project_pdv_f3_busca_tabela`, `project_venda_espera`, `project_aprazo_enterprise`, `project_pdv_multi_terminais_fase1`/`_fase2_lock`, `project_fechamento_caixa_erp_premium`, `project_fechamento_caixa_server_confirm`, `project_cancelamento_venda_fechamento`, `project_vendas_hub_correcao_operacional`, `project_impressao_comprovantes_auditoria`, `project_pdv_black_edition`.
- `CURRENT_STATUS.md` — entradas "PDV" (convergência INSERT+múltiplo, Lotes 3/4/5, À Prazo, multi-terminais).

---

*Auditoria read-only. Nenhum código, schema, migração ou banco alterado. Sem commit/push. As
prioridades acima são recomendação técnica — a abertura de cada fase exige decisão humana (e, para o
core do PDV, autorização explícita de área protegida).*
