<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-financeiro-retirada-garantia",
  "title": "Operações V4 — financeiro, retirada e garantia",
  "plan_rev": 7,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

# TRACK — Operações V4 / financeiro, retirada e garantia

Fonte de intenção: "COMANDO — Consolidação de Financeiro, Retirada e Garantia
da Operações V4", autorização ponta a ponta do proprietário de 08/10/2026,
sobre o diagnóstico somente leitura da mesma data (base `85aafb4`, caso
OS-2026-00025). Repositório `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.
Revisão 3: "COMANDO — GOAL 001 / REV 3" do proprietário, de 09/10/2026
(desbloqueio do 001; ver Revisões do plano).
Revisão 4: "DECISÃO HUMANA — GOAL 001 / REVISÃO 4" do proprietário, de
09/10/2026 (desbloqueio do 001 restrito ao achado R6; ver Revisões do plano).
Revisão 5: ratificação pré-`open` do GOAL 002 contra a main `23380ab`, sob a
autorização do comando do GOAL 002 do proprietário, de 09/10/2026 (ver
Revisões do plano).
Revisão 7: COMANDO MESTRE do proprietário de 10/10/2026, desbloqueio do 002
e transferência excepcional da execução C4 para OpenAI/Codex (ver abaixo).
Revisão 6: ampliação da allowlist do GOAL 002 durante a execução, sob a mesma
autorização do comando do GOAL 002 (ver Revisões do plano).

A autorização cobre planejamento formal, implementação, testes reais,
revisão independente e publicação condicionada aos gates — em ENTREGAS
SEQUENCIAIS, um GOAL ativo por vez. Não autoriza reconstruir o ERP, criar V5,
excluir V3, alterar outros HUBs, nem executar qualquer ação real na
OS-2026-00025 (regularização, forma de pagamento, pagamento, entrega,
assinatura, garantia, estoque).

## Revisões do plano

- rev 1 (08/10/2026, PR #250): materialização dos GOALs 001–003.
- rev 2 (09/10/2026, reconciliação do PR #250 com `9381354`): os
  test_commands rodavam configs PG completas do 006/007/#234/#235/#237 com
  um único ambiente, o que falharia por BLOQUEIO_EXPLICITO_PG (cada suíte
  exige banco com prefixo próprio). Correção: só suítes jsdom dessas frentes
  no test_command; as PG viram evidência obrigatória em bancos próprios;
  prefixo comum `ops_v4_frg_qa*` para as suítes desta trilha. Allowlists,
  objetivos e orçamentos inalterados. Os três GOALs READY sobem juntos para
  plan_rev 2 (nenhum é SUPERSEDED).
- rev 3 (09/10/2026, "COMANDO — GOAL 001 / REV 3", desbloqueio humano): o
  GOAL 001 esgotou o teto de 3 tentativas da rev 2 (R3 OpenAI em `cd68d45`:
  P1=1 valores legados com fatos rejeitados em status INCONSISTENT; P2=1
  meios com coerção e split atribuído à baixa inteira) e ficou BLOCKED
  (by=decisao) em `5bb4bbe`. O proprietário reativou o MESMO GOAL (sem
  001-FIX/001B/sucessor): READY, plan_rev 3, tentativas reiniciadas
  (protocolo §3). Decisões:
  1. corrigir os dois achados da R3 no 001;
  2. incluir na allowlist do 001 `parts/EstornoRecebimentoModal.tsx` (só
     leitura/exibição) e `rails-adapter.ts` (+`rails-adapter.test.ts`),
     com testes, só para eliminar apresentações financeiras não confiáveis
     (achados de escopo da R3: ESTORNO_MODAL_VALORES_LEGADOS,
     TRILHO_LISTA_VALORES_LEGADOS); test_command do 001 roda também
     `rails-adapter.test.ts`;
  3. decisão A da garantia (G_EDITOR_GARANTIA_ABERTO): o recolhimento do
     editor de garantia sai do aceite do 001 e passa a ser obrigação
     explícita do 003 (item E), que recebe na allowlist
     `parts/stages/retirada-v4.module.css` e
     `e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts` (adaptado só quando a
     nova experiência existir, mesmas asserções); até lá o editor atual e
     esse E2E ficam inalterados;
  4. GOALs 002 e 003 seguem READY e sobem para plan_rev 3 (nenhum
     SUPERSEDED), com objetivos preservados; não abrir 002, 003 nem o
     OPS-V4-FLUXO-CURTO-008 sem autorização nova.
  Rito: PR exclusivo de governança (block da rev 2 materializado byte a byte
  + desbloqueio) → merge normal na main → merge normal da main na branch do
  001 → `open` (tentativa 1 da rev 3).
- rev 4 (09/10/2026, "DECISÃO HUMANA — GOAL 001 / REVISÃO 4", desbloqueio
  humano): o GOAL 001 esgotou o teto de 3 tentativas da rev 3 (R4 em
  `da9bb4a` e R5 em `cc03fc8`: P2 orçamento malformado derrubando o lote,
  ambos corrigidos; R6 OpenAI em `b3f5fe5`: P2=1 formas de pagamento
  `"__proto__"`/`"constructor"` resolvem `METHOD_LABELS` para
  objeto/função herdados e o FinanceiroStage quebra no React) e ficou
  BLOCKED (by=decisao) em `f8fe8cd`. O proprietário reativou o MESMO GOAL
  (sem sucessor nem reinício da implementação): READY, plan_rev 4,
  tentativas reiniciadas (protocolo §3). Decisões:
  1. corrigir só o R6 no 001, dentro da allowlist vigente
     (`financial-projection.ts`, seus consumidores no mesmo arquivo e os
     testes pertinentes): nenhum rótulo não textual sai da cadeia
     `method()` → `rotuloMeioEstrito()` → fatos → UI; forma desconhecida
     nunca vira forma reconhecida; sem forma verificável o valor válido fica
     como "forma não identificada";
  2. preservar todos os corretivos das revs 2 e 3; regras server-side de
     recebimento, estorno e entrega inalteradas; allowlist, test_command,
     classe, risco, família e R obrigatória inalterados;
  3. bateria adversarial dirigida (nomes de propriedades herdadas em forma
     única e em split, formas não textuais, vazias, valores inválidos,
     splits parciais, sem forma, JSON malformado) com reprodução vermelha em
     `b3f5fe5` antes da R;
  4. GOALs 002 e 003 seguem READY e sobem para plan_rev 4 (nenhum
     SUPERSEDED), contratos funcionais inalterados; o 002 continua
     dependente do 001 DONE e integrado; não abrir 002, 003 nem o
     OPS-V4-FLUXO-CURTO-008 sem autorização nova.
  Rito: PR exclusivo de governança (block da rev 3 materializado byte a byte
  + desbloqueio) → merge normal na main → merge normal da main na branch do
  001 → `open` (tentativa 1 da rev 4).
- rev 5 (09/10/2026, ratificação pré-`open` do GOAL 002 contra `23380ab`,
  sob a autorização do comando do GOAL 002: "Se a allowlist, os contratos ou
  os testes exigirem uma alteração formal, fazer a revisão de planejamento
  pelo rito AEP antes do `open`"): cinco regressões fora da allowlist do 002
  fixam o comportamento que o contrato muda — A: o A1 do 001 recebe sobre
  rascunho pelo writer real e `os-conta-receber-unica.test.ts` recebe com
  Prisma simulado sem `valorTotal` e orçamento inconsistente; E: R2-2 do 001
  e o atendimento rápido V3 de #237 confirmam sem escolher a forma, e o E2E
  de paridade de #235 fixa a lista exata de formas. Todas verdes na main.
  Decisões:
  1. os cinco caminhos entram na allowlist do 002 só para adaptar fixture ou
     entrada ao contrato, sem remover asserção de valor, identidade,
     concorrência ou efeito;
  2. o test_command do 002 roda também os dois testes sem banco; o E2E de
     paridade segue como evidência obrigatória à parte; orçamento de
     leitura do 002 45 → 50;
  3. objetivos, contratos, classe, risco e R obrigatória inalterados; 002 e
     003 sobem para plan_rev 5 (nenhum SUPERSEDED); não abrir 003 nem o
     OPS-V4-FLUXO-CURTO-008 sem autorização nova;
  4. achado fora do contrato, só relatado: o atendimento rápido da V4
     (`AtendimentoRapidoModal.tsx` + `atendimento-rapido-form.ts`) continua
     iniciando a forma em Dinheiro.
  Rito: PR exclusivo de plano → merge normal na main → a branch do 002
  recebe a main → `open` (tentativa 1 da rev 5).
- rev 6 (10/10/2026, ampliação de allowlist do GOAL 002 durante a execução,
  sob a mesma autorização do comando do GOAL 002): as regressões
  obrigatórias, no candidato contra a base `98ef717`, revelaram mais dois
  caminhos fora da allowlist que fixam o comportamento que o contrato muda —
  A: o P1-T7 de #238 recebe sobre totais divergentes (fixture deixa
  `payload.valorTotal` em 400 com orçamento, faturamento e coluna em 500);
  E: o E03 do E2E do OPS-V4-FLUXO-CURTO-006 confirma o caixa fechado
  contando com a forma pré-selecionada. Decisões:
  1. os dois caminhos entram na allowlist do 002 só para adaptar fixture
     (valores consistentes) ou entrada (forma escolhida), sem remover
     asserção;
  2. seguem como evidência obrigatória à parte, nos bancos próprios;
     test_command inalterado; orçamento de leitura do 002 50 → 52;
  3. objetivos, contratos, classe, risco e R obrigatória inalterados; 002 e
     003 sobem para plan_rev 6 (nenhum SUPERSEDED); não abrir 003 nem o
     OPS-V4-FLUXO-CURTO-008 sem autorização nova.
  Rito: PR exclusivo de plano → merge normal na main → a branch do 002
  recebe a main → `.aep-active` recriado (tentativa 1, sem falha
  registrada) → `open`.

- rev 7 (10/10/2026, COMANDO MESTRE do proprietário, desbloqueio humano):
  o 002 esgotou 3/3 na rev 6. O bloqueio original f3e3bdf é transportado
  por commit documental, preservando byte a byte o LEDGER (blocked_by
  externo, R3 e previous_attempts). O MESMO GOAL volta a READY, plan_rev 7,
  tentativa 1/3. A execução é transferida de Claude Code/Anthropic para
  Codex GPT-6.1/OpenAI por limitação temporária de cota. Autorização humana
  EXCEPCIONAL para este C4; classe C4, risco ALTO e R obrigatória
  permanecem. executors.json não é alterado. Decisões:
  1. corrigir exclusivamente os dois P1 da R3 em 6155b4d: resultado
     imediato incerto não libera nova confirmação; imediato e misto
     compartilham pendência por loja/OS, preservando identidade e conteúdo
     econômico original; reproduções vermelhas antes e provas reais depois;
  2. preservar integralmente A–E, idempotência, locks/CAS, permissões,
     isolamento e todos os corretivos R1/R2; allowlist, test_command e
     orçamento de leitura inalterados; refresh/remount e abas simultâneas
     precisam ser avaliados sem declarar memória como persistência;
  3. R final sobre TODO o GOAL e SHA exato por outra família declarada e
     aceita, diferente de OpenAI. Codex/GPT não conta como R independente
     deste executor. Sem R elegível, concluir implementação/testes/auditoria
     e preparar pacote imutável e PR draft AGUARDANDO R INDEPENDENTE — NÃO
     MERGEAR; proibidos close, merge de produto e publicação sem APPROVE
     válido e P0=P1=P2=0;
  4. 001 permanece DONE; 003 permanece READY e sobe apenas plan_rev para 7,
     com objetivo, família executora e dependência do 002 DONE + merge
     preservados. Não abrir 003 nem OPS-V4-FLUXO-CURTO-008.
  Rito: transportar bloqueio → planejamento humano rev 7 → registry e
  verify/verify --all → PR documental exclusivo → merge normal na main →
  merge normal da main na branch funcional → status e open do 002.

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
`retorno-actions.ts` (003); allowlists e orçamentos de leitura do 001
continuam suficientes; o test_command precisou da rev 2 (ver Revisões do
plano). Base de produto do 001:
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
   007 mudou). Divergência de caminho = nova revisão do plano (plan_rev
   seguinte) pelo rito humano ANTES do `open`; nunca ampliar allowlist no meio.
3. Worktree limpa nova sobre a main atualizada, branch do GOAL 001,
   `npm ci`, `npx prisma generate` se faltar `generated/prisma`.
4. `node scripts/track.mjs status ops-v4-financeiro-retirada-garantia` →
   `open`.

## GOALs (sequenciais, um ativo por vez)

| GOAL | Entrega | Classe | Depende de |
| --- | --- | --- | --- |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 | A — informação financeira verdadeira e tela organizada (decisões inalteradas) | C4 | 007 integrado |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 | B — impedir novos casos e formalizar legados com segurança | C4 | 001 DONE + merge |
| OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-003 | C — garantia por serviço, documento versionado e uso simples (inclui, desde a rev 3, o editor de garantia recolhido transferido do 001) | C4 | 002 DONE + merge |

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
- PostgreSQL local descartável próprio (porta 45708 ou próxima livre),
  bancos com o prefixo comum da trilha `ops_v4_frg_qa*` (as suítes PG dos
  três GOALs aceitam o mesmo prefixo, para que 002/003 rodem as anteriores),
  dados sintéticos. Confirmar
  `current_database()` local antes de scripts/builds; nunca `.env` que aponte
  para candidate/produção; nunca `db push`/`migrate` fora do PG descartável.
- Dev server de QA em porta isolada (3071 ou próxima livre), sem matar
  processos de outras sessões.

## Prova de resultado (todos os GOALs)

test_command do GOAL, testes unitários, componentes/hooks montados,
PostgreSQL real com concorrência determinística (barreira +
`pg_stat_activity`, nunca sleep), E2E com `--retries=0 --workers=1`, sem
skip/fixme, `.first()` arbitrário, catch que engole falha ou reload que
mascara race. Suítes PG de outras frentes exigem bancos com prefixo próprio
(`ops_v4_fluxo_006_qa*`, `ops_v4_fluxo_007_qa*`, `ops_v3_misto_qa*`,
`ops_datas_qa*`): por isso o test_command de cada GOAL roda só as suítes
compatíveis com o banco da trilha, e essas regressões PG externas rodam à
parte, cada uma no seu banco descartável, como evidência OBRIGATÓRIA no
relatório e no pacote da R. Regressões dos GOALs 001–007 de `ops-v4-fluxo-curto` e dos PRs
#234/#235/#237/#238 pertinentes, typecheck, ESLint dos alterados, build
seguro, `git diff --check`, `verify`, `verify --all` e `check`. Falha
preexistente só é separada com prova na main.

## Publicação e revisão independente

Por GOAL: commits por caminho explícito → check → R read-only de outra família declarada e aceita, diferente da família
executora do GOAL, sobre o SHA exato (P0=P1=P2=0, VERDICT=APPROVE; P3 registrado) → `close`
separado → PR atualizado → checks → merge normal. PR draft pode abrir antes.
Main avançando: merge normal, revalidação, R do candidato alterado.
Proibidos force, rebase, squash, amend, reset destrutivo e bypass. Achado
P0/P1/P2 corrige-se no MESMO GOAL (tentativas, teto 3). Sem R real:
`R_STATUS=AGUARDANDO_FAMILIA_INDEPENDENTE`, `AEP_CLOSE=PENDENTE`, `MERGE=PENDENTE` e parar.

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
