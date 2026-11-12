# Relatório final — OMNI-PRINT-004C-INTEGRACAO-END-TO-END-001

Candidato de impressão direta não fiscal (PDV Clássico → servidor → agente local Windows → fila do Windows), **desligado
por padrão** e impossível de ligar em produção sem um commit revisado de aprovação (`APPROVED_RELEASE = null`).
Nenhuma impressão física foi feita (sem impressora). Nenhuma escrita, migration ou deploy em produção.

## 1. Base e escopo

- Base: `origin/main` `a07e067` (inclui #324 e #325) + checkpoint 004B reaplicado (`df41d90`, conteúdo de `a261014`).
- Worktree própria: `C:\Projetos\omni-gestao-print-e2e-004c`, branch `claude/omni-print-004c-e2e-001`. Checkpoint 004B,
  WIP 004C anterior (`omni-gestao-print-integration-004c`) e demais worktrees/sessões não foram alterados.

## 2. Arquitetura entregue

| Camada | Arquivos | O que faz |
|---|---|---|
| Ledger (servidor) | `lib/printing/direct/core.ts`, `sale.ts`, `renderer.ts`, `authority.ts`, `codec.ts`, `db.ts` | T0 prepare → T1 create (+T2 lease curto para o agente) → T3 claim/start (lease renovado, preso à instância do agente) → T4 relatório do agente. Snapshot MVCC da venda **confirmada**, ESC/POS 58/80 gerado no servidor, conteúdo selado AES-256-GCM, slot INITIAL único, segunda via com risco divulgado, destino serializado, UNKNOWN nunca reenviado. |
| Administração/agente | `admin.ts`, `http.ts`, `app/api/print/direct/**`, `app/api/print/agent/**` | Pareamento por código de uso único (60 bits, 10 min), token `opa1` guardado só como SHA-256, vínculo terminal → computador → fila (58/80), restrição opcional ao navegador do caixa, heartbeat/inventário, claim, report. |
| Gate | `activation.ts` | OFF por padrão; produção exige `APPROVED_RELEASE` em código + env + chaves; laboratório só fora de `NODE_ENV=production`. |
| PDV Clássico | `pdv-classic.tsx`, `pdv-direct-print-feedback.tsx`, `client.ts`, `use-direct-print.ts`, `pdv-impressao-config.ts` (`impressaoDireta`, padrão `false`) | Só aciona com venda CONFIRMADA (`serverId`) + loja com impressão direta + terminal vinculado + servidor liberado. Sem `window.print`/diálogo; navegador só por clique, registrado e marcado. Com o recurso desligado o fluxo atual é idêntico (PW7). |
| Configuração | `ImpressaoDiretaAgenteCard.tsx`, `PdvSection.tsx` | Pareamento, vínculos, revogação; oculto enquanto o gate estiver fechado. |
| Agente local | `tools/omni-print-agent/*` | Só saída HTTPS; diário durável por `sendKey`; trava por diário; host PowerShell persistente (winspool RAW); validação ESC/POS própria; credencial DPAPI. |
| Schema candidato | `tools/print-004c-e2e/candidate-migrations/*` + modelos `Print*` em `prisma/schema.prisma` | Fora de `prisma/migrations` (P1-2). |

## 3. Correções da revisão independente

| Achado | Correção | Prova |
|---|---|---|
| P1-1 impressão dupla com dois agentes | tentativa presa à instância (`lease_owner` + nova época na T3); reentrega e consultas só para a mesma instância; trava `journal.jsonl.lock`; id de instância persistente | S25; `two-agents.pg.test.ts`: 2 processos reais, perdas de resposta, kill -9 + reinício, 3º processo recusado — 3 execuções, 12/12 vendas, **0 duplicatas** (`evidence/p1-1-two-processes.jsonl`) |
| P1-2 migrations em `prisma/migrations` | movidas para pasta de laboratório com ordem, hashes, variante futura `CONCURRENTLY` e roteiro | paridade Prisma vazia nas 2 composições; `index-strategy.pg.test.ts`: índice comum trava vendas (lock_timeout), `CONCURRENTLY` não trava e termina válido |
| P2-1 relatório transitório bloqueava a impressora | só erros permanentes encerram o relatório; consulta do servidor reabre o reenvio | S29 (404/409/503 transitórios → via concluída, impressora liberada); unit |
| P2-2 host PowerShell órfão/rejeições cruzadas | estado por processo; `reset` espera a morte real; saída só é declarada fechada após confirmar | `spooler-windows.test.ts` (host falso: sem órfão, host novo atende); host real no Windows |
| P2-3 lease curto no envio lento | lease renovado para `sendLeaseMs` (60 s) na T3; risco mudado na T3 → `RISK_CHANGED`; UI continua acompanhando incerto | S29 (envio de 1,5 s > lease de 0,8 s termina aceito; RISK_CHANGED) |
| P2-4 navegador sem rastreio/marca | navegador passa pelo servidor: evento no ledger, cancela vias térmicas seguras, exige confirmação e marca SEGUNDA VIA quando já pode haver cópia, HTML escapado no servidor | S28, PW8, PW9 |
| P3-1 linha interrompida no diário | termina a linha rasgada antes de novos registros | unit |
| P3-2 falha transitória do status | mantém o último estado conhecido | código + PW7 |
| P3-3 resposta de venda antiga | guarda de geração em todas as ações; "Atualizar situação" relê o ledger | código + PW |
| P3-4 vínculo servidor-side | INITIAL só da venda do próprio terminal e até 30 min; vínculo opcionalmente restrito ao navegador autorizado (hash do deviceId) | S30 |
| P3-5 vias da loja | `viasCupom` (limitado a 2, D03) | código |
| P3-6 motivo enganoso | `TERMINAL_UNAVAILABLE` → "terminal ou impressora alterado" | S22 |
| P3-7 consentimento honrado | converge no job existente mesmo após nova cotação | S13 |
| P3-8 erro do host = "nada enviado" | erro do host no envio = incerto (AFTER) | unit host falso |
| P3-9 cartão visível com gate fechado | cartão oculto | código |
| P3-10 teste instável | timeout explícito | unit |

Não aplicável / limitado: a restrição por navegador usa um identificador do `localStorage` — evita uso acidental ou
remoto por outro navegador, não um usuário mal-intencionado com acesso físico ao mesmo computador. Cópias acima de 2
vias aguardam D03.

## 4. Segurança

- **Isolamento:** toda operação reautoriza no banco (usuário ativo, senha, `sessionVersion`, loja, módulo, papel); jobs,
  vínculos, destinos e provas escopados por loja e instalação (S04, S15, S22).
- **CSRF/abuso:** mutações exigem `Origin` igual à origem e JSON; rotas do agente recusam `Origin`/cookies; rate limit
  por principal; corpo ≤ 16 KiB; campos desconhecidos recusados (S15, S18).
- **SSRF/comandos arbitrários:** o navegador nunca envia bytes, host, porta ou fila; bytes são gerados no servidor;
  allow-list ESC/POS no servidor e no agente (sem gaveta, sem DLE/GS ( ) (S18, S19, unit).
- **XSS:** texto da venda saneado; HTML do navegador escapado e sem script (S28, PW8).
- **Credenciais:** token do agente só como SHA-256 no banco, comparação em tempo constante, DPAPI no caixa; chaves de
  conteúdo/assinatura só por ambiente (D03).
- **Legado:** `/api/print/raw` segue restrito à autoridade de plataforma; STORE recebe 403 sem abrir socket.
- **Higiene de fonte:** nenhum caractere de controle/bidi literal nos arquivos novos (`source-hygiene.mjs`).

## 5. Gates que continuam fechados

D01 (contrato comum A4/legado), D02 (schema produtivo), D03 (limites/retenção/chaves — B17, B18, B19), D04 (transporte
real), D05 (hardware), G-AUTH logout global (I12). Ver `MATRIZ_80.md`.

## 6. Resultados (execução final, após as correções das revisões 1, 2 e 3)

| Etapa | Resultado |
|---|---|
| Gerador de migrations (`--check`) e higiene de fonte | PASS |
| Unitários + agente + host PowerShell real (sem impressora) | 31/31 |
| Cenários PostgreSQL 17 descartável (S01–S30) | 30/30 |
| Regressão do núcleo sintético 004B sobre o schema estendido | 3/3 |
| Dois processos reais do agente (P1-1) | PASS — 12 vendas, 12 chamadas ao spooler, kill -9 durante envio: 11 aceitos + 1 incerto, **nenhuma venda duas vezes** |
| Estratégia do índice UNIQUE em `vendas` | 2/2 |
| Composição futura (`CONCURRENTLY`) + paridade Prisma | PASS / diff vazio |
| Playwright PDV Clássico real (PW1–PW11) | 11/11 |
| Typecheck completo (`tsc --noEmit`, heap 4 GB) | PASS, 0 erros (`evidence/typecheck-full.log`) |
| ESLint dos arquivos alterados | 0 erros (6 avisos pré-existentes em PDV/Configurações) |
| Testes existentes de PDV/Configurações | falhas = subconjunto das da `main` `a07e067` no mesmo ambiente (Node 26 sem `localStorage` + checkout CRLF): 215 vs 216, diff por nome em `evidence/regression-failure-diff-candidate-vs-main.txt` |
| Matriz de 80 casos | 52 PASS_REAL_SOFTWARE · 13 PASS_SIMULATED_TRANSPORT · 6 BLOCKED_HUMAN_GATE · 9 DEFERRED_PHYSICAL_HARDWARE · 0 FAIL |
| Build de produção | local inviável (≈600 MB livres no C:; build precisa ≈1,5 GB) → CI do GitHub (workflow platform-pilot: typecheck + build sem autoridade de migration + E2E do piloto) |

Detalhes: `evidence/battery-summary.json`, `MATRIZ_80.md`, `REVISAO_INDEPENDENTE.md`, hashes em `evidence/HASHES.json`.

## 7. CI corretivo da PR #327 (sobre `6c12d6c`)

O CI de `6c12d6c` passou em Ramos e Cadastros (build, E2E, PostgreSQL), no `validate` do piloto (typecheck + build sem
autoridade de migration) e nos previews Vercel. Duas falhas, diagnosticadas contra a `main` `a07e067`:

| Falha | Causa raiz | Origem | Correção | Prova |
|---|---|---|---|---|
| Visor de peso / validate: 39 testes, `watchCatalogSync is not a function` | o #325 (main) passou a chamar `checkCatalog()`/`watchCatalogSync()` ao montar o PDV Clássico; os mocks de `@/lib/operations-store` em `parity-pin-keymap` e `classic-weight-sale-guard` não têm essas funções | **pré-existente na main**: arquivos de teste idênticos aos da `a07e067`; o workflow é filtrado por caminho e não rodou no #325 — esta PR o disparou ao tocar `PdvSection.tsx` | mocks ganham `checkCatalog`/`watchCatalogSync` estáveis e sem efeito (compatibilidade; nenhum teste removido ou afrouxado) | `ci-327/main-tests-on-candidate.log` (testes da main: 39 falhas, mesmo erro); `ci-327/visor-validate.log` (comando do workflow: 49 arquivos, 877/877); ESLint 0 erros; `track verify --all` sem divergências; `git diff --check` limpo |
| Piloto / authenticated: `PILOT_SCHEMA_BASELINE_MISMATCH` | `run-pilot-e2e.mjs` deriva o schema anterior removendo a **única** linha `sessionVersion`; o modelo `PrintDelegation` (004B) tinha uma segunda | **regressão desta PR** | campo Prisma renomeado para `principalSessionVersion` com `@map("session_version")`: coluna, índice e FKs inalterados; SQL candidato intocado; nenhum consumidor do client Prisma | `ci-327/pilot-schema-derivation.log` (candidato 1/1/1/1; `6c12d6c` tinha 2); `migrate diff` entre os schemas = vazio; `ci-327/pilot-sim.log` (db push do schema derivado + migration do piloto + diff banco→schema vazio, em PG descartável) |

Reexecução após os ajustes: bateria completa (`battery-summary.json`) toda PASS — unitários/agente 31/31, PG 30/30,
regressão 004B 3/3, dois processos PASS (12 vendas, 0 duplicatas), índice 2/2, layout futuro PASS, Playwright 11/11;
typecheck completo `exit=0`. Localmente os testes jsdom rodam com `--no-experimental-webstorage` (Node 26 local; o CI usa
Node 24). Revisão independente da rodada: APPROVE (`REVISAO_INDEPENDENTE.md`, rodada 4).

Remanescente fora do escopo: a `main` continua com os mocks desatualizados — qualquer PR que dispare o workflow do visor
cai na mesma falha até a correção chegar lá.

O CI de `9069dca` passou inteiro (10/10, incluindo o E2E autenticado do piloto). A correção dos mocks chegou à `main`
pelo #328 (`8cbd551`, conteúdo idêntico), o que encerra o remanescente acima.

### 7.1 Merge da `main` `37acc3b` (#326, sync offline do PDV)

Conflito único em `next.config.mjs`: as duas frentes acrescentaram rotas à regra `NetworkOnly`; mantidas ambas
(`/api/print/*` desta PR + `by-client-sale-id`/`venda-persist/v2` do #326). `pdv-classic.tsx` mesclou sem conflito; a
impressão direta continua exigindo `serverId`, que o #326 só preenche com a venda confirmada no servidor. Pós-merge:
typecheck `exit=0`; ESLint 0 erros; `track verify --all` sem divergências; vitest dos conjuntos do visor, PDV, sync
offline (#326) e impressão direta: 1869 passam, 10 falham em 2 testes estáticos (`fechamento-calculadora-modal`,
`pdv-scan-autoclear`) que falham igual na `main` `37acc3b` limpa e não estão em nenhum workflow. A bateria PG/Playwright
não foi reexecutada (nenhum arquivo da impressão mudou no merge); o build fica com o CI.

### 7.2 Preparação dos gates para decisão do proprietário (GOAL OMNI-PRINT-004C-RELEASE-GATES-001, sobre `8edd892`)

Documento de decisão: `DECISOES_PROPRIETARIO_OMNI_PRINT.md` (D01–D05 e G-AUTH, opção recomendada pronta para aprovação). Nenhum
gate foi aprovado; `APPROVED_RELEASE` segue `null`; nada foi aplicado, configurado ou publicado em produção.

- **D02:** ensaio `d02-rehearsal.pg.test.ts` (5/5, `evidence/release-gates/d02-rehearsal.log`) e `d02/rollback_print_candidate.sql`.
  - As FKs de 01-futura/02 bloqueiam `vendas`/`stores`/`admin_users`/`pdv_terminais` até o COMMIT. Os arquivos candidatos
    (inalterados) não têm `lock_timeout`: uma venda aberta enfileira as seguintes (provado).
  - O recorte recomendado (ii) leva a guarda **dentro do arquivo** (`CUT_GUARD`: `lock_timeout` 2 s + locks pai no início,
    `vendas` primeiro). Desiste inteiro em ~2 s, sem segurar heartbeat/login enquanto aguarda (provado).
  - O rollback exige `AccessExclusiveLock` nas tabelas pai (medido no PostgreSQL 17). Agora pega os locks em ordem e desiste
    inteiro sob carga. Recomendação: rollback = desligar o recurso; remover tabelas só com a loja fechada.
  - O build de produção roda `prisma migrate deploy` sob a autoridade de migrations, por isso o plano registra as migrations
    com `migrate resolve --applied` antes do merge.
- **Correção de servidor (D03):** com a chave de conteúdo trocada durante um envio, o `claim` do agente falhava inteiro por até
  60 s. Agora a reentrega dessa tentativa é pulada (fica incerta, nunca reenviada) em `lib/printing/direct/core.ts`. Cenário
  S32 (falha sem a correção, verificado por mutação).
- **D03:** cenário S33 prova o expurgo de conteúdo em sentido único já suportado pelo schema e que a identidade anti-duplicata
  sobrevive ao expurgo.
- **G-AUTH:** cenário S31 (ACK atrasado do agente após revogação da sessão: registrado, sem reenvio, sessão antiga 401).
- **Regressão após integrar a main (#326) e após as correções:** bateria completa reexecutada — gerador PASS, higiene PASS,
  unitários/agente 31/31, cenários PostgreSQL 33/33, regressão 004B 3/3, dois processos PASS, índice 2/2, ensaio D02 5/5,
  layout futuro PASS, Playwright PDV Clássico 11/11; typecheck `exit=0`; ESLint 0 erros. CI do head `8edd892`: 10/10.
- Matriz de 80: classificações inalteradas (6 BLOCKED_HUMAN_GATE, 9 DEFERRED_PHYSICAL_HARDWARE); evidência de I12/B17–B19
  atualizada. Roteiro físico ganhou critérios de parada e registro de execução (todas as linhas NÃO EXECUTADO).
- Revisão independente: rodada 5 (`REVISAO_INDEPENDENTE.md`) — REQUEST_CHANGES (5 P2) → corrigido → APPROVE; P3 tratados.

## 8. Finalização integral D05 (2026-11-08)

Correções do núcleo em `055d785` (agente `JOURNAL_MISSING`, log sem mensagem crua, aviso de vias acima do limite, PW20). CI da #327 em `055d785`: 6/6 workflows success. Pacote do agente: `e974ca03…bc77`. Estado consolidado e gates: `FINALIZACAO_INTEGRAL_D05.md`.
