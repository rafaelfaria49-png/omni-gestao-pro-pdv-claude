---
title: Roadmap — HUB PDV
hub: pdv
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-06-01
sprint_atual: Pausa operacional PDV (estabilização em uso real, pré-BL-07)
---

# 🛒 Roadmap — HUB PDV (Ponto de Venda)

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) (entradas marcadas "PDV").

---

## 1. Visão

> **Um único PDV omnicanal, premium, rápido como Avantpro, robusto como SAP/Bling, com inteligência operacional integrada (Omni Agent, fiscal, multi-terminais).**

O PDV é o **ponto de entrada de receita** do ERP. Precisa ser confiável (nunca perde venda), rápido (operador não espera), e versátil (atende balcão, supermercado, assistência técnica e venda completa no mesmo motor).

---

## 2. Objetivos

1. **Zero venda perdida** — toda venda finalizada é persistida no servidor (não fica só em localStorage).
2. **Operação multi-terminais segura** — N PDVs por loja, sem conflito de caixa, com lock server-side.
3. **Convergência funcional** — 4 PDVs (Clássico, Supermercado, Assistência, Venda Completa) + Black Edition compartilham o mesmo core de regras.
4. **Latência < 200 ms** em ações críticas (lançar item, finalizar venda) com até 50 mil produtos.
5. **Fiscal pronto** — emissão de NFC-e / SAT em 1 clique a partir da venda finalizada.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Avantpro** | UX de balcão extremamente rápida (atalhos de teclado, fluxo de venda em 3 teclas). Inspiração para keymap-base unificado. |
| **Bling** | Boa cobertura fiscal nacional (NFC-e, SAT, NFe). Referência para o módulo fiscal do PDV. |
| **Mercado Turbo** | Foco em multi-loja e marketplace — útil para a integração futura PDV ↔ Marketplace. |
| **SAP Business One** | Robustez de auditoria e logs imutáveis. Referência para `payload.historico[]` nas vendas. |
| **Lojinha do Brás (whitelabel pequeno)** | Item avulso com tecla rápida — adotado como tecla INSERT. |

---

## 4. Diferenciais

- **4 perfis de PDV em 1 motor**: Clássico (balcão), Supermercado (alta cadência + balança), Assistência (vinculado a OS), Venda Completa (catálogo rico). Plus Black Edition (modo escuro/premium).
- **À Prazo Enterprise nativo**: entrada + N parcelas + vencimento, totalmente integrado ao Financeiro via `ContaReceberTitulo`.
- **Item Avulso (tecla INSERT)**: vende item não cadastrado sem hack — flag `isVirtualSaleLine` pula estoque.
- **Venda em Espera (F7)**: suspende/retoma venda sem tocar estoque/financeiro. localStorage por `storeId+terminalId`.
- **Cancelamento auditado**: venda nunca some — só muda `status`; corrige fechamento de caixa automaticamente.
- **Multi-terminais com lock + heartbeat**: TTL 120s, "Assumir/Liberar" admin, degrada sem bloquear se servidor cair.

---

## 5. Gaps atuais

> Cruzar com [`CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) — entradas até 2026-05-26.

| Gap | Severidade | Origem |
|---|---|---|
| **PDV Next (Black Edition) NÃO persiste vendas no servidor** — fica só em localStorage | 🔴 P0 | `memory/project_pdv_caixa_estabilizacao` |
| **Venda não revalida lock por transação ainda** (multi-terminais Fase 2 incompleto) | 🟡 P1 | `memory/project_pdv_multi_terminais_fase2_lock` |
| **Sem emissão fiscal real** (NFC-e / SAT) — venda termina como "comprovante interno" | 🔴 P0 | gap declarado |
| **PIN de supervisor** valida contra `User.pin`, não `AdminUser` — falta unificar | 🟡 P1 | `memory/project_vendas_hub_correcao_operacional` |
| **Pagamento Múltiplo** convergido nos 3 PDVs principais (Lote 5 ✅), mas Venda Completa ainda diverge | 🟡 P1 | `CURRENT_STATUS.md` linha 307 |
| **Item Avulso sem categoria/CFOP padrão** — bloqueia fiscal | 🟢 P2 | implícito do `__avulso__` |
| **F9 (Recebimento de Contas)** convergente nos 3 PDVs ✅, mas sem testes automatizados | 🟢 P2 | `CURRENT_STATUS.md` linha 232 |
| **Balança eletrônica** ainda não integrada (Supermercado) | 🟡 P1 | gap de produto |
| **Leitor de código de barras Bluetooth** sem fallback se desconectar | 🟢 P2 | gap de produto |
| **Fechamento de caixa** premium ✅ (helper consolidado), mas exporta para PDF/Excel ainda manual | 🟢 P2 | `memory/project_fechamento_caixa_erp_premium` |

---

## 6. Funcionalidades futuras

Priorizadas (P0 = bloqueia operação, P3 = nice-to-have):

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Persistência server-side do PDV Next** (eliminar risco de venda perdida) | P0 |
| 2 | **Emissão NFC-e / SAT** com 1 clique pós-venda | P0 |
| 3 | **Lock por transação** (revalidar lock no momento de finalizar venda) | P1 |
| 4 | **Convergência total dos 4 PDVs** no mesmo motor (Venda Completa = último) | P1 |
| 5 | **Balança eletrônica** (protocolo Toledo/Filizola via WebSerial) | P1 |
| 6 | **Devolução parcial direto no PDV** (hoje só Trocas/Devolução) | P1 |
| 7 | **Modo offline com fila** (vende sem internet, sincroniza ao voltar) | P2 |
| 8 | **Comanda/Mesa** (modo restaurante) — variante do Supermercado | P2 |
| 9 | **Programa de fidelidade integrado** (pontuação automática por venda) | P2 |
| 10 | **Cupom fiscal eletrônico via QR** (consumidor recebe no celular) | P2 |
| 11 | **Reconhecimento de produto por câmera** (mobile PDV) | P3 |
| 12 | **Comando de voz para item avulso** (Omni Agent integrado) | P3 |

---

## 7. Backlog (granular, pronto para virar sprint)

| Item | Tamanho | Pré-req |
|---|---|---|
| Investigar e plugar persistência server-side do PDV Next | M | Auditoria do fluxo de `salvarVenda` atual |
| Implementar revalidação de lock no `finalizarVenda` | S | Multi-terminais Fase 2 ✅ |
| Convergir Venda Completa no helper `pagamentoMultiplo` | S | Lote 5 ✅ |
| Unificar PIN supervisor (`AdminUser.pin` ou tabela única) | M | Discussão de modelo |
| Definir CFOP/categoria padrão para Item Avulso | S | Decisão de produto |
| Spike fiscal: NFC-e em 1 clique (POC) | L | Definir provedor (TecnoSpeed / Focus / próprio) |
| Integração balança Toledo via WebSerial | M | Hardware para teste |
| Export PDF do fechamento de caixa | S | Helper resumo ✅ |
| Testes E2E F9 recebimento de contas | S | F9 convergente ✅ |
| Devolução parcial dentro do PDV | M | Auditoria do Trocas/Devolução atual |

---

## 8. Fases

### Fase 1 — Confiabilidade total (em curso, ~70% feita)
**Objetivo:** zero venda perdida + 4 PDVs convergentes + multi-terminais robusto.
**Critério de saída:**
- PDV Next persiste vendas no servidor.
- Lock revalida na finalização.
- Os 4 PDVs compartilham o mesmo `pagamentoMultiplo`, `keymap-base`, `F9`, `F7`, INSERT.
- Cobertura de testes E2E nos 4 fluxos.

### Fase 2 — Fiscal nativo
**Objetivo:** emitir NFC-e/SAT direto do PDV em 1 clique.
**Critério de saída:**
- Provedor fiscal escolhido (ADR).
- 1 loja-piloto emitindo cupom real em produção.
- Reimpressão, contingência e cancelamento fiscal cobertos.

### Fase 3 — Periféricos pro
**Objetivo:** balança, leitor BT, gaveta, impressora térmica — todos plug-and-play.
**Critério de saída:**
- Balança Toledo/Filizola integradas.
- Leitor BT com fallback teclado.
- Driver de gaveta detectado automaticamente.

### Fase 4 — Modo offline + fidelidade
**Objetivo:** PDV opera sem internet (até 24h) + programa de pontos nativo.
**Critério de saída:**
- IndexedDB com fila de vendas pendentes.
- Sincronização idempotente ao voltar online.
- Pontuação automática por venda integrada ao CRM.

### Fase 5 — Mobile + omnichannel
**Objetivo:** PDV em tablet/celular para vendedor de chão + integração Marketplace.
**Critério de saída:**
- App PWA com câmera para barcode.
- Venda iniciada no marketplace finalizada no balcão (e vice-versa).

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Estoque** | Consumir saldo no `finalizarVenda`; mexer no ledger é serial com Estoque (ver matriz §4 do INDEX) |
| **Financeiro** | Materializar `ContaReceberTitulo` (À Prazo + recebimento direto); F9 lê títulos abertos |
| **CRM** | Vincular cliente à venda (FK `Venda.clienteId` ✅) e ler crédito persistente (`ClienteCredito`) |
| **Multi-loja** | Todo registro escopado por `storeId`; `terminalId` é por loja |
| **Omni Agent** | Futuro: Omni Agent executa "registrar venda avulsa" via comando |
| **WhatsApp** | Futuro: enviar cupom fiscal eletrônico via WhatsApp pós-venda |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **PDV Next perde vendas em caso de crash/fechamento de aba** | Técnico — P0 | Plugar persistência server-side (Fase 1, prioridade máxima) |
| **Lock multi-terminais não bloqueia em concorrência alta** (TTL 120s pode ser exploitado) | Técnico — P1 | Revalidação por transação + redução do TTL crítico para 30s |
| **Provedor fiscal único = ponto de falha** | Negócio — P1 | Arquitetar adapter fiscal (interface) antes de escolher provedor |
| **Migração de schema (`Venda`, `ContaReceberTitulo`)** durante alta operação | Operacional — P0 | Janela de baixa + rollback testado (Sonnet) |
| **Convergência total quebra fluxos legados** | Técnico — P1 | Convergir 1 PDV por vez, testes E2E antes de cada merge |
| **Item Avulso virar atalho para sonegação** (sem CFOP) | Negócio/fiscal — P1 | Bloquear avulso sem categoria fiscal antes da Fase 2 |
| **Hardware fiscal homologação demorada** | Negócio — P2 | Começar processo de homologação em paralelo à Fase 2 |

---

## 11. Sprint atual

**Pausa operacional PDV — estabilização em uso real (aberta 2026-06-01, pré-BL-07).** Desvio
**controlado** da sequência do roadmap: o PDV entrou em **operação real na loja** e correções de
fluxo, teclado, busca, bipe, finalização, toast e UX viraram prioridade **antes** de abrir o **BL-07**
(estoque multi-depósito — modelo já decidido em **ADR-0007**). Entregas recentes desta pausa:
DT-B anti-negativo (`ec04043`), busca multi-termo + bipe + atalho INSERT (`b9c147d`), toast/UX +
Resumo do Caixa em 2 colunas (`3bc0e70`), modal de pagamento 2 colunas + teclado (`03b4ac2`), modal
de pagamento **sem F11** + **busca F3 profissional** (`292e073`), UX inspirada no **Smart Genius**.

Próxima sprint sugerida (após a pausa): **SPRINT_NN_PDV — Persistência server-side do PDV Next**
(item P0 do backlog §7). **Sequência oficial:** finalizar PDV operacional → **BL-07** (estoque
multi-depósito, Fase 0 `ESTOQUE-S-00x`) → **Fiscal** (NFC-e/SAT). **Importador Universal IA adiado.**

---

## 12. Status atual

> Resumo consolidado em 1 parágrafo.

PDV está **operacional e estável** nos 3 perfis principais (Clássico, Supermercado, Assistência) com keymap-base, pagamento múltiplo, F9 recebimento, F7 venda em espera, INSERT item avulso, À Prazo Enterprise, multi-terminais com lock + heartbeat, e fechamento de caixa premium — tudo convergente e persistido. **Risco crítico isolado: PDV Next (Black Edition) ainda não persiste no servidor**, vivendo em localStorage — vendas podem ser perdidas em caso de crash. Próximo passo lógico é fechar a Fase 1 plugando essa persistência antes de partir para fiscal (Fase 2). Cancelamento de venda audita corretamente e o fechamento de caixa não vaza mais payload desatualizado (bug resolvido em `vendas-list` + `caixa-fechamento-resumo`). **Pausa operacional em curso (01/06/2026):** estabilização do PDV em uso real — modal de pagamento **sem F11**, **busca F3 profissional** (tabela + teclado, tipo Smart Genius), bipe, busca multi-termo e anti-negativo (DT-B) — **precede a abertura do BL-07**.

---

## 13. Métricas de sucesso

| Métrica | Meta | Como medir |
|---|---|---|
| Vendas perdidas (não persistidas) | **0/mês** | Cruzar localStorage vs `Venda` no DB |
| Latência mediana de `finalizarVenda` | **< 200 ms** | Telemetria server-side |
| Conflitos de lock multi-terminal não resolvidos | **0/semana** | Log de `terminal/lock` |
| Erros de pagamento múltiplo (`saldo restante > 0` ao confirmar) | **0/semana** | Validação no `finalizarVenda` |
| Tempo médio de fechamento de caixa | **< 90 s** | Telemetria UI |
| Cobertura de testes E2E dos 4 fluxos de PDV | **100%** | Vitest + Playwright |
| Taxa de emissão fiscal bem-sucedida (pós-Fase 2) | **> 99%** | Webhook do provedor |

---

## 14. Blockers

| Blocker | Bloqueia | Owner |
|---|---|---|
| **Decisão de provedor fiscal** (ADR pendente) | Fase 2 inteira | Humano (produto) |
| **PDV Next sem persistência** | Encerramento Fase 1 | Sonnet (técnico) |
| **Hardware fiscal homologação** | Loja-piloto NFC-e | Operação |

Status vivo em `docs/status/BLOCKERS.md` (a criar — Bloco 23).

---

## 15. Referências

- **ADRs relacionados:** — (nenhum ADR formal de PDV ainda; criar quando definir provedor fiscal)
- **Auditorias relacionadas:** — (nenhuma auditoria dedicada de PDV ainda; recomendado executar uma após Fase 1)
- **Sprints relacionadas:** todas as entradas "PDV*" em [`CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) (linhas 175, 232, 307, 428, 448, 467, 491, 540, 559, 589, 639, 662, 737, 908, 934, 959, 1178, 1243, 1585).
- **Docs de módulo:** `docs/modules/` (verificar se existe `PDV.md`; criar se ausente).
- **Blueprint:** `docs/blueprint/MASTER_PLAN.md` (Bloco 24, a criar).
- **Memórias persistentes (MEMORY.md):**
  - `project_pdv_caixa_estabilizacao`
  - `project_pdv_multi_terminais_fase1`
  - `project_pdv_multi_terminais_fase2_lock`
  - `project_pdv_item_avulso_insert`
  - `project_pdv_black_edition`
  - `project_aprazo_enterprise`
  - `project_venda_espera`
  - `project_cancelamento_venda_fechamento`
  - `project_fechamento_caixa_erp_premium`
  - `project_vendas_hub_correcao_operacional`
- **Governança:** `docs/governance/GOVERNANCA.md` (PDV é área protegida — exige autorização explícita para mudança no core).
