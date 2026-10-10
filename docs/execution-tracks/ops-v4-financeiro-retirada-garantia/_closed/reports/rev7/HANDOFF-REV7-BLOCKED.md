# Entrega — GOAL 002 revisão 7 BLOQUEADO

| Marco | Estado verdadeiro |
|---|---|
| IMPLEMENTADO | Dois P1 financeiros corrigidos; contrato A ainda tem o P2 abaixo |
| VALIDADO | Test_command AEP PASS em cd69780, com 809 Vitest + 9 Playwright; regressões/baselines discriminadas |
| REVISAO_APROVADA | NÃO: Anthropic REQUEST_CHANGES, P0=0 / P1=0 / P2=1 / P3=5 |
| PUBLICADO | NÃO: branch e PR draft preservados; produto não mergeado |
| HOMOLOGADO | NÃO; PROD_SMOKE=OWNER_PENDING_AUTH |

## Gate final e revisão real

Revisor: família Anthropic, Claude Code/Claude Opus 5.5 (modelo observado claude-opus-5-5), nova sessão f20ef356-1f02-462d-90c8-f37564dce04e. Executou 64 chamadas somente de leitura; processo exit0, result success, is_error=false. O sucesso da CLI significa parecer produzido, NÃO aprovação.

SHA revisado: cd69780c81b3bc159cd5f0810daabc98aae06a34. Veredito: REQUEST_CHANGES. P0=0, P1=0, P2=1, P3=5. Parecer íntegro: veredito-r-anthropic-cd69780.md (SHA-256 c1237bd814e0765fdcdf5ca41140544d057b67d5ec53070741b8f1e0a27db337). Metadados brutos locais preservados em review-rev7/r-anthropic-raw.jsonl; SHA-256 9e05fbc6b9c6ab1d040903174157606d81be3253b4b9f8455a96b840d77b5471.

O revisor leu todo o produto A–E, mas amostrou parte dos testes; não verificou pessoalmente T56c nem os hashes do manifesto. Esses limites estão preservados no parecer. A nova R deverá ler integralmente os testes e conferir essas evidências. Não se contabiliza esta R como APPROVE ou como validação autônoma das contagens de testes.

P2 bloqueante: a recusa imediata moderna preserva estado/ID/fingerprint/mensagem, mas descarta comercial={codigo,destino}; a persistência e o replay também perdem esse motivo. O misto já transporta o campo. A R não encontrou caminho para segunda baixa no escopo financeiro analisado, mas o contrato A não está completo.

Proposta concreta NÃO APLICADA: proposta-p2.patch, cinco arquivos existentes na allowlist; git apply --check exit0. Acrescenta motivo comercial à resposta, persistência e replay; conserva o erro legado estruturado; isola/exibe motivo no hook e destinos V3/V4; amplia as cinco classes PG B1 para opt-in e replay sem efeitos financeiros. A proposta ainda precisa de compilação, montados, testes completos e nova R após autorização. Não altera critério financeiro, fingerprints, travas ou schema. Detalhes em PROPOSTA-P2.md.

P3 registrados: liveness para entrada inválida antes da transação; pendência da formalização perdida no remount e negativa não durável (sem efeito financeiro); prova de operadores limitada ao seam ADMIN; leitura de título de orçamento protegida só pela consultiva dos writers V3; validação de forma no atendimento rápido depois da criação com compensação. Não houve expansão automática do escopo para esses itens.

AEP: tentativa 3/3 esgotada, GOAL002 BLOCKED por gate. Commit de estado oficial: bfded919c70b5dcb3f6325999e9ad3cee5027454. CLI registrou três falhas, removeu .aep-active e imprimiu NEW_SESSION. O ledger anterior foi preservado byte a byte como prefixo; GOAL003 está idêntico. verify e verify --all posteriores passaram. Não existe commit AEP close/DONE, merge de produto ou deploy do candidato. Commit posterior de documentação apenas arquiva esta entrega; a descrição do PR registra seu HEAD exato.

A continuação exige decisão humana para revisão 8 do MESMO GOAL002, limitada ao P2, sem expandir allowlist nem reduzir classe/risco/R. EXECUTION_PROTOCOL §6: “A falha registrada na tentativa 3 esgota o teto e converte o GOAL em BLOCKED”. Não reabrir, reiniciar contador ou criar GOAL substituto automaticamente.

## Pacote imutável e publicação

Pacote funcional: 125 arquivos; pacote-cd69780c81b3.zip, 709745 bytes. ZIP SHA-256 eaaf37ce8ca9442d056e76a6f22d68d79159b102398869a66c3d99f076210349; manifesto SHA-256 4dd6c2ae5a825b754a476c2644aacc179c8b5efcca89684c5cc8d2f717b6dbb5. Todos os arquivos, manifesto e ZIP foram verificados intactos depois da R. Parecer e handoff acompanham o ZIP separadamente para preservar sua selagem.

PR do produto #262 (draft): https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/262 — NÃO MERGEAR. Main continua 60337ff116e831e1e7e13597a4e6622a6df131ed. Deployments atuais de omni-gestao e omni-gestao-pro estão READY/production nesse SHA anterior; o candidato tem somente previews. Canonical permanece omni-gestao-pro.vercel.app. O guard de migrations está intocado e restringe execução a Production + flag explícita + projectID canônico. Nenhuma migration executada por este trabalho.

## Retomada autorizada — ordem necessária

1. Decisão humana explícita para revisão 8; preservar BLOCKED rev7/parecer/pacote e seguir rito de governança separado, sem transportar produto ao PR de plano.
2. Mesma allowlist, C4 ALTO/OpenAI com R Anthropic/humano; atualizar 003 apenas conforme a revisão e conservar dependência, sem iniciá-lo.
3. status/open oficiais após a nova governança e main integrada por merge normal; aplicar/refinar a proposta, sem contornar as travas ou a identidade financeira.
4. Montados de destino/código e isolamento OS/loja, PG B1/replay/fotos, regressões e test_command completo; lint/typecheck/build seguro/verify. Novo commit/SHA e pacote selado.
5. Nova R real completa, com P0=P1=P2=0 e APPROVE no SHA exato. Só depois close oficial separado, PR/checks e merge normal contra main atual.
6. Conferir deployments dos dois projetos e domínio canônico; sem migrations em secundários e sem mutations financeiras reais. Smoke autenticado permanece OWNER_PENDING_AUTH sem sessão autorizada. GOAL003/008 não iniciar.

## Estado Git e governança

- Repositório: C:/Projetos/omni-gestao. Worktree funcional: C:/Projetos/omni-gestao-ops-v4-frg-002. Branch: goal/ops-v4-financeiro-retirada-garantia-002.
- HEAD inicial: f3e3bdf578daa4368a5891bf7fa165584d4c6479. Candidato final: cd69780c81b3bc159cd5f0810daabc98aae06a34, remoto igual e working tree limpa. Evidências produzidas após o congelamento ficam ignoradas em review-rev7 para não mudar o objeto avaliado. Nenhum fonte fica oculto ali.
- Base ratificada/main: 60337ff116e831e1e7e13597a4e6622a6df131ed. Base de regressões: 98ef7172a915713ad177207112f6aff3db9801a1, worktree -002-base e junction node_modules preservados. 2223aa3, 7e45876, 6155b4d e todo o histórico/WIP anterior foram preservados. Root original continua na branch codex/db-migration-reconciliation-001, HEAD 5ae661d, com WIP alheio intocado. Nenhum reset/rebase/force/stash/exclusão.
- PR governança #261: https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/261. Merge normal 60337ff. Revisão 7, executor OpenAI excepcionalmente autorizado para C4 ALTO, R obrigatória de outra família; allowlist/gates/test_command/orçamento 52 preservados. BLOCKED externo anterior 3/3 copiado fielmente para ledger. GOAL 003 só acompanhou plan_rev 7, manteve família/dependência e não iniciou. GOAL 008 não iniciou.
- Integração normal da main no produto: eb9d8514c942673ad2071a8c5d8c905bf9806172.
- Commits funcionais/corretivos: 3027772bfb8fae4a5b6d0ec1e077ed52fe08820e; ec3b5cf7144eb1afac8c2438fb02dd1b84c59605; 3eb769fefa6a49fd5bc4bfbd6d6bf842a3c5d133; b617dcc201e8b73292036836ae461b3d49c961dd; cd69780c81b3bc159cd5f0810daabc98aae06a34. Os três primeiros corretivos/intermediários estão preservados, inclusive a conferência de patch incompleto por finais de linha e falhas de fixtures. Produto de cd69780 é byte a byte idêntico a b617dcc; último commit altera apenas teste/evidências.

## Código e limites

P1-A: classificação de exceções por mensagem/digest liberava a identidade sem prova de que a transação não gravou. Agora toda exceção mantém incerteza. O retorno imediato moderno é CONFIRMADO com prova, RECUSADO_DEFINITIVAMENTE após decisão/recusa duráveis sob serialização, ou INCERTO. Uma leitura vazia não prova rollback. O contrato dos callers server-side legados foi preservado.

P1-B: pendências separadas para imediato/misto permitiam nova chave em outra modalidade após resposta perdida. O envelope único por [storeId,osId] contém modalidade, ID e input completo congelado antes do primeiro await. Persiste no browser e no mesmo commit financeiro, sob advisory por OS. Outra chave/conteúdo/modalidade, formalização a prazo e estorno ficam bloqueados até verificar a original.

Replay autenticado precede elegibilidade, estado atual do caixa e fence de outra confirmação. Reconhecimento positivo exige ID/modalidade/fingerprint originais, auth/loja/permissão, e as mesmas travas; não grava dinheiro. Recusa negativa desfaz todas as escritas da tentativa e persiste tombstone sem expiração, impedindo requisição atrasada de gravar. Conteúdo imediato inclui sessão, centavos por forma, saldo esperado, intenção e observação; misto inclui composição e vencimento/observação.

A V3/V4 exibem Confirmação pendente de verificação e Verificar mesma confirmação. Reenvio equivalente (PIX100 = PIX50+PIX50) usa sempre o input original, inclusive sessão/saldo/intenção; alteração real continua bloqueada. Troca rápida de OS/loja isola resultados tardios. Fechar/reabrir/remount/refresh conserva a identidade; leitura do servidor recupera a pendência mesmo sem localStorage. Persistência inválida ou autorização insuficiente bloqueia e pede conferência autorizada.

Limites: exclusão emVoo só é síncrona no mesmo documento. Storage events sincronizam abas, porém o banco é a autoridade final. Não se promete exclusão por localStorage ou ausência de resultado por timeout. Identidade de teste PG usa seam de autenticação com IDs/nomes distintos; writers, PostgreSQL, travas e contagens são reais. E2E autentica usuário sintético real; não houve teste com credencial produtiva nem dois operadores humanos em produção.

Arquivos principais: lib/operacoes-v3/{pdv-servico-actions,recebimento-misto-service,recebimento-misto-model,elegibilidade-comercial,formalizacao-aprovacao-actions,formalizacao-aprovacao-model,orcamento-actions}.ts; components/operacoes-v3/hooks/use-pdv-servico-v3.ts; pages/PdvServicoV3.tsx e AtendimentoRapidoV3.tsx; components/operacoes-v4-preview/use-v4-preview.ts e parts/{ReceberPagamentoV4,FormalizarAprovacaoV4,stages/OrcamentoDecisaoCluster}.tsx; testes específicos002, regressões allowlisted e E2E002. Relação completa dos 121 caminhos do candidato funcional em candidate-audit-final.json e diff-stat.txt do pacote. Nenhum caminho protegido/global/schema/auth/permissão/CI alterado.

A–E anteriores foram reaproveitados: critério comercial único, recusa de rascunho sobre OS paga, aprovação explícita antes de receber, formalização administrativa atual com escopo/valores revalidados, e forma sem default. Essas partes também fazem parte do objeto da R.

## Validação

Prova vermelha anterior: 11/11 montados falham; PostgreSQL reproduz segunda baixa de 100, dois caixas/movimentos e parcela de 220 após a primeira resposta perdida. Fontes relevantes idênticos a 6155b4d; logs íntegros.

| Suíte | Resultado | Observação |
|---|---|---|
| Específica GOAL 002 | 109/109 | Montados + PG real, locks/barreiras e fotos financeiras |
| Núcleo | 493/493 | 16 arquivos |
| Preview selecionado oficial | 20/20 | Demais excluídos pelo filtro, sem skips novos |
| GOAL 001 | 76/76 | Montados e PG |
| Montados no comando oficial | Fluxo 006: 52; V3: 20; V4: 29; datas: 10 | Todos passaram isoladamente; resultado integral no check final |
| Fluxos 001 / 002 / 003 / 004 / 005 / 006 | 29 / (15 montados + 1 PG) / 4 / 45 / 47 / 70 | Regressões externas, banco QA verificado |
| #234/#238 / #235 / #237 PG | 109 / 1 / 34 | Writers e PostgreSQL reais |
| E2E GOAL 001 / fluxo 006 | 6/6 / 16/16 | Executados em ec3b5cf; escopo posterior de produto só PDV V3 |
| E2E misto | 5/6 | b617dcc, produto atual idêntico; #238 C/D e #234 PASS, falha conhecida #235 |
| E2E datas | 5/6 | Mesma falha da base na mensagem de entrega |

O test_command integral contém 809 Vitest + 9 Playwright (8 cenários + autenticação); resultado oficial final está anexado no início deste handoff. A CLI AEP retém o stdout detalhado dos subprocessos bem-sucedidos e emite resumo PASS/FAIL; as contagens vêm dos conjuntos e logs reais das suítes. Não houve novos skips/fixmes/retries.

Os 109 específicos incluem duas identidades de operador, advisory observado por pg_stat_activity e fotos de título/baixa/caixa/mov/parcela/OS. Split: 100 Pix + 70 Dinheiro + 250 a prazo = 420 gera uma baixa de 170, duas operações de caixa (uma por forma), uma movimentação agregada, título e parcela únicos. Replay e estorno não provocam outra baixa. O E2E #238 C comprova pagamentos/caixa/mov [100,20] e input original.

Typecheck, ESLint dos 44 alterados, build seguro com MIGRATION_SKIPPED, git diff --check, verify e verify --all passaram. Previews de ambos os projetos passaram no SHA cd69780; preview não significa produção/homologação.

Falhas separadas com baseline 98ef717 (ancestral da main 60337; caminhos operacionais/E2E idênticos; seis mudanças independentes em lib/pessoas):

- Full preview: base 321 PASS / 10 FAIL; candidato 325 PASS / os MESMOS 10 FAIL.
- Fluxo 007: 66 PASS / 1 FAIL T56c; falha isolada 3/3 em ambos, fonte/teste idênticos; base também passou 67 uma vez, evidenciando ordenação por timer.
- E2E #235: 5 PASS / 1 FAIL em ambos no mesmo texto do recibo.
- E2E #237: 5 PASS / 1 FAIL em ambos na mensagem de entrega com retirante.

Nenhuma dessas suítes é declarada integralmente verde. Logs/contextos preservados.

Tentativas desta revisão: 1 falhou por foto E2E anterior ao commit, corrigida com route.fetch + abort e contagens; 2 falhou porque o teste montado avançava entre resposta/reconciliação e efeito de saldo. Ambas registradas pela CLI, sem reset; tentativa atual 3/3. O teste final controla as duas promises, valida bloqueio em voo e aguarda o saldo antes da nova digitação. Observações intermediárias, inclusive falhas, preservadas. O .last-run obsoleto do check 2 não foi usado como resultado E2E daquela tentativa.

## Proteções operacionais

Banco exclusivo QA em loopback 127.0.0.1:45708, nomes verificados por SELECT antes de scripts; servidor Next próprio na porta 3071 encerrado pelos helpers. PostgreSQL compartilhado permaneceu ativo e não foi parado. .env local sintético permanece privado/ignorado. Nenhuma migration, credencial administrativa de produção, recebimento/estorno/formalização real ou alteração da OS-2026-00025. Todas as worktrees e o junction preservados.
