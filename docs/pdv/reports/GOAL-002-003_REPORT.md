# Relatório Final — PDV-SURFACES-NEXT-ROADMAP-RECONCILE-002-003

GOAL de auditoria e planejamento (antigos 002 + 003 + poda 006–032).
**Somente documentação; nenhum código de aplicação alterado; nenhuma
implementação do novo roadmap iniciada.**

## BASE / HEAD

- `BASE_SHA = 9a9626d091dd738aa292e122c697170a77a984e4` (`origin/main` no
  início; `git fetch origin --prune` executado no pre-flight).
- `origin/main` vigente no início = a fonte da verdade; contém GOAL 001
  (`3bcce80`) + P0 004 (`bfdb8e4`) + P0 005 (`9a9626d`).
- Branch:   `goal/pdv-surfaces-next-roadmap-002-003`; worktree paralelas
  preservadas).
- `origin/main` ao final: revalidada antes do commit (§10); arquivos de
  PDV/Vendas sem avanço relevante — nenhuma re-auditoria necessária além da
  checagem.

## Classificação de cada superfície

| Superfície | Classe | Status |
|---|---|---|
| PDV Classic | MOTOR (shell base) | produção |
| PDV Assistência | MOTOR (variante domínio) | produção |
| PDV Supermercado | MOTOR (variante domínio) | produção |
| Next / Black Edition | MOTOR experimental + SHELL própria | experimental |
| `PdvBlackShell` | SHELL presentacional | experimental |
| Modo Rápido | MODE transversal | produção |
| Venda Completa | FLOW + MOTOR | produção |
| Mesas / Consumo | FLOW (não finaliza) | produção gated |
| `pdv-venda-completa-enterprise.tsx` | LEGACY morto | órfão |
| `pdv-github-original` | LEGACY espelho | legado |
| `PdvNeonShell` | LEGACY morto | órfão |
| `PdvOmniClassicShell` | SHELL ativa do Classic | produção |
| VendasHub | SHELL navegação | produção |

Detalhe com rota/raiz/motor/pagamento/caixa/estoque/cliente/impressão/
offline/settings/localStorage por superfície: `PDV_SURFACES_NEXT_RECONCILE_002_003.md` §2–§4.

## Decisão final sobre Next/Black

**C — absorver componentes do Next nos PDVs atuais** (manter gated como lab
até a absorção). Não-A (7×P0 + 5×P1, botões mortos, troco divergente),
não-B definitivo (custo de paridade ≈ reescrever o já pronto), não-D
(bipe 3x+remoto, search panel, guard fail-closed e shell denso são
portáveis). Sequência: gate mantido → portar borda → corrigir
desconto/cashTendered/escopo → reavaliar A; nunca D puro.

## Matriz resumida de gaps (Next/Black × melhor atual)

REAL 3 (catálogo/busca, multipagamentos herdado, erros fail-closed) ·
PARCIAL 9 (carrinho, cliente, CPF, formas/loja, a-prazo, caixa/troco, offline
UX, balança manual, atalhos) · PLACEHOLDER 2 (desconto F8, devolução F6) ·
AUSENTE 10 (acréscimo-geral, espera F11, impressão, correção, acessórios,
serviços, OS, avulso, favoritos, mesas) · N/A condicional 3.
P0s: desconto, formas por loja, caixa-escopo/troco, espera, impressão,
devolução, acessórios/serviços por segmento, offline-UX. Matriz completa (24
itens, evidência+prioridade+referência): doc 002-003 §5.

## Estado dos dois P1

- **P1-a (sucesso visual pendente): TODAS as 6 bordas afetadas** (Classic,
  Super, Assistência, Completa, órfã, Black). Motor retorna `ok+pending`
  (`operations-store.tsx:2189-2222`); callers limpam carrinho + toast de
  sucesso checando só `!result.ok`. Retry existe; falta honestidade na UX.
- **P1-b (descarte silencioso): 4 afetadas** (Classic, Super, Completa, órfã —
  total sobre carrinho cheio × `saleLines` filtrado); **2 fail-closed**
  (Assistência sem filter; Black guard `:357-373`).
- Padrão mais seguro: **guard do Black + honest-pending da Completa**.
- **Um único GOAL de integridade do motor (N1)** cobre ambos: mesma fronteira,
  mesmos arquivos, mesmo risco.
- P0 004 e 005 **presentes e verificados** no HEAD; não tocaram P1-a/P1-b.

## Tabela 006–032

| # | Classe | Novo GOAL |
|---|---|---|
| 006 | MERGE | N4 |
| 007 | MERGE | N4 |
| 008 | MERGE | N4 |
| 009 | MERGE | N4 |
| 010 | DEFER | N7 |
| 011 | MERGE | N6 |
| 012 | MERGE | N4 |
| 013 | MERGE | N3 |
| 014 | ALREADY_DONE | — |
| 015 | MERGE | N3 |
| 016 | MERGE | N3 |
| 017 | MERGE | N3 |
| 018 | MERGE | N6 |
| 019 | MERGE | N6 |
| 020 | MERGE | N6 |
| 021 | DEFER | N7 |
| 022 | MERGE | N4 |
| 023 | MERGE | N1 |
| 024 | MERGE | N4 |
| 025 | MERGE | N4 |
| 026 | MERGE | N4 |
| 027 | DROP | (salvados em N2) |
| 028 | KEEP | N5 |
| 029 | DEFER | FUTURE |
| 030 | PARTIAL | N1/N2 + FUTURE |
| 031 | DEFER | FUTURE |
| 032 | DEFER | FUTURE |

Objetivo/estado/evidência/motivo/dependências por GOAL: `PDV_CAPABILITIES_ROADMAP_REDUCED_002_003.md` §1.

## Contagens e novo roadmap

- GOALs antigos mantidos idênticos: **1** (028→N5).
- Eliminados/fundidos/adiados: **26** (18 MERGE + 1 ALREADY_DONE + 1 PARTIAL + 5 DEFER + 1 DROP).
- **Novo total: 7 GOALs** (N1 motor-integrity, N2 next-absorb, N3
  settings-server-first, N4 capability-runtime, N5 parity-suite, N6
  settings-UI FUTURE, N7 entitlement FUTURE).

## MUST HAVE / FUTURE

- MUST HAVE: N1 + N2 + N3 + N4 + N5 (+ P2s embutidos: acessório na Completa,
  turno/cupom/mesas escopados, copy fiscal do HUB).
- FUTURE/OPTIONAL: N6, N7 (aguarda Rafael), películas, accessory-gating,
  quickServices/OS expansion, trilha fracionada (G13), presets, remoção de
  órfãos (com aprovação).

## Definition of Done proposta

10 critérios (doc roadmap §4): integridade de venda · caixa/financeiro/estoque
· paridade necessária · erros honestos · multi-loja · impressão · offline/sync
· Next (C executada) · capabilities em runtime (UI/billing fora) · testes
(N5 + 004 + 005 verdes).

## Arquivos criados (3, somente documentação)

- `docs/pdv/PDV_SURFACES_NEXT_RECONCILE_002_003.md` (Partes A/B/C).
- `docs/pdv/PDV_CAPABILITIES_ROADMAP_REDUCED_002_003.md` (Partes D/E).
- `docs/pdv/reports/GOAL-002-003_REPORT.md` (este relatório).

Nenhum código, schema, migration, config ou worktree alheia tocada. Áreas
protegidas (auth/proxy/schema/core): intocadas.

## Validações

- `git diff --check`: limpo.
- `git status --short`: exatamente os 3 documentos.
- `git fetch origin --prune` pré-commit + checagem de avanço da main em
  PDV/Vendas: sem impacto sobre os vereditos.
- Type-check/build: **não aplicáveis** (só `.md`).
- `CURRENT_STATUS.md`/`CHANGELOG.md`/`MASTER_MEMORY`: **não atualizados** —
  tarefa de auditoria/planejamento, sem mudança de estado de módulo
  (conforme DELIVERY_CHECKLIST §2: sem mock→real, sem feature).

## Commit / push

- Commit: `docs(pdv): consolidar superficies next e roadmap` (stage arquivo a
  arquivo; nunca `add .`).
- Push: somente `origin/goal/pdv-surfaces-next-roadmap-002-003`. Sem push para
  main, sem PR automático. **Ponto de parada respeitado: nenhuma implementação
  do novo roadmap iniciada.**

## Riscos e dúvidas restantes

1. Contagens de linhas citadas podem variar ±poucas linhas por formatação;
   símbolos/arquivos são estáveis e verificáveis por `git grep`.
2. Runtime real (caixa, térmica, balança, SEFAZ) não executado — N1/N2 devem
   validar em 2 lojas físicas antes do merge.
3. `trocas-devolucao.tsx:421` chama o motor e ficou fora do escopo 001 —
   incluída no N1; criação server-side de títulos a-prazo no retry pendente
   merece atenção no N1.
4. Remoção de órfãos/legados e decisões comerciais (G5/entitlement, presets,
   default futuro do Next, G10/G13) exigem Rafael — registradas, nunca
   assumidas.
5. Modelos recomendados (Opus 4.8/Sonnet 5) indisponíveis neste ambiente;
   todas as afirmações carregam evidência `arquivo:linha` auditável.
