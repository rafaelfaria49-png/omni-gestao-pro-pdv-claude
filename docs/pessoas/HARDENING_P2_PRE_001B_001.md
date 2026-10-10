# Pessoas — hardening P2 antes de 001B

GOAL: PESSOAS-DP-HARDENING-P2-PRE-001B-001. Executor: Codex / família openai.
Branch: goal/pessoas-hardening-p2-pre-001b-001.
Worktree: C:/Projetos/omni-gestao-pessoas-hardening-p2-pre-001b.

Os três P2 estão implementados e o runner oficial passou. Revisão independente de outra família permanece pendente.

## Base e autorização

Base inicial: 4e87fb13f53fa9f78e229d88b1b8566f95262ad0, origin/main corrente no preflight.
O planejamento 1e45f98ade83b3071548d581225928b0fd95b06c foi confirmado como ancestral.
AEP aberto na trilha pessoas; test_command: node scripts/pessoas/run-hardening-tests.mjs.
Somente G-CONFIG-DEPLOY está liberado, exclusivamente para excluir cache Pessoas em next.config.mjs.

## Implementação

- commands.ts: até três tentativas totais Serializable, preservando maxWait 10s e timeout 20s.
  Após cada P2034, inclusive na terceira falha, consulta replay fora da transação abortada antes de retry/409.
  Replay válido retorna a entidade existente; incompatível mantém IDEMPOTENCIA_CONFLITO.
  P2002 conserva replay/DUPLICIDADE sem retry. PessoasError e demais erros são propagados.
  Mutação e auditoria permanecem atômicas; nenhum log de payload/PII foi introduzido.
- domain.ts/cadastro.ts: helper único jornadaSemanal, string canônica entre 0.00 e 168.00.
  Tipo, formato, sinal ou limite inválido produz JORNADA_INVALIDA/400 antes de executarComando nos dois serviços.
  Ausência continua permitida no rascunho e é rejeitada no versionamento contratual. Validação monetária preservada.
- next.config.mjs: NetworkOnly same-origin GET para /api/pessoas e /dashboard/pessoas, incluindo descendentes.
  A regra precede API, assets, HTML, RSC e prefetch; extendDefaultRuntimeCaching preserva as regras anteriores.
  O hook transforma o único swe-worker antes de Workbox calcular manifesto/revision.
  A guarda impede fetch, leitura e escrita de cache Pessoas nas mensagens de navegação e de start URL.
  Mudança/ausência do contrato do worker faz o build falhar. PWA e cacheOnFrontEndNav continuam ativos.

## Runner e isolamento

run-hardening-tests.mjs reutiliza run-official-tests.mjs e testa git archive HEAD em workspace externo.
Instala com npm ci, gera Prisma Client e cria PostgreSQL exclusivo em loopback:55439.
O ambiente filho usa allowlist de sistema e configs npm temporárias distintas; segredos e autoridade de produção são removidos.
HEAD com .env carregável é recusado. A worktree de origem permanece sem node_modules.
A baseline do merge-base recebe o trecho canônico de invariantes da migration 001A ratificada, conferidos no catálogo real.

Os arquivos Vitest são sequenciais; as corridas determinísticas dentro dos testes permanecem concorrentes.
Falhas após mutação e auditoria são revertidas por transações PostgreSQL reais antes de replay/retry.
Jornada inválida confere zero transação/escrita/auditoria, nenhum constraint error e ausência de sentinelas de PII em logs.

Depois de toda lib/pessoas, build e aceite PWA, executa npm run typecheck, ESLint focado com --max-warnings=0 e outro build/aceite no mesmo HEAD.
Cada build exige MIGRATION_SKIPPED. CIRCLE_NODE_TOTAL=2 limita workers somente no ambiente descartável; timeout por processo: 45 minutos.
A limpeza em finally encerra o cluster e remove workspace, dependências, .next, SW/workers e relatórios temporários.
Workspace ausente e porta 55439 livre são condições de PASS. A evidência saneada é salva depois da limpeza.

## Validação oficial

HEAD da evidência: 427962fcfadabf2bb36848ba4a5dfd3107d338bc; base: 4e87fb13f53fa9f78e229d88b1b8566f95262ad0.

| Verificação | Resultado |
| --- | --- |
| Toda lib/pessoas | 95 PASS; skipped 0; todo 0 |
| Integração anterior / hardening | 15 / 46 PASS |
| P2034 | transiente: 2; persistente: exatamente 3; replay após tentativa 1 e 3 |
| Invariantes / drift | 10 CHECKs, 7 índices parciais, 10 triggers, 4 funções; nenhum drift |
| SW Pessoas | 30 variações NetworkOnly; GET same-origin; ausente do precache |
| Outras rotas / defaults | 8 rotas e 17 regras com estratégias, options e ordem preservadas |
| Worker real | 96 mensagens Pessoas sem fetch/cache; 24 mensagens externas preservadas |
| NetworkOnly real offline | 1 fetch; 0 acessos a cache; fallback false |
| Revision do worker | d92f86d064c9a9375d4cad1d122d9b0d; MD5 dos bytes e referência do cliente conferidos |
| Typecheck / lint / builds | PASS / PASS / PASS; dois builds completos |
| Limpeza | PASS; workspace removido e porta livre |

Evidência saneada: docs/ai-execution/_evidence/PESSOAS-DP-HARDENING-P2-PRE-001B-001/runner.json. Ela identifica o HEAD testado e contém os hashes completos do SW/worker.
O fechamento AEP repete o test_command contra o commit funcional final limpo e registra o resultado no relatório automático e ledger Pessoas.

As tentativas 1 e 2 estão em attempt-1.json e attempt-2.json: falha de carga do módulo CLI e interferência SSI entre fixtures de arquivos paralelos.
As correções extraíram o helper de ambiente puro, tiparam seu parâmetro como mapa de variáveis e serializaram os arquivos Vitest.
A tentativa AEP 3/3 aprovou a execução integral.

## Handoff

O escopo permanece nos três P2, runner e provas. P3s, frontend 001B e folha/GOAL 002 permanecem fora desta entrega.
Schema, migrations, dependências, auth/proxy e outros módulos não foram alterados.
Os testes usam somente dados sintéticos e PostgreSQL descartável; nenhum banco ou bucket real foi usado.
PESSOAS_DP_ENABLED foi usado apenas no processo sintético dos testes.
CURRENT_STATUS/CHANGELOG/MASTER_CONTEXT ficam fora da allowlist; a documentação permanece nos caminhos autorizados.
Após fechamento e push da mesma branch, aguardar revisão independente antes de qualquer PR/merge.
