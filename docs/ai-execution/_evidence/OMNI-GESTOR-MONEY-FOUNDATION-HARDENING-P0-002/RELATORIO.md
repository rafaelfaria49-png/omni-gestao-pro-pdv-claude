# OMNI-GESTOR-MONEY-FOUNDATION-HARDENING-P0-002

Data: 2026-11-25. PR #405 (draft). Base auditada `a6c7223`; main integrada `2b0239d` (#401) por merge.
Módulo continua **desligado** (`GESTOR_MONEY_ENABLED`, só `"true"` liga). Nenhuma migration em
Production, nenhum dado real alterado, nenhum custo externo. Commits originais G001–G006, as sete
worktrees protegidas, o backup verificado e as evidências anteriores foram preservados.

## Etapa 1 — fronteira server-only (build da CI)

- Causa: `AparelhosPanel` (cliente) → `print-client` → `documents` → `lib/aparelhos/financeiro.ts`
  → `lib/gastos/financeiro-scope.ts` (`server-only` + Prisma). Introduzida pela reconciliação G002.
- Correção: `lib/aparelhos/financeiro.ts` volta a ser puro; o writer só informa `criado`, e a
  adoção do título NOVO no escopo EMPRESA acontece no chamador de servidor (`lib/aparelhos/service.ts`),
  na mesma transação.
- Varredura do grafo de imports (cliente `"use client"` → … → `server-only`), validada contra a
  regressão real: 0 cadeias introduzidas pela branch. Incluindo importadores de Prisma sem
  `server-only`, há 3 cadeias **pré-existentes na main** (operations-store→automation-engine,
  contador-dados-reais→readers/fiscal, agentic-ui→ai-local-suggestion) — fora do escopo, relatadas.

## Etapa 2 — main + #401

- Merge sem conflito textual; os 4 arquivos sobrepostos preservam integralmente a #401.
- Writer novo da #401 (reembolso da troca) passa pela ponte de escopo (inerte desligado).
- Provas: trocas/devoluções PG **25/25** (dono e runtime restrito; código novo e código da main);
  unitários da #401 1.084 (Node 26) + 872 jsdom (Node 22).
- Pré-existente na main após a #401: `lib/operations-store-sale-conflict-safety.test.ts` procura um
  marcador (`const flushPendingDevolucoes = useCallback`) que não existe nem na main — relatado.

## Etapa 3 — P0 RLS e privilégios (resolvido)

Contrato embutido nas migrations, na MESMA transação de cada `ENABLE ROW LEVEL SECURITY`:
- EMPRESA (`"storeId"` NOT NULL): visível ao runtime, como antes; isolamento entre lojas continua na
  aplicação (`requireModuleApi`/`canAccessStore` + filtros), idêntico à main.
- PESSOAL (`"storeId"` NULL): só na transação que declara o dono em `app.gm_owner_user`
  (`set_config(..., true)`), feito pelo servidor depois da revalidação do contexto opaco G001 —
  `access.ts`, `comContextoFinanceiro` (G002), `comLeituraFinanceira` (G003), `emTransacaoGasto` (G004).
- `gm_perfil_pessoal_contexto()` SECURITY DEFINER, `search_path` fixo, curto-circuito sem contexto.
- Papéis do worker G006 ficam fora (mantêm só as policies por papel do G006).
- Sem BYPASSRLS, superusuário, FORCE, GRANT ou desligar RLS.

Provas (PG 17 descartável, runtime NÃO dono, NOBYPASSRLS, só GRANTs de DML):
- legado: 20.001 movimentos / 5.000 títulos / 4 carteiras legíveis; INSERT/UPDATE ok;
- SQL: sem contexto 0 linhas pessoais; dono vê só o seu e a empresa continua visível; COMMIT e
  ROLLBACK limpam o contexto na mesma conexão (pool); gravar no perfil alheio recusado; dois donos
  concorrentes isolados e uma conexão sem contexto em paralelo vê 0;
- aplicação: `test/gastos/rls-runtime-restrito.postgres.test.ts` **7/7** (idempotente);
- suítes da main com runtime restrito: F9 32/32, integração 14/14, trocas 25/25; as únicas falhas
  (estorno P1 1, recebimentos F9 2) são do harness, que cria FUNCTION/TRIGGER por DDL.
- Pré-condição residual de ATIVAÇÃO (não de implantação): runtime restrito precisa de GRANTs nas
  tabelas novas antes de ligar o Gestor Money; desligado, nenhuma tabela nova é consultada.

## Etapa 4 — os sete P1

| P1 | Situação |
|---|---|
| Estornos #397 | Conta do pagamento **estornado** (refHistoricoIndex ↔ k-ésimo movimento original, só com ledger consistente e valor conferido); senão a regra anterior. PG: estorno do 1º pagamento volta na conta A (desativada), não na B. Callers: Pagar, F9 receber, OS V3. **Resolvido.** |
| Triggers × contas desativadas | Writers da main já escolhem carteira `ativo:true`; estornos passam pela exceção (≤ líquido). Recusa explícita só de lançamento NOVO manual em conta desativada/de outra loja. **Resolvido (documentado).** |
| Perfil EMPRESA desativado | Desligado, nunca congela: writers, materialização de saldo, leitores, Contador externo e consulta G005 seguem a main. Ligado, a regra estrita do G002/G003. **Resolvido.** |
| WhatsApp × loja principal | Paridade com o callback JWT da main: `lojaId` só vale sem nenhum vínculo `AdminUserStore`. **Resolvido.** |
| Consultas ilimitadas | O G005 carregava todos os movimentos/títulos da loja e um registro legado anômalo derrubava o relatório inteiro. Desligado, relatórios/KPIs/exportações/DRE/fluxo/analytics/carteiras e o resumo do Omni Agent usam a implementação da main (cópia fiel em `lib/financeiro/legado-main/`, consultas por período). **Resolvido para Production; residual de ativação: refatorar `carregarConsulta` para carga limitada antes de ligar.** |
| Fechamento (achado novo) | Desligado: chave do dia UTC da main; auditoria com `dataReferencia`/`mes`/`ano`/`motivo`; snapshot do DRE opcional. **Resolvido.** |
| Auditoria NaN/Infinity | `AUDITORIA_PRE_MIGRATION.sql` acusa (BLOQUEIO) e a migration não altera o dado (fingerprint idêntico). Decisão por linha é operacional. **Residual operacional.** |
| Fluxo governado de PerfilMembro | Necessário só para ativar; desligado não há grant exigido. **Residual de ativação (fora do escopo).** |

## Etapa 5 — migrations e rollout

Ensaio realista: schema da main em `7102f27` + 30 migrations registradas como aplicadas; pendentes
P03 (#367), SaaS #398 e as 5 do Gestor Money; massa legada sintética antes; "PDV" gravando pelo
runtime restrito **durante** o deploy.

Defeitos encontrados e corrigidos:
1. **Janela de indisponibilidade**: RLS ligava antes das policies → INSERTs do PDV recusados no meio
   do deploy. Agora o contrato nasce na mesma transação do ENABLE.
2. **Deadlock** DDL do G004 × INSERT do PDV (`contas_pagar_titulos` ↔ `movimentacoes_financeiras`).
   Agora `SET LOCAL lock_timeout = '500ms'` (< `deadlock_timeout` 1 s): a migration desiste inteira
   e atômica — nunca a venda — e é reaplicada com `migrate resolve --rolled-back`.
3. G001–G003 sem `BEGIN/COMMIT` explícitos → agora explícitos (falha intermediária sem estado parcial,
   provado: G001 com erro de sintaxe abortou sem criar nada).

Resultado final: P03 + SaaS + 5 aplicadas na 1ª tentativa (18 s; G004 944 ms, G002 476 ms); PDV
**1.500/1.500** sem erro durante o deploy; fingerprints (títulos, movimentos, carteiras, produtos,
soma) idênticos antes/depois; 0 perfis/0 membros criados; drift Prisma zero; `migrate status` em dia.

Compatibilidade:
- **Código da main (Production atual) × schema migrado**: F9 32/32, integração 14/14, trocas 25/25
  (dono e restrito), recebimentos F9 26/26, estorno P1 24/24.
- **Código novo, flag desligada**: F9 32/32 (dono e restrito), estorno P1 24/24, integração 14/14,
  recebimentos F9 26/26; runner PG do CI `SUITES_PG_OK` (Aparelhos aplica as migrations: DRIFT_ZERO).

Ordem de implantação (nada executado): auditoria read-only de Production (papel efetivo, BLOQUEIOS,
quais migrations já estão aplicadas — não presumir P03/#398) → backup → `migrate deploy` em janela de
baixo movimento (com `resolve --rolled-back` + reaplicação se o lock_timeout desistir) → deploy do
código com a flag desligada → smoke PDV/F9/OS/relatórios.

## Etapa 6 — revisão independente (somente leitura, concluída)

Achados e tratamento:
- **P1-1 (corrigido)**: estorno por referência podia estornar mais que o líquido global (estorno
  anterior em conta sem original era ignorado). Agora há teto no líquido global e regra da main
  quando algum grupo por conta fica negativo. PG: 60 + 40 com estorno anterior de 60 → +40, nunca +60.
- **P1-2 (corrigido)**: desligar a flag depois de uma ativação congelaria títulos adotados (trigger
  exige o mesmo perfil e recusava perfil inativo). Ponte repete o perfil do título; trigger não
  recusa mais EMPRESA inativo. PG: pagamentos com a flag desligada e o perfil desativado.
- **P1-3 (pré-condição de implantação, mantida)**: confirmar em Production o dono das tabelas e os
  GRANTs do runtime; as tabelas do G004 recebem REVOKE FROM PUBLIC e só são usadas com a flag ligada.
- P2 corrigidos: seletores estritos só ligados; Contador interno sem exigir financeiro.view
  desligado; Omni Agent com automações padrão e trilha detalhada desligado; DRE do fechamento fora
  da transação; upsertContaPagar avança versaoFinanceira; WhatsApp trata sessão de plataforma.
- P2 residuais (documentados): (a) `app.gm_owner_user` é um GUC que qualquer papel SQL com SELECT
  pode definir — o RLS pessoal protege contra o app, não contra outros papéis SQL com grants
  (somente papéis confiáveis devem ter SELECT nessas tabelas); (b) correspondência k-ésimo pagamento
  ↔ movimento pode escolher a conta errada em legado com movimento faltando E sobrando (o valor
  continua correto, limitado por `restante`); (c) `persistirSnapshotFinanceiro` abre até 4
  transações em paralelo (pool pequeno pode estourar maxWait); (d) relógio do host em
  `documentos.ts`/`estornarPagamentoHub` sem consumidor produtivo.

## Validações

Typecheck integral PASS; ESLint 0 erros; unitários sem regressão (as falhas restantes são
pré-existentes/ambiente: fiscal, loja-ativa, `localStorage` do Node 26, entrada-readback,
operations-store-sale-conflict-safety). Build local não executado (RAM); delegado à CI remota.
