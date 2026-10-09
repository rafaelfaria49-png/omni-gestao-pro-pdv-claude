<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Operações V4 — financeiro, retirada e garantia",
  "plan_rev": 1,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

# TRACK — Operações V4 / financeiro, retirada e garantia

Fonte de intenção: "COMANDO — Consolidação de Financeiro, Retirada e Garantia
da Operações V4", autorização ponta a ponta do proprietário de 08/10/2026,
sobre o diagnóstico somente leitura da mesma data (base `85aafb4`, caso
OS-2026-00025). Repositório `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.

A autorização cobre planejamento formal, implementação, testes reais,
revisão independente e publicação condicionada aos gates — em ENTREGAS
SEQUENCIAIS, um GOAL ativo por vez. Não autoriza reconstruir o ERP, criar V5,
excluir V3, alterar outros HUBs, nem executar qualquer ação real na
OS-2026-00025 (regularização, forma de pagamento, pagamento, entrega,
assinatura, garantia, estoque).

## Por que trilha própria

Os três GOALs NÃO entram em `ops-v4-fluxo-curto`:

- avançar o `plan_rev` daquela trilha marcaria o OPS-V4-FLUXO-CURTO-007
  (READY em main, plan_rev 14) como SUPERSEDED (EXECUTION_PROTOCOL §7);
- o 008 daquela trilha não é renomeado nem reaproveitado;
- este pacote não entra no diff, na allowlist nem no contador de tentativas
  do 007.

## Dependência — DEPENDENCIA_007 (RESOLVIDA em 09/10/2026)

Estado atual, conferido em 09/10/2026 na reconciliação do PR #250:
OPS-V4-FLUXO-CURTO-007 DONE (plan_rev 16, close `da4cd76`, commit funcional
aprovado `3ad27c2`), integrado em main pelo merge `9381354` (PR #253);
`ops-v4-fluxo-curto` PAUSED com 7 DONE e 0 BLOCKED. A dependência está
satisfeita. Revalidação do plano contra `9381354`: o 007 alterou, dentre os
caminhos desta trilha, apenas `use-v4-preview.ts`, `preview-honesty.test.ts`
(001) e `pos-venda-model.ts`, `posvenda-v4.ts`, `PosVendaStage.tsx`,
`retorno-actions.ts` (003); allowlists, test_commands e orçamentos de leitura
do 001 continuam suficientes — plan_rev 1 preservado. Base de produto do 001:
main com o merge deste planejamento sobre `9381354`. Os GOALs 002 e 003
ratificam seus caminhos contra a main vigente antes do próprio `open`.

Histórico da dependência (estado conferido em 08/10/2026, não presumido pelo
GitHub):

- main `85aafb4`: OPS-V4-FLUXO-CURTO-007 READY (current_goal).
- branch remota `goal/ops-v4-fluxo-curto-007` = `8d1f392`
  (`aep(ops-v4-fluxo-curto): block OPS-V4-FLUXO-CURTO-007`), sem PR,
  worktree `C:/Projetos/omni-gestao-ops-v4-fluxo-curto-007` limpa e sem
  `.aep-active`. Teto 3/3 esgotado; desbloqueio (rev 15) é decisão humana
  fora desta autorização.
- O 007 altera superfícies que os três GOALs desta trilha também alteram:
  `use-v4-preview.ts`, `preview-honesty.test.ts`, `types.ts`,
  `ModuleView.tsx`, `pos-venda-model.ts`, `posvenda-v4.ts`,
  `PosVendaStage.tsx`, `retorno-actions.ts`.

Regra: nenhum `open` desta trilha antes de main conter o merge regular do
OPS-V4-FLUXO-CURTO-007 com o 007 DONE no ledger da trilha dele. Sem isso, o
executor para com `DEPENDENCIA_007` e a retomada exata abaixo. Esta trilha
nunca encerra, desbloqueia ou consome tentativa do 007.

Retomada exata (depois do 007 integrado):

1. `git fetch origin` e conferir em `origin/main` o merge do 007 e
   `node scripts/track.mjs status ops-v4-fluxo-curto` com o 007 DONE.
2. Revisar este plano contra a main atualizada (caminhos, assinaturas que o
   007 mudou). Divergência de caminho = nova revisão do plano (plan_rev 2)
   pelo rito humano ANTES do `open`; nunca ampliar allowlist no meio.
3. Worktree limpa nova sobre a main atualizada, branch do GOAL 001,
   `npm ci`, `npx prisma generate` se faltar `generated/prisma`.
4. `node scripts/track.mjs status ops-v4-financeiro-retirada-garantia` →
   `open`.

## GOALs (sequenciais, um ativo por vez)

| GOAL | Entrega | Classe | Depende de |
| --- | --- | --- | --- |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 | A — informação financeira verdadeira e tela organizada (decisões inalteradas) | C4 | 007 integrado |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 | B — impedir novos casos e formalizar legados com segurança | C4 | 001 DONE + merge |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003 | C — garantia por serviço, documento versionado e uso simples | C4 | 002 DONE + merge |

Os três estão READY para que o contrato fique materializado e auditável; a
ordem é a do id. O `open` de 002 e 003 exige, além da ordem, o GOAL anterior
DONE e mergeado em main (o GOAL seguinte usa as superfícies do anterior).

Classe C4 nos três: dinheiro (fatos financeiros, recebimento), autorização
(aprovação, permissões, garantia) e entrega; dano em dados persistidos não é
revertido por `git revert`. R de outra família obrigatória.

## Mapeamento ao contrato de origem

Nenhum achado é defeito de aceite de GOAL AEP fechado: os comportamentos
abaixo foram contratados ou vêm de código anterior ao AEP. Nada é reaberto;
cada mudança é evolução com contrato próprio nesta trilha.

| Achado (diagnóstico de 08/10) | Origem | Tratamento |
| --- | --- | --- |
| Guard decide BLOCK_UNKNOWN antes de ler recebimentos (recebido/saldo vazios) | `92a531f` guard server-side (pré-AEP); teste `delivery-financial-guard.test.ts` fixa o bloqueio | 001: nova dimensão de fatos; guard intocado e decisão idêntica |
| UNKNOWN colapsa o motivo ("Financeiro indisponível") | `edc79de` projeção V4 (pré-AEP) | 001 |
| Próxima ação UNKNOWN → Financeiro sem saída | OPS-V4-FLUXO-CURTO-005 N11 (contratado) | 001: motivo estruturado com destino; N11 segue válido para UNKNOWN sem motivo comercial |
| Retirada "Situação financeira desconhecida" | OPS-V4-FLUXO-CURTO-006 (fail-closed contratado) | 001 |
| Mesmo pagamento duas vezes no histórico | `edc79de` (pré-AEP) | 001: deduplicação só de apresentação, com identidade provada |
| Comprovante some com UNKNOWN | 006 (identidade estrita contratada) | 001: identidade 1:1 do 006 preservada |
| Writer aceita orçamento em rascunho | `49c05c6` PDV de Serviço V3 (pré-AEP) | 002 |
| Forma pré-selecionada (Dinheiro na V3, Pix na V4) | PDV de Serviço V3 (pré-AEP) / 006 e #235 | 002: forma explícita |
| Rascunho materializado sobre OS paga | `gerarOrcamentoDaOS` (pré-AEP) | 002 |
| Garantia única por OS | OPS-V4-FLUXO-CURTO-002 excluiu multi-garantia explicitamente | 003 (não reabre o 002) |
| Garantia editável após entrega, termo recalculado, auditoria sem antes/depois | Fase 1E V3 e editor V4 (pré-AEP) | 003 |

## Base factual e dados reais

- Base conferida: `85aafb41f8089008174bce7ed48d7bdbb00b3a77`. Revalidar
  `origin/main` antes de cada `open`.
- Reprodução sintética sobre `85aafb4` (08/10/2026): rascunho + título
  liquidado R$ 420 → `totalCobravelV3` = 420; guard `BLOCK_UNKNOWN` com
  `totalRecebido`/`saldo` null; projeção `UNKNOWN`, `receivedTotal` null,
  `receivablePayments` = [420, op-1], 2 eventos para 1 pagamento; resumo e
  retirada "indisponível"; comprovante indisponível; com orçamento aprovado
  o mesmo título dá `PAID`/`canDeliver`. Os GOALs reproduzem isso como
  teste vermelho antes da correção.
- `PROD_DATA_NOT_VERIFIED`: a única credencial de produção configurada nesta
  máquina é a do dono do banco; a role somente leitura existente não tem
  GRANT em produção. A condição "menor privilégio" da autorização não é
  satisfeita, então o registro real da OS-2026-00025 NÃO foi consultado.
  Nada aqui afirma estado real (baixa vigente, ausência de estorno,
  identidade, saída do aparelho). Desenvolvimento segue com fixtures.
  Liberar a consulta exige do proprietário uma role read-only com GRANT em
  produção (mudança em produção, gate próprio) ou aceite explícito da
  credencial do dono com sessão `default_transaction_read_only=on`.
- Lembrança de débito × "Dinheiro" gravado: nenhuma mudança automática; o
  corretivo de forma de pagamento está fora deste pacote.

## Áreas protegidas (todos os GOALs)

Fechados: schema, migrations, seeds, auth/proxy, CI, `package.json`,
lockfile, Node/Vercel, deploy, `.env`, Fiscal, WhatsApp, Marketplace,
AppShell, CRM/NPS, produção mutante, motores globais de Venda/Caixa/
Financeiro/Estoque (`lib/financeiro/**`, `lib/operacoes/**`,
`app/actions/**`, PDV de produtos) e a plataforma de permissões
(`lib/auth/**`).

Necessidade de editar caminho protegido, criar permissão global, mudar
política fora deste contrato ou usar schema: parar ANTES da alteração e
devolver UMA decisão (PROTECTED_PATH, WHY_REQUIRED, MINIMAL_DIFF,
RISK_IF_NOT_DONE, ALTERNATIVE_WITHIN_SCOPE). Sem bypass, monkey patch ou
solução falsa.

O núcleo OPERACIONAL de aprovação/recebimento/garantia (V3) pode ser
ajustado estritamente onde a allowlist de cada GOAL declara — não é
autorização genérica para `lib/operacoes-v3/**`.

## Ambiente planejado

- Uma worktree limpa por GOAL sobre a main atualizada:
  `C:/Projetos/omni-gestao-ops-v4-frg-00N`, branch
  `goal/ops-v4-financeiro-retirada-garantia-00N`.
- Não reutilizar `C:/Projetos/omni-gestao` (129 commits atrás, ocupada por
  outra frente) nem a worktree do 007.
- PostgreSQL local descartável próprio (porta 45708 ou próxima livre,
  bancos `ops_v4_frg_00N_qa*`), dados sintéticos. Confirmar
  `current_database()` local antes de scripts/builds; nunca `.env` que aponte
  para candidate/produção; nunca `db push`/`migrate` fora do PG descartável.
- Dev server de QA em porta isolada (3071 ou próxima livre), sem matar
  processos de outras sessões.

## Prova de resultado (todos os GOALs)

test_command do GOAL, testes unitários, componentes/hooks montados,
PostgreSQL real com concorrência determinística (barreira +
`pg_stat_activity`, nunca sleep), E2E com `--retries=0 --workers=1`, sem
skip/fixme, `.first()` arbitrário, catch que engole falha ou reload que
mascara race. Regressões dos GOALs 001–007 de `ops-v4-fluxo-curto` e dos PRs
#234/#235/#237/#238 pertinentes, typecheck, ESLint dos alterados, build
seguro, `git diff --check`, `verify`, `verify --all` e `check`. Falha
preexistente só é separada com prova na main.

## Publicação e revisão independente

Por GOAL: commits por caminho explícito → check → R OpenAI/Codex read-only
sobre o SHA exato (P0=P1=P2=0, VERDICT=APPROVE; P3 registrado) → `close`
separado → PR atualizado → checks → merge normal. PR draft pode abrir antes.
Main avançando: merge normal, revalidação, R do candidato alterado.
Proibidos force, rebase, squash, amend, reset destrutivo e bypass. Achado
P0/P1/P2 corrige-se no MESMO GOAL (tentativas, teto 3). Sem R real:
`R_STATUS=AGUARDANDO_OPENAI`, `AEP_CLOSE=PENDENTE`, `MERGE=PENDENTE` e parar.

Depois do merge: conferir o SHA integrado e os deployments dos projetos
Vercel `omni-gestao` e `omni-gestao-pro`. Smoke de produção só leitura e com
sessão autorizada (impressão/preview que registra timeline NÃO é leitura).
Sem sessão: `PROD_SMOKE=OWNER_PENDING_AUTH`.

Vocabulário do relatório: IMPLEMENTADO, VALIDADO, REVISAO_APROVADA,
PUBLICADO, HOMOLOGADO. Ao fim da trilha: handoff persistente para o
OPS-V4-FLUXO-CURTO-008, sem iniciá-lo; obedecer NEW_SESSION.

## Fora do escopo (relatar, não corrigir)

Redesenho de SLA ("ATRASADA" em OS pronta/paga — defeito de apresentação
registrado; nova política exige contrato próprio), CRM, NPS, automação
WhatsApp, Fiscal, Marketplace, corretivo de forma de pagamento, saneamento
massivo, auditorias de peças alternativas e de estorno duplicado.
