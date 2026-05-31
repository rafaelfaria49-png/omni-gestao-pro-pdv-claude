---
title: Auditoria R0 — Reconciliação Governança × Realidade
status: baseline oficial (fase R0)
owner: Rafael (produto) + Opus (arquitetura)
data: 2026-05-30
modo: read-only / diagnóstico
estrategia: "Servir a operação real" (Onda III/36+ congelada até concluir R0 e R1)
baseline_congelamento: 4857ac5 (2026-05-28)
referencia_audit_anterior: docs/audits/AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
escopo: diagnóstico — NÃO executa alterações; serve de referência para a reconciliação
---

# AUDITORIA R0 — Reconciliação Governança × Realidade

> **Baseline oficial da fase R0.** Documento de diagnóstico read-only. Nenhum código, banco ou
> documento de governança foi alterado na produção desta auditoria. Serve de referência única
> para os lotes de reconciliação do R0.

**Baseline de congelamento detectado:** commit `4857ac5` (28/05) — último a tocar
`docs/{governance,execution,skills/executoras}`.

---

## 1. Resumo executivo

A governança (Sistema Operacional de Desenvolvimento, Blocos 0–35 + piloto) está
**estruturalmente intacta**, mas sua **camada de estado vivo congelou em 27/05** enquanto o
produto avançou **29 commits** em produção (28–30/05). Resultado: a "fonte da verdade" hoje
**contradiz o código** em pelo menos 9 documentos.

A divergência mais grave é sobre **Multi-Loja**: todos os status vivos ainda dizem
*"fallback `loja-1` silencioso ainda existe / P0 aberto"*, quando o **vetor crítico (leitura de
API server-side) foi eliminado** em S-001/S-002 (ADR-0003). Porém — e isto a narrativa de
retomada **não** captura — a eliminação **não foi total**: ainda há `LEGACY_PRIMARY_STORE_ID`
como fallback em **código client-side de PDV/vendas** e no **webhook WhatsApp** (F-04). A
reconciliação precisa registrar **ambos**: a dívida P0 foi paga no vetor que importava, mas
restam resíduos de menor risco + 1 P0 latente.

**Causa-raiz do drift:** a skill `SKILL_DOC_REFRESH` (criada justamente para evitar isto)
**nunca rodou** após o piloto. R0 é, na prática, fazer manualmente o que ela faria — e a lição
para o R1.

---

## 2. Estado real atual do sistema

| Dimensão | Realidade verificada |
|---|---|
| Produção | Sistema **em uso real** (PDV, Caixa, Financeiro, Estoque, Operações, Multi-loja, 2 lojas: principal + Rafa Brinquedos/loja-2) |
| Governança (Blocos 0–35) | Documentação completa e íntegra; **não tocada desde 28/05** |
| Piloto Multi-Loja | S-001 **mergeada** (ENTRY 009) + S-002 **concluída** (`c615e7c`) |
| Status vivos | **Congelados em 27/05** — 6 arquivos (`DIVIDA_TECNICA`, `RISCOS`, `BLOCKERS`, `MOCKS_TRACKING`, `LOCKS`, `CURRENT_STATUS_OVERVIEW`) |
| `CURRENT_STATUS.md` (detalhado) | **Razoavelmente atualizado** — tem entradas de S-001, S-002, Proteção de Lojas, Smart Genius |
| `EXECUTION_LOG.md` | Para na **ENTRY 009** (S-001). S-002 e operação real não registradas |
| Skills | 32 criadas · **8 aprovadas** · **~5 exercitadas** · 24 draft (nenhuma alteração desde 27/05) |
| Modos | Só **SAFE**. Engine usado 1× (S-001); depois **contornado** |

---

## 3. Divergências encontradas (visão consolidada)

| # | Categoria | Gravidade | Essência |
|---|---|---|---|
| D-1 | **Multi-loja marcado como P0 aberto** em 5 docs | 🔴 Alta | DT-03/R-02/BL-08/OVERVIEW/ROADMAP dizem "fallback existe"; vetor server-side foi eliminado |
| D-2 | **Eliminação tratada como total** (risco do oposto) | 🟠 Média | Há `LEGACY_PRIMARY_STORE_ID` residual client-side (4 arquivos) + F-04 webhook — não pode sumir do radar |
| D-3 | **Piloto invisível no estado vivo** | 🟠 Média | OVERVIEW §2 diz "último marco Lote 5 PDV 26/05"; S-001/S-002 não aparecem |
| D-4 | **EXECUTION_LOG incompleto** | 🟡 Baixa | S-002 sem ENTRY; fechamento real da S-001 (`7d304db`) não registrado |
| D-5 | **Rastros do piloto perdidos** | 🟡 Baixa | LOCKS §4 vazio (lock `MULTI_LOJA-S-001` nunca registrado/liberado) |
| D-6 | **29 commits de operação real** não refletidos | 🟠 Média | Mocks possivelmente removidos, dívidas possivelmente pagas — sem tracking |
| D-7 | **Auto-referência "a criar"** já criada | 🟡 Baixa | OVERVIEW §5/§8 dizem "DIVIDA_TECNICA (Bloco 23 — a criar)"; já existe |
| D-8 | **Memória viva com cookie errado** | 🟡 Baixa | `OMNIGESTAO_MASTER_MEMORY.md:127` cita `assistec_active_store` (underscores) — o próprio bug que F-03 corrigiu |

---

## 4. Documentos desatualizados (detalhe arquivo-a-arquivo)

### 4.1 `docs/ai/CURRENT_STATUS_OVERVIEW.md` — 🔴 Alta
- **Trecho:** §1 "Multi-loja 🔴 fallback `loja-1` silencioso ainda existe"; §3 próxima sprint #3 "Eliminar fallback loja-1"; §5 dívida #3 P0; §2 "último marco Lote 5 (26/05)"; §5/§8 "DIVIDA_TECNICA (a criar)".
- **Realidade:** fallback server eliminado (ADR-0003); S-001/S-002 rodaram; status vivos já existem.
- **Recomendação:** atualizar §1/§2/§3/§5; remover "a criar". **Prioridade #1 do R0.**

### 4.2 `docs/status/DIVIDA_TECNICA.md` — 🔴 Alta
- **Trecho:** DT-03 "Fallback `loja-1` silencioso · P0 · ⏳"; §3 (pagas) vazia.
- **Realidade:** vetor de API server pago (S-001/S-002). Resíduo client-side + F-04 remanescem.
- **Recomendação:** mover DT-03 para §3 (paga, com **nota de resíduo**); abrir DT-NN para o resíduo client-side (P2) se quiser rastrear; reavaliar DT-07 (ver §5).

### 4.3 `docs/status/RISCOS.md` — 🟠 Média
- **Trecho:** R-02 "Vazamento entre lojas · 🟡 · 🛡️ parcial · mitigação: fallback loja-1 ainda existe".
- **Realidade:** vetor crítico mitigado; probabilidade cai.
- **Recomendação:** atualizar mitigação ("fallback server eliminado em S-001/S-002; resta client-side + F-04"); manter 🛡️ parcial (não ✅ — F-04 mantém risco latente para 2ª loja).

### 4.4 `docs/status/BLOCKERS.md` — 🟠 Média
- **Trecho:** BL-08 "Lint customizado de `storeId` ausente · P0 · bloqueia eliminar fallback loja-1/DT-03".
- **Realidade:** DT-03 foi eliminado **sem** o lint (via guard 400 + testes). BL-08 deixou de ser blocker.
- **Recomendação:** **rebaixar** BL-08 para P2 (defesa-em-profundidade desejável, não bloqueante) ou mover para §3; mapa de dependência §4 perde a aresta `BL-08 → DT-03`.

### 4.5 `docs/roadmaps/ROADMAP_MULTI_LOJA.md` — 🔴 Alta
- **Trecho:** linhas 7, 61, 78, 97, 109-110, 145, 155, 161-162 tratam o fallback como pendente; §11 "próxima sugerida: Eliminar fallback loja-1".
- **Realidade:** feito (server). Fase 1 quase fechada; resta F-04/F-08/F-10 + resíduo client-side.
- **Recomendação:** §11 = registrar S-001/S-002 encerradas + próxima real (F-04); §12 atualizar; manter métrica "0 ocorrências loja-1" como **meta ainda não 100% atingida** (honestidade: client-side + F-04).

### 4.6 `docs/status/EXECUTION_LOG.md` — 🟡 Baixa
- **Realidade:** S-002 sem ENTRY; fechamento S-001 (`7d304db`) e merge não registrados.
- **Recomendação:** append ENTRY 010 (S-002, retroativa). **Não editar** entradas existentes (append-only).

### 4.7 `docs/status/LOCKS.md` — 🟡 Baixa
- **Realidade:** §4 histórico vazio; lock do piloto nunca registrado.
- **Recomendação:** registrar e encerrar o lock `multi_loja | MULTI_LOJA-S-001` em §4 (rastro histórico).

### 4.8 `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` — 🟡 Baixa
- **Trecho:** linha 127 "cookie `assistec_active_store`".
- **Realidade:** o nome correto é `assistec-active-store` (hífens) — o typo que F-03 corrigiu.
- **Recomendação:** corrigir o nome; atualizar "última revisão" e adicionar pointer ao piloto.

### 4.9 `docs/execution/INDEX.md §5` — 🟡 Baixa
- **Realidade:** Bloco 43 (piloto) **rodou**; tabela ainda mostra Onda V "⏳".
- **Recomendação:** marcar Bloco 43 ✅; anotar 44 (retro) e 45 (overnight) pendentes.

### 4.10 Documentos verificados que NÃO estão desatualizados
- `decisions/INDEX.md` §3 (lista ADR-0001/0002/0003 corretamente — só os *exemplos* de naming em §1.1 colidem por coincidência com números reais, cosmético).
- `skills/executoras/README.md` (catálogo coerente, 8 approved).
- `APPROVAL_BATCH_V1.md` (status `encerrado` = snapshot imutável correto).

---

## 5. Dívidas / Riscos / Blockers — ação de reconciliação

| Item | Hoje | Realidade | Ação |
|---|---|---|---|
| **DT-03** loja-1 fallback | P0 ⏳ | Pago (server) | ➡️ **Mover para pago** (§3) + nota de resíduo |
| **DT-07** webhook WhatsApp env fixo | P1 ⏳ | = **F-04**, ainda aberto; loja-2 ativa | ⬆️ **Manter, vigiar upgrade P0** (vira P0 quando loja-2 ligar WhatsApp) |
| **DT-01** PDV Next sem persistência | P0 ⏳ | Provável ainda aberto (memória confirma) | ✅ **Manter** (verificar no R0) |
| **DT-02** financeiro-v2 mock | P1 ⏳ | A verificar | ⏳ **Manter, verificar** |
| **R-02** vazamento multi-loja | 🛡️ parcial | Vetor crítico mitigado | ✏️ **Atualizar mitigação**, manter parcial |
| **R-06** drift estoque×ledger | já em §4 | OK | — manter |
| **BL-08** lint storeId | P0 | Não é mais blocker de DT-03 | ⬇️ **Rebaixar P2** ou §3 |
| **MOCK-04/06** operacoes/cadastros | ⏳ ativo | Possível remoção (commit `02be6c4`, "server-driven") | 🔍 **Verificar e mover se removido** |

> **Regra honesta para o R0:** nada é marcado "resolvido" sem evidência no código. DT-03 é o
> único com prova completa (ADR + testes + grep). Os demais entram como "verificar".

---

## 6. Estado real do Multi-Loja (preciso)

✅ **Concluído (verificado):** S-001 mergeada · S-002 concluída · fallback **server-side de
leitura de API** eliminado (guard `400`) · `storeId` ausente → erro explícito · ACL
`canAccessStore` (F-05/06/07/14) · proxy cookie corrigido (F-03) · `exportar` sem fallback
(F-02-anchor) · ADR-0003 aceito.

⚠️ **Resíduo verificado no código (grep) — não constava na narrativa:**
- `LEGACY_PRIMARY_STORE_ID` ainda é fallback client-side em `vendas-arquivo-geral.tsx:274`,
  `venda-completa-enterprise.tsx:140`, `pdv-venda-completa-enterprise.tsx:155`,
  `pdv-assistencia-enterprise.tsx` (3097 + chave de atalhos). Risco menor (UI quase sempre tem
  loja ativa), parcialmente coberto por **F-11 (P2)**.
- `lib/whatsapp/whatsapp-service.ts:36` (`webhookDefaultStoreId`) cai em `loja-1` =
  **F-04 / DT-07** — **P0 latente**.

⏳ **Aberto:** F-04 (webhook single-store), F-08 (sync-legacy-financeiro), F-09/F-10 (dados em
produção não auditados — pré-req da 2ª loja real).

**Veredito:** Multi-Loja **FUNCIONAL no vetor que importa** (vazamento cross-tenant via API
fechado). **Não 100% livre de `loja-1`** — afirmar o contrário seria impreciso e perigoso
(esconde F-04).

---

## 7. Estado real da operação pós-governança (29 commits, 28–30/05)

| Área | Mudanças (commits) |
|---|---|
| **Multi-loja** | S-001 (`6436d9b`,`2e6e7d5`,`22ae2e6`) · S-002 (`c615e7c`,`7d304db`) · isolar atalhos PDV Assistência por loja (`02be6c4`) |
| **Proteção de lojas** | Fase 1 anti-exclusão (`1f34c6e`) |
| **Caixa** | fechamento exige confirmação do servidor (`6398811`) · cache stale histórico (`7ec5c90`,`00d0a58`) |
| **PDV** | recibo térmico enriquecido (`b81012c`) |
| **Cadastros/Produtos** | paginação server 5000+ (`8019110`) · ranking de busca (`37bbd35`) · operações em massa+UX (`a2f7dfa`) · NCM/CEST (`7779522`,`a51e464`) |
| **Vendas** | UX arquivo geral (`24093d3`,`2190566`) |
| **Importador** | Smart Genius clientes/contas (`7b0c987`) · lotes anti-504 (`448c873`) · layouts GC+Smart (`adce3da`) |
| **UI/Tema** | seletor de temas premium (`3a990e4`) · dashboard responsivo (`a2f5be7`,`f0b4e8c`) · painel compacto (`9f2870b`) |

**Impacto na governança:** todas essas entregas (exceto S-001) ocorreram **fora do Engine** —
sem proposta, ENTRY de log ou audit. O `CURRENT_STATUS.md` detalhado as capturou; o **overview e
os status vivos, não**. Por isso o R0 precisa varrer esses 29 commits contra `MOCKS_TRACKING` e
`DIVIDA_TECNICA`.

---

## 8. Estado das skills e runtime

| Métrica | Valor |
|---|---|
| Skills criadas | 32 (11 Benchmark + 11 Audit + Doc_Refresh + 3 Propose + 5 Exec + Handoff_MVP) |
| Aprovadas (APPROVAL_BATCH_V1) | **8** |
| **Exercitadas de fato** | **~5** (AUDIT_MULTI_LOJA, EXEC_TESTING, PROPOSE_SPRINT, EXEC_DEBT_ITEM, HANDOFF_MVP) |
| Aprovada mas **não usada** (crítico) | **DOC_REFRESH** — sua não-execução **é a causa do drift** |
| Draft / teóricas | 24 |
| LOCKS MVP | Criado; **nunca registrado em §4** (lock do piloto não rastreado) |

**Recomendação sobre skills:** **não aprovar nenhuma skill nova agora.** A lacuna não é falta de
skill — é que a única skill de manutenção (`DOC_REFRESH`) não foi acionada. Em vez de aprovar
mais, o R1 deve decidir se `DOC_REFRESH` (hoje limitada a 2 arquivos) precisa de escopo maior
para sustentar reconciliações como esta.

---

## 9. O que deve ser atualizado no R0

1. 🔴 `CURRENT_STATUS_OVERVIEW.md` — multi-loja, sprints, dívidas, remover "a criar".
2. 🔴 `DIVIDA_TECNICA.md` — DT-03 → pago (+ resíduo); DT-07 vigiado.
3. 🔴 `ROADMAP_MULTI_LOJA.md` — §11/§12, gaps, métrica honesta.
4. 🟠 `RISCOS.md` (R-02) · `BLOCKERS.md` (BL-08).
5. 🟠 Varredura dos 29 commits → `MOCKS_TRACKING.md` + dívidas pagas.
6. 🟡 `EXECUTION_LOG.md` (ENTRY 010 S-002) · `LOCKS.md` (§4) · `memory` (cookie) · `execution/INDEX §5` (Bloco 43 ✅).

---

## 10. O que NÃO deve ser mexido agora

- ❌ Código de produção, banco, Prisma, `auth.ts`, `proxy.ts`.
- ❌ ADRs, sprints publicadas, `AUDITORIA_MULTI_LOJA_PRE_PILOTO` — **imutáveis** (a auditoria pré-piloto, aliás, **já** marca F-01/F-02/etc. como ✅ RESOLVIDO).
- ❌ `APPROVAL_BATCH_V1.md` — `status: encerrado`, é snapshot histórico (não reescrever 27/05).
- ❌ Entradas existentes do `EXECUTION_LOG` (append-only — só adicionar).
- ❌ Aprovar skills novas / iniciar Bloco 36+ / overnight / cowork / composite.
- ❌ Construir o lint customizado (BL-08) — é decisão de R1+, não de reconciliação.

---

## 11. Riscos de continuar sem reconciliação

| Risco | Impacto |
|---|---|
| Próxima sessão lê OVERVIEW e "re-resolve" DT-03 | Retrabalho; ou pior, mexe em multi-loja já estável |
| Narrativa "tudo resolvido" enterra **F-04** | 🔴 P0 latente estoura quando loja-2 ligar WhatsApp (vazamento de mensagens entre lojas) |
| Roadmap sugere sprint já feita | Decisão de priorização errada |
| Fonte da verdade desacreditada | Governança vira "teatro" — ninguém consulta, investimento dos Blocos 0–35 perdido |
| Drift cresce a cada commit | Quanto mais tarde o R0, maior o custo de reconciliar |

---

## 12. Plano recomendado para R0 (incremental)

| Passo | Conteúdo | Risco |
|---|---|---|
| **R0.1** | Correção factual crítica multi-loja (OVERVIEW + DIVIDA DT-03 + RISCOS R-02 + ROADMAP_MULTI_LOJA + BLOCKERS BL-08) | 🟢 docs |
| **R0.2** | Fechar rastros do piloto (EXECUTION_LOG ENTRY 010 + LOCKS §4) | 🟢 docs |
| **R0.3** | Varrer 29 commits → MOCKS_TRACKING + dívidas pagas (com verificação no código) | 🟢 docs |
| **R0.4** | Memória viva (cookie) + execution/INDEX (Bloco 43 ✅) | 🟢 docs |

Tudo **docs-only**, zero código/banco. Execução em modo **SAFE-lite**: um lote por vez, com
confirmação humana antes de cada escrita. (A quebra fina em lotes pequenos e independentes é
detalhada na proposta de execução do R0 que acompanha esta baseline.)

---

## 13. Próximo passo após R0

- **R1 — Retro do piloto (Bloco 44):** documentar *por que o Engine foi contornado* e definir o
  **SAFE-lite oficial** (o fluxo leve que a operação real já provou). Decidir o futuro de
  `DOC_REFRESH`.
- **Vigilância F-04:** antes de habilitar WhatsApp na loja-2, resolver o webhook single-store
  (é o único P0 latente real do multi-loja).
- **Onda III (36+), Overnight, Cowork, Composite permanecem adiados** — conforme a estratégia
  "Servir a operação real".

---

> Fim da baseline R0. A execução das alterações exige aprovação humana lote a lote.
