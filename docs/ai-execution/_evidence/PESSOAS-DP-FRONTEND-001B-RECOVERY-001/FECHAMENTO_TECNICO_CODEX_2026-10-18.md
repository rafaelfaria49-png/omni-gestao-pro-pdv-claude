# Pessoas 001B — autorrevisão Codex e impedimentos de fechamento

Data: 18/10/2026, America/Sao_Paulo. GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.
PR exclusiva: [#273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273).
Executor: Codex/OpenAI. Esta é uma autorrevisão integral única, não uma revisão independente.

## Veredito

**Fechamento técnico impedido.** P0=0, P1=0, P2=1. O P2 é uma incompatibilidade preexistente do backend 001A que impede o fluxo documental em Stores reais com IDs curtos. A correção fica fora da allowlist. A única rodada do check oficial também foi impedida pela reserva de disco: aproximadamente 1,9 GiB livres no volume C:, contra mínimo obrigatório de 12 GiB.

Nenhum código de produto foi alterado. Nenhum teste não executado recebeu PASS. Não houve nova revisão GLM, envio a outra IA, repetição de smoke QA, merge, rebase, force push, produção ou GOAL 002.

## Decisão humana — proveniência e limite

Fonte: mensagem direta do usuário neste chat em 18/10/2026, missão “FECHAMENTO TÉCNICO DIRETO — PR #273”.

> O usuário decidiu dispensar a revisão externa adicional deste GOAL, condicionada à autorrevisão completa do Codex sem achados bloqueantes.

A decisão é exclusiva desta PR e não modifica a política global de revisão nem autoriza ignorar testes, gates ou histórico. Não será solicitada nova revisão GLM 5.3.

```text
INDEPENDENT_REVIEW=WAIVED_BY_HUMAN_DECISION
SELF_REVIEW=CODEX
HUMAN_MERGE_AUTHORIZATION=PENDING
WAIVER_CONDITION=SELF_REVIEW_WITHOUT_BLOCKING_FINDINGS
WAIVER_CONDITION_SATISFIED=NO_P2_STORE_ID_DOCUMENTS_OPEN
```

O texto registra a dispensa humana e sua condição; não declara a condição cumprida nem apresenta Codex como segunda família. Não foi alterado o META do GOAL para esconder a exigência anterior. A formalização de uma mudança efetiva de planejamento, se necessária após cumprir a condição, deve seguir o rito do §2 do EXECUTION_PROTOCOL: GOAL humano → registry oficial → commit de planejamento separado. Não se editou ledger/state/REGISTRY/GATES. Não se alterou test_command, classe, risco, allowlist, base ou tentativas para obter close. O item 8 do check oficial também proíbe delta em goals/ na base de execução; uma alteração no GOAL nesta branch exigiria conciliar formalmente esse limite, nunca ignorá-lo.

## Identidade, proveniência e main

- Worktree: C:/Projetos/omni-gestao-pessoas-001b-recovery-001.
- Branch: goal/pessoas-001b-recovery-001, limpa antes da revisão/check.
- SHA integral analisado e usado pelo check: **12022ff41c2046350f4c4ab2aff5681e24b95410**.
- Base AEP/merge-base: 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d.
- PR #273 confirmada por gh pr view: OPEN, DRAFT, headRefName e headRefOid corretos, MERGEABLE/CLEAN no momento da consulta. O baseRefOid exibido pela PR era a70469ddb96ba60f9575ab8036a78a71da35d35d; não foi usado como main atual.
- Main remota confirmada por git ls-remote e ref local após o fetch do check: **976ebaa294e09441ce0c5be7bbe5776a568f4013**.
- Commits funcionais: 9e890b3 (transporte), 34cd1b4 (R1–R5), 6c372f9 (R2-01/R2-02) e 6cd2031 (F-01). b5b59b6 e os cinco commits posteriores a 6cd2031 são documentais.
- Último código funcional: 6cd20313ad7f1404a99d691644c82fc92ae47a55.
- Entre o DEPLOYED_SHA informado/registrado nas evidências, cdcd29f2463f98e971034932abfd6a3bc739913f, e o HEAD analisado há somente documentação/evidências. Não foi consultado ou alterado um deployment nesta sessão.
- Delta líquido: 58 caminhos na entrega, todos na allowlist; 596 caminhos modificados pela main desde a base, **zero interseção** com os caminhos efetivamente alterados nesta branch.
- O check avisou rebase_needed por nove commits upstream que tocaram padrões amplos da allowlist, inclusive governança. É aviso consultivo, não prova de conflito textual. Não houve incorporação de WIPs.
- As mudanças compartilhadas da main em next.config.mjs preservam a exclusão Pessoas/NetworkOnly e acrescentam privacidade de clientes; lib/prisma.ts remove logs de erros que poderiam conter valores; Topbar ajusta atalho de outra tela; proxy-session-gate acrescenta rotas públicas de privacidade. A inspeção não identificou incompatibilidade concreta com os contratos Pessoas. A combinação final não foi compilada/testada.

## Cobertura da autorrevisão

Leitura de todas as rotas e dos nove arquivos de componentes Pessoas, wrappers de servidor, adapter, disponibilidade, ações 001A, serviços cadastrais/admin, guards, comandos idempotentes, DTOs, contratos HTTP/documentais, política/intent/storage, consumidores de navegação e runners/suítes pertinentes. Sem leitura de .env ou credenciais. Fontes/evidências inspecionadas permaneceram no orçamento de 85 arquivos declarado.

| Área | Conclusão de código | Limite de evidência |
| --- | --- | --- |
| Cadastro/lista/rascunho | Campos delegados a criarFuncionario, filtros locais e estados distintos; nenhum CRUD paralelo. CPF não é buscado por linha. | Cadastro/reload real somente no QA histórico. |
| Ficha/edição | expectedPersonVersion e expectedVersion corretos; lacunas do RASCUNHO preservam imutáveis. Releitura após salvar/conflitar. | Nova execução automatizada não ocorreu. |
| Contratos | ALTERACAO/CORRECAO, supersedesId, vigência civil e decimais textuais compatíveis com 001A; sem overwrite deliberado. | Conflitos/replay completos não receberam PASS de runtime. |
| Histórico/remuneração | Salário e motivos pessoais/contratuais são redigidos no DTO sem viewRemuneracao; DOM usa o marcador de restrição. | QA anterior não inspecionou todos os payloads de rede. |
| Store/empregador/permissões | Wrappers conferem expectedStoreId com exigirAtor antes das actions; escopos backend usam usuário ativo, membership, Store, unidade e grant não revogado. Sem herança de EnterprisePermissions para Pessoas. | Nenhuma prova nova de revogação/duas abas foi executada. |
| Respostas tardias/idempotência | UUID/payload retidos no replay; formulários e recursos descartam respostas de outra geração/escopo; troca de identidade/empregador desmonta estado sensível. | Análise de código; não substitui runtime. |
| Documentos | Mesmo File/URL/headers/intent; PUT exclusivo; 412 segue para complete; só complete confirmado anuncia sucesso; recusa definitiva exige descarte explícito. | **P2-01** abaixo limita Stores curtas. |
| Configuração | Bootstrap e manutenção usam ações canônicas; versões/motivos/endereço enviados conforme DTO; manageAccess continua necessário. | Nenhum grant novo ou mudança de regra. |
| Navegação/visual | prefetch=false, ordem Financeiro/Pessoas/Contador, min-w-0 e contenção local de overflow presentes. | Matriz visual/acessibilidade integral permanece pendente. |

### Correções anteriores, sem nova atribuição de PASS

| Correção | Resultado da leitura atual |
| --- | --- |
| R1 | Store esperada comparada na requisição; storage invalida contexto e gerações descartam respostas antigas. |
| R2 | Trava síncrona coordena ficha/documentos; intent é conservado durante releitura e resultado incerto. |
| R3 | E2E distingue data-studio-theme=black da classe black-edition. |
| R4 | Quebra local de nomes/cargo/matrícula e ficha, sem mudança global de scroll. |
| R5 | Intenção de foco aguarda o recurso recarregado e componente ainda montado. |
| R2-01 | REDE transitória oculta/inertiza e conserva somente o contexto da mesma identidade; retomada exige revalidação. |
| R2-02 | Retry PUT reutiliza bytes/headers; URL vencida bloqueia PUT e mantém possibilidade de complete/lista. |
| F-01 | waitForConfirmation libera espera pelo AbortSignal, consome respostas/rejeições tardias e evita que a tentativa cancelada altere locks/estado da tentativa atual. Regressões incluem Promise original nunca resolvida. |

## P2-01 — documentos recusam IDs válidos de Store com menos de oito caracteres

**Arquivo/linha principal:** lib/pessoas/documentos/service.ts:55 (helper refCanonica, linhas 53–57).
**Contratos que comprovam o gatilho:** lib/pessoas/scope.ts:24 aceita Store de 1–100 caracteres; lib/store-defaults.ts:4 e :16 declaram loja-1 e loja-2 como IDs reais suportados.

Com usuário, unidade, empregador e capacidades válidos nessas Stores, criarUploadIntent chega a refCanonica na linha 78. O helper aplica a mesma regex de mínimo oito caracteres a empregadorId, storeId e documentoId. loja-1/loja-2 têm seis; ele lança INTENT_INVALIDO/403 antes de emitir intent ou pedir URL R2. O frontend chama esse serviço sem alterar a Store, portanto não consegue enviar documentos nessas unidades. O mesmo helper é usado em complete e download.

**Verificação dirigida executada:** o helper real foi extraído do source, teve apenas os tipos removidos pelo Node 24 e foi invocado isoladamente, sem banco/rede/storage. Resultado: loja-1 e loja-2 → INTENT_INVALIDO/403; qa-pessoas-a → aceito. O diagnóstico não é Vitest, E2E, smoke ou teste completo do serviço. Resultado preservado em store-id-diagnostic-2026-10-18.json.

**Origem:** preexistente em 001A, fora do diff funcional desta PR e igualmente presente na main inspecionada. É uma incompatibilidade de integração, não regressão atribuída ao frontend.

**Correção mínima proposta, não aplicada:** validar storeId com a mesma gramática 1–100 de exigirAtor, mantendo a validação própria dos IDs de empregador/documento e o namespace completo. Acrescentar regressão usando Store sintética curta, cobrindo upload-intent/complete/download sem relaxar isolamento.

**Limite formal:** lib/pessoas/documentos/service.ts não está na allowlist; uma regressão pode usar scripts/pessoas/frontend.integration.test.ts, já permitido; o GOAL exclui expressamente serviços/APIs documentais 001A. A autorização atual permite corrigir somente dentro da allowlist. Não foi aplicado contorno pelo frontend nem ampliada a allowlist.

## QA real reaproveitado

- 15/10: projeto Neon QA/baseline 109 tabelas e invariantes; criação de empregador/estabelecimento e cadastro A ativo; reload, edição pessoal v2, ALTERACAO v2/histórico; cadastro B rascunho; listas A/B e URL direta recusada; leitor viewCadastro sem salário/motivos/edição/documentos no DOM.
- 16/10: bucket R2 privado QA, upload real de 729 bytes, intent/PUT positivo/complete/list/reload, integridade do objeto por SDK e PUT exclusivo 412; download autorizado auditado e confirmado pelo usuário; Store B recusando ficha A já com documento.
- QA usou qa-pessoas-a/b (IDs longos). Logo não cobre P2-01 e não o contradiz.
- R2 Preview estava fixado em cdcd29f2463f98e971034932abfd6a3bc739913f; produto é equivalente ao HEAD analisado, por delta somente documental.
- Não foram repetidos esses smokes. Download recebido pelo navegador não teve hash inspecionado pela ferramenta; recuperação de PUT 412 pela UI e complete cancelado nunca resolvido não foram exercitados naquele QA.
- As capturas comprovam amostra da lista nos quatro temas a 1440×900/390×844, não a matriz integral de telas/360×800/teclado/foco. A matriz continua pendente.
- As compilações remotas anteriores pularam tipos. Não equivalem a typecheck ou bateria aprovada.

## Validações desta sessão

| Comando/etapa | Resultado real |
| --- | --- |
| status pessoas / open pessoas | GOAL RUNNING, tentativa 1/3, branch/worktree corretas; open regravou apenas marcador gitignored. |
| node scripts/track.mjs verify --all | PASS, exit 0, sem divergências nas dez trilhas/REGISTRY/GATES. |
| node scripts/track.mjs check pessoas | **FAIL**, item 10. Itens 1–9 PASS no SHA 12022ff; upstream AVISO e próximo GOAL informativo. Saída integral em aep-check-2026-10-18.txt. |
| node scripts/pessoas/run-frontend-tests.mjs, invocado pelo check | **FAIL de infraestrutura, exit 5**, reserva insuficiente no volume C:. |
| Ambiente observado | Node v24.14.1; initdb/pg_ctl/psql/postgres 17 instalados; aproximadamente 2.058.362.880 bytes livres na inspeção inicial; exigidos 12.884.901.888 bytes por volume. |
| npm ci / Prisma generate | NOT_RUN — preflight de disco recusou a próxima etapa. |
| Typecheck / Vitest / integração PostgreSQL | NOT_RUN. Nenhuma contagem aprovada. |
| Build/PWA / lint focado/global / Playwright ON/OFF | NOT_RUN. Chromium do lock também não foi validado. |
| Diagnóstico puro P2-01 | Executado, exit 0; duas Stores válidas recusadas e QA longa aceita. Não é bateria completa. |
| Smokes QA externos / Docker / produção | Não executados nesta sessão. |
| close / block / attempt | Não executados; nenhuma ratificação ou consumo artificial de tentativa. |

A rodada oficial ocorreu uma vez. Não houve redução da reserva, instalação na worktree, uso de .env, cluster existente, banco remoto ou arquivos de outras tarefas para tentar produzir PASS. Evidências novas e a atualização do relatório são documentais e permanecem na allowlist. O check não foi reexecutado para commits meramente documentais.

## Ação necessária e ponto de parada

A PR permanece draft e sem autorização de merge. Para prosseguir no mesmo GOAL: decisão humana de planejamento para incluir somente lib/pessoas/documentos/service.ts na allowlist, com regressão em scripts/pessoas/frontend.integration.test.ts já permitido, e ambiente com pelo menos 12 GiB livres em cada volume usado (mais se o consumo medido exigir). Após a correção autorizada, executar a validação oficial efetiva e completar as provas obrigatórias ainda ausentes. Não repetir os smokes já comprovados sem causa técnica. Nenhuma nova revisão externa foi pedida.

**AEP_CLOSE=NOT_RUN. MERGE_READINESS=BLOCKED.** A condição da dispensa está registrada, mas não satisfeita. Este relatório identifica os impedimentos e não fabrica DONE/aceite. Nenhum GOAL 002 foi iniciado.
