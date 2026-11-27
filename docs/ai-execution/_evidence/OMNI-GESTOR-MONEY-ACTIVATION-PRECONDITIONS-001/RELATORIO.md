# OMNI-GESTOR-MONEY-ACTIVATION-PRECONDITIONS-001

Data: 2026-11-27 · PR #405 (DRAFT) · branch `codex/gestor-money-main-reconciliation-001`
Executor: Claude Code (Opus 5.5) · worktree `.worktrees/gestor-money-main-reconciliation-001`

Missão: reconciliar a fundação G001–G006 com a main atual e preparar as pré-condições de liberação.
**Nenhum acesso ao banco de Production, nenhuma escrita, migration, flag, merge, ativação ou mensagem real.**
Evidências sensíveis anteriores (preflight/backup/deploy G001) continuam fora do repositório, em
`C:\Projetos\backups\gestor-money-evidencias-sensiveis\` (manifesto SHA-256); este relatório só as cita.

## 1. Preflight

| Item | Estado real |
|---|---|
| `origin/main` | `ec0fa1d` (#404 Datasource Guard por último; contém #406, #409, #411, #413, #414) |
| PR #405 antes | `3ed6cb7`, OPEN/DRAFT, 213 arquivos, 33 commits atrás da main, CI verde |
| Production (metadado Vercel, sem banco) | `omni-gestao-pro` em `ec0fa1d` = success; `omni-gestao` cancelado por Ignored Build Step (esperado) |
| Trabalho paralelo | worktree `.worktrees/gestor-money-ui-g006-5` (branch `feat/gestor-money-mobile-web-g006-5`, criada 14:01 hoje, a partir da main) = **outra sessão iniciando G006.5**. Não tocada. Worktrees G001–G006 originais: intactas |
| Backup `OneDrive\OmniGestao-Backups\gestor-money-G001-G006` | `sha256sum -c SHA256SUMS`: bundle, patch e tgz **OK**; não modificado |

## 2. Reconciliação

- `git merge --no-ff origin/main` → **sem conflito textual**. Único arquivo tocado pelos dois lados:
  `scripts/ci/run-root-pg-suites.mjs` — main endureceu o `psql` (env libpq próprio, `-X -w`) e trocou o loopback
  por `localFixtureDatasource` (#404); a PR só acrescentou o grupo `gastos_venda_titulo_legado_ci`. Conferido
  semanticamente: o grupo novo herda o endurecimento.
- `lib/prisma.ts`, `auth.ts`, `auth.config.ts`, `proxy.ts`, `next.config.mjs`, `package.json`, `vitest.config.ts`:
  só a main mudou → versão da main integralmente preservada. `prisma/schema.prisma`: só a PR mudou.
- O merge não altera nada em `lib/gastos`, `lib/financeiro`, `app/api/financeiro`, Omni Agent nem migrations.
- Preservados: Omni Premium, Datasource Guard, signout-race (#409), fuso PDV/trocas (#413), contrato PDV (#411),
  fontes locais (#414), Vestuário P03, Estação de Caixa, Cadastros.

## 3. Fundação G001–G006 (estado real)

| Fase | Implementado | Local | CI | Cloud | Publicado | Ativado |
|---|---|---|---|---|---|---|
| G001 perfis/ownership/membership/RLS | sim | sim (RLS 9/9 hoje) | parcial¹ | — | **migration em Production** (26/11) | não |
| G002 contas/categorias/writers/centavos | sim | sim | parcial¹ | — | não | não |
| G003 readers/documentos/privacidade | sim | sim | parcial¹ | — | não | não |
| G004 operações atômicas/revisão/estorno | sim | sim (contratos 7/7) | não¹ | — | não | não |
| G005 consultas/indicadores/Contador/Agent | sim | parcial² | não¹ | — | não | não |
| G006 canais/fila/outbox/worker/lease | sim | sim (relatório G006) | não¹ | **não comprovado** | não | não |

¹ A CI só exercita o Gestor Money por (a) o grupo `gastos_venda_titulo_legado_ci` e (b) o grupo Aparelhos, que
aplica as 5 migrations reais e confere DRIFT_ZERO. **As suítes `test/gastos/*.postgres.test.ts` não estão em
nenhum workflow** (fixtures presas a porta/usuário/caminho de cluster próprios). Lacuna de CI registrada.
² Ver §6: 5 casos G005 falham hoje por dependência de relógio/decisão HARDENING, todos pré-existentes.

G006: `CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL` (relatório G006) continua verdadeiro. G006 **não** está concluído.

## 4. Migrations e ledger

Checksum Prisma = SHA-256 dos bytes do arquivo. Checkout Windows traz CRLF; o deploy curado usa os bytes LF do git.

| Migration | SHA-256 (LF, git) | Estado |
|---|---|---|
| 20261126100000_gastos_perfis_autorizacao | `06c13027…9dd6` | **= checksum gravado em Production** (deploy 26/11 04:04Z). Não alterar |
| 20261126110000_gastos_contas_writers | `62bf6616…197f` | = FINAL-004; pendente |
| 20261126120000_gastos_readers_documentos | `1512b3b4…8d31` | pendente |
| 20261126130000_gastos_operacoes_atomicas | `0550c18c…75ae` | pendente |
| 20261126140000_gastos_canais_fila_worker | `f501997f…2e16` | pendente |

Ledger de Production (última leitura autorizada, 26/11): 31 linhas (30 + G001). P03
(`20261116090000_identificadores_etiquetas_p03`) segue **pendente** no ledger e fora deste processo; SaaS #398 idem.
`prisma migrate deploy` com o diretório do repositório aplicaria a P03 junto → **proibido**; usar o diretório
curado (ledger aplicado com bytes exatos + somente a próxima migration autorizada).

### Dependência código × schema (revalidada)

O schema da #405 acrescenta colunas a `contas_pagar_titulos`, `contas_receber_titulos`, `carteiras_financeiras` e
`movimentacoes_financeiras` (`perfilId`, `valorCentavos`, `ativo`, `versaoFinanceira`, …). O Prisma seleciona todas
as colunas escalares → **o código da #405 em Production antes da G002–G006 derruba Pagar/Receber/Caixa/PDV com
"column does not exist"**. Merge na main = deploy automático em Production. Ordem obrigatória:
migrations G002→G003→G004→G006 (uma por vez) → só então merge com a flag desligada.

## 5. Ensaio em PostgreSQL 17 descartável (`rehearsal4`)

Base = estrutura real de Production (dump só de schema do PREFLIGHT-003, zero linhas) + ledger real de 30
linhas + G001 aplicada pelo diretório curado (= Production hoje). Massa sintética carregada **antes**: 2 lojas, 400
títulos a receber, 60 a pagar, 5.001 movimentos (1 `NaN`), carteira desativada e **13 vendas da loja B ligadas a
títulos da loja A** (o caso FINAL-004). Escrita concorrente estilo PDV via `pgbench` (papel dono, como o runtime de
Production) durante todo o deploy.

| Prova | Resultado |
|---|---|
| Base: `migrate status` sem divergência de checksum | PASS |
| G001 pelo diretório curado: checksum = `06c13027…` e ledger 31 | PASS |
| Fingerprint legado (md5 de receber/pagar/movimentos/carteiras/vendas) após G001 e após G006 | **idêntico** |
| G002→G006 uma por vez sob PDV 5 tps (3 clientes) | ledger final 35 aplicadas; checksums = bytes LF do git |
| **Interrupção** (lock exclusivo concorrente em receber+movimentos durante G003) | G003 falhou **atômica**: 0 tabelas criadas, linha do ledger não finalizada |
| Recuperação | `migrate resolve --rolled-back` + nova tentativa → aplicada; G004 também desistiu 1× por `lock_timeout` e convergiu na 2ª |
| PDV concorrente | **2.008/2.008** transações, **0 falhas** (a migration desiste, nunca a venda) |
| Carga sintética de ~190 tps | G002 desiste sempre por `lock_timeout` (projetado) → exige janela de baixo movimento |
| P03 / SaaS | **não aplicadas** |
| Perfis/membros criados | 0/0 |
| Objetos | 24 tabelas com RLS, 35 policies, 58 triggers; `NaN` legado preservado (não saneado) |
| Gatilho G002 × 13 vínculos cruzados | UPDATE de payload da venda e de status do título **aceitos**; novo vínculo cruzado e lançamento novo em conta desativada **recusados** |

Ressalva honesta: na 1ª recuperação o `migrate resolve --rolled-back` saiu com exit 1 sem diagnóstico capturado;
o laço (deploy → P3009 → resolve → deploy) convergiu. O runbook deve prever repetir o `resolve` e conferir o
ledger antes de cada nova tentativa.

## 6. Gates executados nesta missão

| Gate | Resultado |
|---|---|
| `npm run test:root:pg` (runner oficial da CI, com o guard #404) | **SUITES_PG_OK** — OPS V4 41+18+13+77, Aparelhos 52 (aplica as 5 GM, DRIFT_ZERO), trocas 25, legado GM 8 |
| `test/gastos/rls-runtime-restrito.postgres.test.ts` (runtime NÃO dono, NOBYPASSRLS, `@/lib/prisma` real com guard #404) | **9/9** |
| `test/gastos/contratos-produto.postgres.test.ts` (novo, §7) | **7/7** |
| `test/gastos/reconciliacao` + `consumidores-g005` (flag ligada) | 25/30 — 5 falhas pré-existentes, abaixo |

As 5 falhas G005 (nenhuma tocada pelo merge):
1. `reconciliacao` "oito posições…transferência" e "recebível e parcial M1": os serviços legados
   (`transferirEntreCarteiras`, `aplicarPagamentoLegado`) gravam `ocorridoEm` nulo e `createdAt` no relógio real
   (provado no banco: 27/11), e o teste consulta outubro fixo. Os testes deixaram de passar em 01/11/2026.
2. `consumidores` "Agent … neste mês": **passa** com o relógio do Node recuado para 25/10 (provado) → mesmo tipo.
3. `consumidores` "título anômalo → 409" e "parcial 365,01 em todos os leitores": o `GET /api/financeiro/pagar`
   voltou à implementação da main **incondicionalmente** em `fdddc07` (HARDENING). Asserções G005 defasadas por
   decisão deliberada → **pendência de ativação**: com a flag ligada, a lista de Pagar não mostra restante G005
   nem recusa anomalia legada.
4. `consumidores-g005` nem carrega no `vitest.config.ts` do repositório (`@/types/os` do Omni Agent só existe no
   `tsconfig`); rodado com config temporária fora do versionamento. Pré-existente em main e PR.

Typecheck, ESLint, build, CI e previews: ver §10 (preenchido após a publicação).

## 7. Contratos de produto (exemplos 01–07)

`test/gastos/contratos-produto.postgres.test.ts` — proposta estruturada → revisão → confirmação → aplicação
atômica G004 → consulta G005, em PG real. **Não é WhatsApp nem interpretação de linguagem** (isso é G008).

| Exemplo | Prova |
|---|---|
| 01 "R$ 250 no mercado, Pix" | PESSOAL e EMPRESA: 1 fato, 25000 centavos, categoria Supermercado, 1 saída `pix`, conta 100000→75000; repetir a confirmação devolve a mesma operação; outro perfil vazio; outro ADMIN da loja não obtém o PESSOAL |
| 02 "devendo 800, vence dia 10" | obrigação 80000, vencimento 2026-11-10, **0 movimentos**, saldo intacto |
| 03 "paguei 200 daquela dívida" | mesmo título: pago 20000, **restante 60000**; consulta: aberto 60000, despesa realizada 20000 |
| 04 "600 no cartão em 3×" | 3 parcelas de 20000 em 3 ciclos, 0 caixa; pagar a 1ª fatura não cria fato/título novo; saldo 80000 |
| 05 "quanto gastei no mercado" | soma por **categoria estruturada** = 38050; descrição com "mercado" em outra categoria fica fora; consulta não escreve |
| 06 "transferi R$ 300" | EMPRESA: 70000/30000, receita = despesa = 0. **Lacuna: não existe transferência PESSOAL no motor G004** |
| 07 "registrei errado" | antes da confirmação: correção CAS invalida a versão antiga; depois: estorno do pagamento identificado com motivo, saldo volta a 100000, fato preservado, eventos auditados |

## 8. Production — preparação (não executada)

Pronto para nova rodada **mediante autorização específica**: harness read-only do PREFLIGHT-003
(`gm-preflight*.sql/.cjs`, fora do repo) — sessão `default_transaction_read_only=on`, `BEGIN … READ ONLY`,
identidade do projeto/branch/endpoint conferida antes de qualquer consulta, saídas redigidas, `ROLLBACK`.
Cobre: identidade, papel efetivo, owner, GRANTs, RLS/policies, `NOBYPASSRLS`, ledger, constraints/triggers, NaN/
Infinity, vínculos cruzados (os 13), carteiras desativadas, volumes, sessões/locks. Não foi executado hoje.

Estado conhecido (26/11, a revalidar): runtime de Production = papel **dono** com BYPASSRLS via pooler → o RLS do
Gestor Money não protege dado PESSOAL no banco enquanto o runtime não for trocado por um papel não dono com GRANTs.
Isso é pré-condição de **ativação** (não de migration).

### Ordem proposta (cada passo com autorização própria do dono)

1. Preflight read-only atualizado (incluindo os 13 vínculos e NaN/Infinity) + backup cifrado + restauração de prova.
2. Janela sem movimento de PDV; G002 pelo diretório curado (ledger aplicado + só G002); conferir ledger/fingerprint.
3. G003, G004, G006 — idem, uma por vez; em `lock_timeout`: `resolve --rolled-back` e repetir.
4. Merge da #405 com `GESTOR_MONEY_ENABLED` ausente; conferir `MIGRATION_SKIPPED` e smoke de PDV/Caixa/Financeiro.
5. Ativação (G006.5+): papel de runtime não dono + GRANTs nas 21 tabelas pós-A3 + fluxo governado de
   `PerfilMembro` + GET Pagar sob a flag + carga limitada em `carregarConsulta`.

## 9. Handoffs

### G006.5 — Gestor Money Mobile Web / PWA (não iniciado aqui; outra sessão já abriu worktree)

- Reaproveitar: AppShell (único dono de scroll), tokens semânticos/Omni Premium, PWA existente (atenção à memória
  do SW que cacheia `GET /api/*` — rotas financeiras precisam continuar `no-store` e fora do cache offline),
  `requireFinanceiroPerfilAccess` (seleção segura de perfil), `lib/gastos/{contas,categorias,cartoes,operacoes,apply,
  query,documentos}`. Nada de motor paralelo nem loja fictícia para PESSOAL.
- Superfícies 1–14 do GOAL mapeiam para: visão geral = `consultarFinanceiro`; despesa/receita/dívida/pagar/receber/
  cartão/parcelas = propostas `GASTO_PAGO`/`CONTA_PAGAR`/`PAGAR_TITULO`/`COMPRA_CREDITO`/`PAGAR_FATURA` via revisão
  + confirmação; histórico/estorno = `ESTORNAR_PAGAMENTO`; comprovantes = documentos G003.
- Lacunas a resolver antes/na G006.5: (a) **transferência PESSOAL** no motor G004; (b) receita PESSOAL
  estruturada; (c) GET Pagar com caminho G005 sob a flag; (d) concessão governada de `PerfilMembro`;
  (e) `carregarConsulta` com carga limitada; (f) runtime não dono em Production para privacidade PESSOAL real.

### G007 — WhatsApp (binding/telefone) e G008–G012

- Reusar o roteamento multi-loja por `phone_number_id` (`WhatsAppPhoneNumber`, ADR-0006) e a verificação
  `X-Hub-Signature-256`; número dedicado GESTAO resolve **usuário** antes do contexto; ATENDIMENTO segue por loja.
- G007: OTP/desafio, binding, revogação, rebind; entrada interna com principal autenticado pelo binding (sem sessão
  fabricada, sem confiar no `userId` do remetente). G008: contexto conversacional, ambiguidade → pergunta, revisão →
  confirmação → aplicação G004. G009: áudio/STT privado por perfil. G010: imagem/OCR + E2E A01–A20. G011/G012: A21/A22.
- Sem Evolution/não oficial como substituto automático; sem mensagens/números reais; sem segredos pelo chat.

### Requisitos da prova de runtime cloud (G006)

Host 24/7 independente do computador do dono (Render Background Worker é o candidato documental), Node 24, papel
`omni_gastos_worker` com privilégio mínimo (o `--health` já varre privilégios), banco de **homologação** aprovado
(`GASTOS_WORKER_APPROVED_DATABASE`, `sslmode=require`), heartbeat/lease/recovery comprovados com processo real,
e **reaproveitar a política de datasource da #404** no worker (hoje ele recusa Production por convenção de
ambiente/papel/nome, não pela identidade do banco — P2). Nada contratado nesta missão.

## 10. Publicação

(preenchido após push/CI)
