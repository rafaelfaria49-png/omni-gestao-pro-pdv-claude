# PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003 — evidência R4

Data: 2026-10-01. Executor: Codex / família openai.
Branch: goal/pdv-parity-n5-b1-current-main-correction-r4.
Worktree: C:/Projetos/omni-gestao-pdv-n5b1-current-main-correction-r4.

## Base e AEP

- Fetch de origin concluído antes de criar a worktree.
- MAIN_CURRENT_SHA / MAIN_BASE_SHA = ef4f5bfcc1d69ca2d8840efc077dbcc6a28aeb38.
- A main permanece no merge do planejamento (#227). UPSTREAM_ALREADY_FIXED=NO.
- Worktree limpa criada exclusivamente da origin/main corrente; nenhum estado R2/R3 copiado.
- AEP_OPEN=PASS; ACTIVE_GOAL=PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.
- BRANCH_MATCH=YES; WORKTREE_MATCH=YES; tentativa AEP 1/3.
- verify --all antes e depois da implementação: PASS, sem divergências.

## Implementação

Somente os dois componentes autorizados e o novo teste em lib/pdv foram alterados.

1. Assistência: CartPersisted recebe pendingIdentity; restore registra o token antes de
   publicar a hidratação. A mesma função persistCart serializa o cache usado pelo
   debounce e pelo retorno PENDING, que a chama sincronicamente antes de fechar o modal.
   O callback lê a identidade no instante da escrita, inclusive quando foi agendado
   antes do resultado PENDING. Não há persistência paralela criada para o teste.
2. A hidratação é publicada em estado React por loja. O primeiro carrinho vazio do
   mount não pode zerar o desconto recém-restaurado. A troca de loja restaura seu
   próprio estado ou um carrinho vazio antes de qualquer escrita no cache novo.
   Chaves, TTL de 12h, cliente, descontos R$/%, normalização e holds legados preservados.
3. Os listeners dos dois componentes têm cleanup e reinstalação a cada render.
   F1/F10/F12 da Assistência e F1 da Venda Completa usam os mesmos handlers atuais
   que o clique, sem array de dependências incompleto nem supressão ESLint no listener.
   Mapeamento e guards existentes de modal/foco/reentrada permanecem.
4. Confirmação da Venda Completa passa de hasPending() para isUnresolved(sales),
   igual à abertura e às duas portas da Assistência. A autoridade continua sendo
   o guard canônico existente e sales/syncPending; ausência na lista segue fail-closed.
   operations-store, PaymentModal, Classic e Supermercado não foram editados.

## Prova comportamental / componentes

Arquivo: lib/pdv/current-main-correction.component.test.ts.

Monta os dois componentes produtivos com React Testing Library e jsdom. Providers,
I/O e diálogos filhos têm doubles explícitos; storage real do jsdom, serializer,
restore, guard, handlers dos componentes, hold store e listeners window são os reais.
Nenhuma venda real, chamada de banco, endpoint externo ou dado produtivo foi escrito.
Fixtures somente semeiam inputs legados; as gravações examinadas são da produção.

- PENDING → cache real imediato → unmount/remount → bloqueio de F1 e confirmação.
- Token original id/clientSaleId persiste; segunda finalize e geração de identidade zero.
- Sem edição do carrinho e sem avançar 500ms, o retorno PENDING já grava o token.
- Timer anterior não sobrescreve o token; legado sem pendingIdentity continua válido.
- Cliente, descontos R$/%, normalização de linha e TTL preservados.
- Clique/F1 são fixtures independentes para cada superfície; F10/F12 também cobertos.
- Só sales muda no teste de liberação: carrinho, cliente, total e modal permanecem iguais.
- Transição inversa também coberta: sales antigo resolvido não libera pendência atual.
- Confirmação direta não depende de um clique que limpe o token antes.
- Modal já montado recebe identidade por callback produtivo de resume e testa sales
  pending, resolved e ausente, com a mesma autoridade operacional.
- Lista parcial mantém bloqueio; holds R3 e legados continuam válidos.
- Cache Store A/Store B isolado; holds também isolados por terminal; troca da
  Assistência montada não copia carrinho ou token para outra loja.

Baseline ef4f5bf (antes do patch): testes reproduziram ausência de token no cache,
F1 stale nas duas superfícies, F10/F12 stale na Assistência e gate divergente na VC.
Também foi observado o reset do desconto restaurado no primeiro effect vazio.
Após o corretivo: 34/34 casos component-level passaram.

## Validações retomadas após autorização humana

A recusa anterior de geração foi resolvida pela autorização humana explícita
R4 / PRISMA CLIENT LOCAL, em 2026-10-01. Ela permite apenas os artefatos locais
ignorados necessários aos gates e não amplia a allowlist de arquivos versionados.

- Antes: git ls-files generated/prisma sem saída (zero arquivos rastreados).
- npx prisma generate --schema prisma/schema.prisma: exit 0, Prisma Client 6.19.3.
- Depois: git status --ignored --short generated/prisma mostra !! generated/prisma/;
  git ls-files continua sem saída. Schema e manifests não foram alterados.
- Test_command canônico completo: PASS, 46 arquivos e 662 testes.
- Teste R4 explícito e independente da suíte canônica: PASS, 34/34 casos.
- npm run typecheck: PASS, exit 0, incluindo os arquivos produtivos e o teste novo.
- ESLint dos dois componentes e teste R4: exit 0; zero erros; os mesmos 2 warnings
  da baseline na Venda Completa (useMemo de pdvParams e supressão redundante
  do autofocus). Nenhum warning novo; arquivo de testes sem warnings.
- npm run build: PASS, exit 0; compilação Next/PWA e 102 páginas estáticas.
  VERCEL_ENV=development manteve o runner em MIGRATION_SKIPPED; não houve
  migrate, db push ou alteração de banco. Aviso de Browserslist preservado,
  sem editar package.json/package-lock.json. Service worker local ignorado.
- git diff --check e node scripts/track.mjs verify --all: PASS.
- Status normal do Git continua restrito aos quatro caminhos autorizados.
- TRACKED_FILES_CREATED_OUTSIDE_ALLOWLIST=0; cliente gerado continua ignorado.

## Fronteira e próximo passo

Nenhuma edição produtiva em operations-store, operations-sale-types, pdv-hold,
PaymentModal, Classic, Supermercado, schema/migrations, Fiscal, Cadastros ou Caixa.
Nada iniciado de N5-B2/N5-C. Nenhum PR de integração aberto e nenhum push para main.
Revisão R independente por outra família ainda não realizada nesta execução.
INTEGRATION_READINESS=READY_FOR_INDEPENDENT_REVIEW (a revisão R ainda é obrigatória).
NEXT_STEP após validação/close/push: REVISÃO-INDEPENDENTE-STRICT-N5-B1-R4.

## Resultado dos gates técnicos — antes do commit e fechamento

```text
MAIN_BASE_SHA=ef4f5bfcc1d69ca2d8840efc077dbcc6a28aeb38
FILES_CHANGED=4 (2 componentes + teste R4 + esta evidencia)
IMPLEMENTATION_STRATEGY=serializer runtime compartilhado; reidratacao por loja; listeners atuais; isUnresolved(sales) nas duas portas

ASSIST_PENDING_RELOAD=SAFE
ASSIST_PENDING_RELOAD_SECOND_FINALIZE=ZERO
PENDING_IDENTITY_REHYDRATED=YES
PENDING_CACHE_IMMEDIATE=YES
LEGACY_CACHE_COMPATIBLE=PASS
VC_F1_CURRENT_SALES=YES
ASSIST_F1_CURRENT_SALES=YES
CLICK_KEYBOARD_PARITY=PASS
CONFIRM_OPEN_GATE_CONVERGED=YES
PENDING_RELOAD_IDENTITY=STABLE
PENDING_HOLD_RESUME_IDENTITY=STABLE
STORE_ISOLATION=PASS
BEHAVIORAL_TESTS=PASS_34
COMPONENT_OR_BROWSER_PROOF=PASS_COMPONENT_LEVEL
N5B1_REGRESSION=PASS
N1_REGRESSION=PASS
N3_REGRESSION=PASS
N4_REGRESSION=PASS
SCANNER_REGRESSION=PASS
TYPECHECK=PASS
ESLINT=PASS_0_ERRORS_2_BASELINE_WARNINGS
BUILD=PASS
DIFF_CHECK=PASS
PRISMA_GENERATE=PASS
GENERATED_PRISMA_GIT_IGNORED=YES
TRACKED_FILES_CREATED_OUTSIDE_ALLOWLIST=0
CANONICAL_SUITE=PASS_46_FILES_662_TESTS
AEP_OPEN=PASS
VERIFY_ALL=PASS
BLOCKERS=NONE
RESIDUAL_RISKS=revisao R por outra familia pendente; warnings baseline preservados
INTEGRATION_READINESS=READY_FOR_INDEPENDENT_REVIEW
NEXT_STEP=REVISÃO-INDEPENDENTE-STRICT-N5-B1-R4
```

Arquivos alterados:

- components/dashboard/vendas/pdv-assistencia-enterprise.tsx
- components/dashboard/vendas/venda-completa-enterprise.tsx
- lib/pdv/current-main-correction.component.test.ts
- docs/ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md

Fronteira final dos gates: apenas os quatro caminhos técnicos acima alterados.
Nenhum artefato gerado foi rastreado; nenhum arquivo versionado fora da allowlist
foi alterado pelos gates. Commit técnico, close e push são os passos subsequentes
a esta evidência; seus SHAs/veredictos ficam no relatório final e no relatório
canônico AEP em _closed/reports/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003-a1.md.
Derivados de fechamento são escritos exclusivamente pelo close, sem edição manual.
CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT nao foram editados: fora da allowlist;
a evidencia desta correcao fica exclusivamente no path documental autorizado.
