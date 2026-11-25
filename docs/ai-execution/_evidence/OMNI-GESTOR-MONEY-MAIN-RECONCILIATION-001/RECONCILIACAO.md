# OMNI-GESTOR-MONEY-MAIN-RECONCILIATION-001 — reconciliação G001–G006 × main

Data: 2026-11-25. Base efetiva: `origin/main` **3dcd409** (inclui #367 Vestuário P03 e #402; a
referência e609ef0 do pedido já estava superada). Branch: `codex/gestor-money-main-reconciliation-001`.
Nada foi reimplementado do zero: cada etapa é o commit original portado com revisão manual dos
conflitos. Nenhuma migration foi aplicada fora de PostgreSQL descartável. Módulo **desligado**.

## 1. Mapa de commits recuperados

| GOAL | Original (só local) | Branch original preservada | Reconciliado |
|---|---|---|---|
| G001 perfis/autorização | 55bab9a | codex/omni-gestao-gastos-001 | 24fffa5 |
| G002 modelos/writers | bcde32c | codex/omni-gestao-gastos-002 | bd586fb |
| G003 leituras/documentos | 451b0e4 | codex/omni-gestao-gastos-003 | 80a489c |
| G004 motor atômico | fad3d20 | codex/omni-gestao-gastos-004 | e358943 |
| G005 consultas | abec9e9 | codex/omni-gestao-gastos-005 | 0bf0283 |
| G006 canais/fila/worker | 3ffd4eb | codex/omni-gestao-gastos-006 | dbcccbb |
| Ativação controlada | — | — | 3420eb9 + fdddc07 (flag desligada = autoridade da main) |
| Reordenação de migrations | — | — | fde35c7 |

Base histórica comum: 1370086. As seis worktrees originais e a G001-r2 (com rascunho não
commitado) continuam intactas; o agente de limpeza confirmou a proteção.

**Backup verificável** (fora do repositório): `%USERPROFILE%\OneDrive\OmniGestao-Backups\gestor-money-G001-G006\`
- `gestor-money-G001-G006.bundle` — as 6 branches; restaurado num repositório isolado com os 6 SHAs idênticos (requer 1370086, que está no histórico da main).
- `g001-r2-tracked.patch` + `g001-r2-untracked.tgz` — rascunho G001-r2 (2 arquivos alterados + 10 novos).
- `SHA256SUMS`. Varredura de segredos (chaves Stripe/Meta/AWS, URLs com senha): nenhuma ocorrência.

## 2. Reconciliação por GOAL — decisões de conflito

### G001 — perfis
- Schema unido com `AdminSession` (#350) e `CatalogoAparelhoLojaModelo` (#400), sem reformatar.
- `requireFinanceiroPerfilAccess`: EMPRESA passa a exigir também `canUseModule(session,"finance",storeId)` (módulos por loja da main). PESSOAL continua independente de loja e exige dono exato.
- Revogação de sessão (#350) e re-leitura de autoridade por request são herdadas de `auth()`.
- Guard WhatsApp (E24): a main já fecha o E24 com `requireModuleApi(req,"whatsapp")` em todas as rotas; o guard do G001 vira defesa em profundidade.

### G002 — writers canônicos
- **PATCH pagar/receber e POST /api/pdv/receber-conta: versão da main (#397).** Dois desenhos para o mesmo defeito (2ª parcial descartada): #397 (título travado + CAS + `restanteEsperado`/`pagoEsperado` + estorno por `pagamentoIndex`) está em produção; o M1 do G002 (`idempotencyKey` + recibo) não foi ligado. O wrapper cliente do G002 reenviaria sem `restanteEsperado` e, sobre o servidor #397, poderia pagar em dobro. `aplicarPagamentoLegado` e `pagamento-operacao-client` ficam como biblioteca sem consumidor.
- O escopo EMPRESA (perfil + precisão em centavos) entra **pelos serviços** usados pela #397: transação + `FOR UPDATE` (G002) combinados com `gravarComToken` CAS (#397).
- **Estorno por referência**: o "já existe estorno → pula" do G002 reintroduzia o bug corrigido pela #397. Agora estorna o líquido (originais − estornos) **por conta**, em transação.
- `estornarMovimentacaoDePagamento` (#397) recebe o escopo EMPRESA.
- **Trigger da migration G002/G004**: em conta inativa, exigia estorno = soma exata dos originais — bloquearia o estorno por pagamento (parcial) da #397. Agora exige estorno ≤ líquido ainda movimentado na conta. Isso também fecha o limite documentado no G002 (compensação SQL repetida era aceita).
- Writers posteriores à base ligados à ponte: edição financeira de OS V3 (o CHECK valor×`valorCentavos` quebraria a edição) e compra de aparelho (#347). Demais writers da main já passam por serviços escopados; `edicao-completa-actions` só altera cliente/payload.

### G003 — leituras e documentos
- GETs financeiros: `requireModuleApi(req,"finance")` da main + guard de leitura do G003 + `respostaFinanceiraPrivada` (no-store). Auditoria: nenhum `requireModuleApi` nem guard `pdvShared/sharedPayment` da main foi perdido.
- `/api/ops/contas-receber-list` (F9 do PDV): **guard operacional da main mantido** (`apiGuardFinanceiroViewOrOps(..., {pdvShared:true})`); o guard do G003 exigiria `financeiro.view` e tiraria o F9 do operador de caixa.
- **PWA: integralmente a política allowlist-only da #393** (`next.config.mjs`, `client-privacy-cache.js`). É estritamente mais forte que a denylist do G003; o teste do G003 foi adaptado (privados seguem NetworkOnly; worker auxiliar provado desligado).
- `FinanceiroRealContext`: cache de leitura do G003 + `fetchData({silent})` da main.

### G004 — motor atômico
- Estorno do HUB (PATCH pagar `estornar`): **versão da main (#397)**. `estornarPagamentoHub` fica no motor, sem consumidor — ligá-lo exigiria `idempotencyKey` conservada no cliente e ativaria o motor para todas as lojas.
- `gravarComToken` (#397) também incrementa `versaoFinanceira`: o CAS do motor nunca aceita token anterior a uma escrita legada (as duas trilhas já serializam por `FOR UPDATE`).
- Rota nova `POST /api/financeiro/pagar/operacoes`: `requireModuleApi(req,"finance")` + 404 com a flag desligada.

### G005 — autoridade de consultas
- **GET pagar/receber (listagem): versão da main + filtro G003.** O G005 trocava por `consultarFinanceiroEmpresa(1900-01-01 → hoje)`: perderia contratos consumidos pelo HUB (`nomesAmbiguos`, `clienteId`, histórico, parcela) e carregaria todos os movimentos a cada abertura (auditoria Vercel).
- Relatórios/exportações/KPIs: corpo do G005 (`lib/gastos/query.ts` + `query-calculo.ts` como autoridade única) + `requireModuleApi`. Analytics: janela padrão de 6 meses; o campo `consulta` (DTO integral sem consumidor) saiu do payload.

### G006 — canais, fila e worker
- Aplicou sem conflito textual. Worker só por comando explícito (`workers/gastos/index.ts`); nada o inicia automaticamente.
- **Achado `createdAtBoundByPrisma=true` corrigido**: `FinanceiroOperacao`, `GastoOutbox` e `GastoRevisao` usavam `@default(now())` — o Prisma preenche com o relógio do **host**, e `outbox.ts` compara com `GastoOrigemCanal.createdAt` (`clock_timestamp()` do banco). Agora são `dbgenerated("timezone('UTC'::text, clock_timestamp())")` no schema e na DDL. Expiração/confirmação de revisão passam a usar `agoraDoBanco(tx)`; sem relógio do banco a operação falha fechada (503). Leases/fila/pulsos já usavam `clock_timestamp()`.

## 3. Ativação controlada (`GESTOR_MONEY_ENABLED`, desligado por padrão)

Só o valor exato `"true"` liga. Desligado:
- writers não criam `FinanceiroPerfil` nem adotam histórico (loja sem perfil = legado, `perfilId` NULL); o recebimento em lote do PDV não provisiona perfil;
- leitores usam **exatamente a autoridade da main** (sessão relida pelo callback JWT, `canAccessStore`, permissões por loja/módulo); o vínculo `AdminUserStore` estrito e o grant `PerfilMembro` do G003 só valem ligado;
- `/api/financeiro/pagar/operacoes` responde 404.

**Pré-condição PerfilMembro**: com G002+G003 ligados, o primeiro writer financeiro cria o perfil EMPRESA e todos os leitores daquela loja passam a exigir `PerfilMembro` → 403 geral sem concessão. Por isso a ativação depende de um fluxo governado de concessão (ver §7).

**Dependência explícita**: o código **não pode** ir para produção antes da migration — o Prisma seleciona todas as colunas novas (`perfilId`, `valorCentavos`…) e falharia com "column does not exist". Ordem obrigatória: migration (com as pré-condições do §5) → deploy do código com a flag desligada.

## 4. Migrations

Renomeadas (R100, ordem relativa preservada) para depois das reservas abertas (#367 `20261116090000` — já mergeada; #398 `20261124120000`):

| Antes | Depois |
|---|---|
| 20261019194000_gastos_perfis_autorizacao | 20261126100000_gastos_perfis_autorizacao |
| 20261020130000_gastos_contas_writers | 20261126110000_gastos_contas_writers |
| 20261021120000_gastos_readers_documentos | 20261126120000_gastos_readers_documentos |
| 20261022120000_gastos_operacoes_atomicas (colidia com `platform_pilot_access`) | 20261126130000_gastos_operacoes_atomicas |
| 20261025120000_gastos_canais_fila_worker | 20261126140000_gastos_canais_fila_worker |

Nunca aplicadas em ambiente persistente (relatórios G001–G006: somente clusters descartáveis) — renomear e alterar SQL não invalida checksum algum. Migrations históricas da main: intocadas.

### Ensaio real (PostgreSQL 17 descartável, loopback, papel dono NOSUPERUSER/NOBYPASSRLS)

| Cenário | Resultado |
|---|---|
| A — banco vazio, cadeia completa | Falha na `0005` **legada da main** (`estoque_produtos` não existe) — pré-existente e independente do Gestor Money; por isso o CI monta por datamodel. |
| B — fotografia da main (schema 3dcd409 + 31/31 migrations registradas) + `prisma migrate deploy` | 5 migrations aplicadas; `migrate status` "up to date"; drift Prisma **zero** (após alinhar o default de `gastos_jobs.prazoEm` à forma normalizada). 24 tabelas com RLS, 17 policies, 41 triggers. |
| C — B + loja legada sintética (5.000 produtos, 3.000 receber, 2.000 pagar, 20.001 movimentos, conta desativada, 1 NaN) | Deploy em ~4 s; fingerprints (md5 de IDs/valores/status/payload + soma) **idênticos** antes/depois — nenhum DML; 0 perfis e 0 membros criados. `AUDITORIA_PRE_MIGRATION.sql`: 1 BLOQUEIO (NaN), 1 REVISAR, 6.667 informativos (histórico em conta inativa). |
| D — falha no meio (objeto conflitante antes do G004) | G001–G003 commitados; G004 revertido integralmente (nenhuma tabela, nem a coluna `versaoFinanceira`); `migrate resolve --rolled-back` → novo deploy aplica G004+G006; drift zero. |
| E — runtime **não dono** (NOBYPASSRLS, com GRANTs) | **0** movimentos/títulos/carteiras visíveis e INSERT recusado: o RLS sem policy nas tabelas centrais derruba PDV/Financeiro. Runtime dono: 20.001 movimentos, normal. → pré-condição P0 de implantação. |
| F — perfil EMPRESA desativado | Banco aceita legado (perfil NULL); recusa fato novo no perfil inativo, composição PESSOAL+loja e transferência de perfil. Na aplicação, perfil desativado congela os writers da loja (decisão G002). |

Writers legados após a migration (dono, flag desligada): movimento em conta ativa ✔; título novo/alteração de valor ✔; lançamento novo em **conta desativada** ✘ e carteira de **outra loja** ✘ (os writers da main já filtram `ativo: true`, então o trigger só torna a regra ruidosa); estornos parciais ≤ líquido em conta inativa ✔, acima ✘, com líquido zerado ✘.

## 5. Provas

- **Typecheck** integral (`npm run typecheck`): PASS em cada etapa.
- **Unitários — suíte inteira comparada nome a nome com a origin/main pura**: branch 11.989 aprovados × main 11.797; as **mesmas 331 falhas** nos dois lados (ambiente local Node 26/jsdom `localStorage`, fiscal etc.) — **zero regressões**. Testes jsdom do PWA passam no Node 22.
- **ESLint** nos 156 arquivos tocados: 0 erros.
- **Runner PG do CI (`test:root:pg`)** sobre o cluster descartável: SUITES_PG_OK (41+18+13+77+52); no grupo Aparelhos o preparador oficial aplica as 5 migrations do Gestor Money e confirma DRIFT_ZERO.
- **PostgreSQL real — suítes originais do Gestor Money** (flag ligada): G002 writers **50/50**; G002 rotas **10/10** fora do M1 (31 casos M1 desligados com motivo explícito, ver §2).
- **PostgreSQL real — suítes da main sobre banco COM as migrations do Gestor Money e flag desligada**: F9 consolidação+HARDENING-002 **32/32**, estorno P1 **24/24**, integração F9 **14/14**, recebimentos F9 + comprovante **26/26**. Recebimento misto V3: 90/109 — as **mesmas 19 falhas, nome a nome, ocorrem na origin/main pura** num banco sem Gestor Money (pré-existentes).
- Clock skew: teste com host ±1 h não muda a decisão de expiração; sem relógio do banco → 503.

## 6. Riscos

**P0 (bloqueiam a migration em produção)**
1. **Identidade do runtime**: as migrations ligam RLS sem policy em `carteiras_financeiras`, `contas_pagar_titulos`, `contas_receber_titulos`, `movimentacoes_financeiras`. Se o papel de runtime da Production não for o dono dessas tabelas (ou não tiver BYPASSRLS), o núcleo financeiro inteiro passa a ler zero linhas (cenário E). Confirmar `current_user`/owner em Production **antes** de aplicar; não conceder BYPASSRLS para contornar.

**P1**
1. Auditoria pré-migration com BLOQUEIO precisa de decisão por linha (NaN/Infinity legados) antes de aplicar.
2. Ativação exige fluxo governado de `PerfilMembro` (sem ele, 403 geral nos leitores após o primeiro writer).
3. Perfil EMPRESA desativado congela os writers da loja (mesmo com a flag desligada, se o perfil existir).
4. Triggers novos recusam lançamento em conta desativada/de outra loja — mudança de comportamento ruidosa para qualquer writer legado fora dos serviços canônicos.
5. Guard WhatsApp do G001 exige `AdminUserStore` para não-admin: usuários com acesso só pela `lojaId` perderiam o HUB WhatsApp (as rotas já têm `requireModuleApi`). Auditar dados antes do merge.
6. Estorno por pagamento (#397) escolhe a conta do pagamento mais recente, não a do pagamento estornado (comportamento da main; o motor G004 resolve por identidade quando ativado).
7. Relatórios do G005 carregam o período inteiro em memória (`consultarFinanceiroEmpresa`); com milhares de movimentos por mês, migrar para agregação SQL antes de ampliar janelas.

**Fora de escopo, relatado**: cadeia legada 0001–0014 da main não roda em banco vazio; 19 falhas pré-existentes no V3 PG.

## 7. Plano de rollout (nada executado)

1. Auditoria read-only em Production: papel efetivo/ownership, `AUDITORIA_PRE_MIGRATION.sql`, volume/locks.
2. Decisão por linha dos BLOQUEIOS; janela de manutenção.
3. Migration (5 SQLs) com backup Neon; código com a flag **desligada**; smoke F9/PDV/OS/relatórios.
4. GOAL de ativação: fluxo governado de concessão/revogação de `PerfilMembro` (auditado, sem grant em massa), ligar M1/motor G004 nas rotas, homologação por loja piloto.
5. Só então `GESTOR_MONEY_ENABLED=true` por ambiente.

## 8. Etapa mobile intermediária — proposta (não implementada)

Superfície **Gestor Money** dentro do Financeiro HUB, responsiva/PWA, uso manual primeiro e conversacional depois, **sem depender de WABA ou worker cloud**. Reutiliza integralmente G001–G006: contexto opaco G001, writers G002, leituras/documentos G003, revisão→confirmação G004, `query.ts` G005.

| Bloco | Contrato reutilizado |
|---|---|
| Alternar Perfil Pessoal × Empresa (por loja) | `requireFinanceiroPerfilAccess` (G001) |
| Dashboard receitas/despesas, saldo das contas | `consultarFinanceiroEmpresa`/pessoal (G005) |
| Contas bancárias, carteiras, cartões, categorias | G002 (`contas`, `categorias`) + G004 (`cartoes`) |
| Calendário de contas, recorrentes | títulos G002 + revisão G004 (recorrência = nova proposta, nunca DML direto) |
| Lançamento manual e campo de linguagem natural | texto → proposta `GastoRevisao` (G004) → revisão humana → confirmação; a IA nunca calcula nem confirma |
| Anexos | `DocumentoGasto` G003 (storage fixture até infraestrutura autorizada) |
| Extrato e relatórios | G005 (paginado/agregado) |
| Metas e orçamento | evolução futura |

Sugestão de encaixe: **G006.5 / GOAL mobile-web manual** entre G006 e G007, preservando G007–G012 (canal oficial WhatsApp, binding, conversa, mídia, E2E) inalterados. Pré-requisitos: ativação controlada concluída (§7) e decisão de UX mobile aprovada.

## 9. Próximo GOAL recomendado

`OMNI-GESTOR-MONEY-ACTIVATION-PRECONDITIONS-001`: auditoria read-only da identidade de runtime e do RLS em Production, auditoria pré-migration, fluxo governado de `PerfilMembro`, e homologação em banco isolado com loja piloto — sem ligar a flag.
