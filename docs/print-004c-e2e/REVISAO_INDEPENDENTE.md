# Revisões independentes — OMNI-PRINT-004C

Revisores: agentes separados, somente leitura (sem editar, sem banco, sem push), com acesso ao diff completo e aos logs.

## Rodada 1 — REQUEST_CHANGES

2 P1 (impressão dupla com dois processos de agente; migrations candidatas dentro de `prisma/migrations`), 4 P2
(relatório transitório bloqueando a impressora; host PowerShell órfão; lease curto no envio; navegador sem rastreio)
e 10 P3. Todos tratados — ver `RELATORIO_FINAL_004C.md` §3.

## Rodada 2 — APPROVE

Sem P0/P1. Confirmou as correções da rodada 1 e os invariantes (venda confirmada apenas; UNKNOWN nunca reenviado;
nenhum aceite apresentado como papel; isolamento por loja; autoridade rederivada no banco; CSRF; credencial do agente;
ESC/POS sem gaveta; gate fechado em produção; PDV inalterado com o recurso desligado).

Achados P2/P3 da rodada 2 e tratamento:

| Achado | Tratamento |
|---|---|
| P2 `reset()` perdia a referência ao host que não morreu | conjunto de hosts "morrendo"; `reset` re-mata e só devolve `true` quando todos saíram |
| P2 despacho enfileirado podia imprimir após o servidor já mostrar "incerto" | servidor envia `leaseRemainingMs`; o agente recusa iniciar envio sem orçamento (NO_EFFECT `TIMEOUT_BEFORE_SUBMIT`) |
| P2 venda fora do contrato (KG/fracionada/limites/pagamento) ficava sem impressão | volta ao diálogo de impressão manual existente (PW10) |
| P3 INITIAL não revalidava cópia do navegador sob o lock | revalidado em `create()` |
| P3 `window.open` após `await` | janela aberta no clique; nada é registrado se o navegador bloquear |
| P3 consulta de tentativa mais nova que o diário | tombstone para a tentativa nova |
| P3 cache do PWA em `/api/print/*` | `NetworkOnly` em `next.config.mjs` |
| P3 teste instável do host | timeouts maiores |
| P3 evidência fraca do kill -9 | teste força o kill durante envio: 11 aceitos + 1 incerto, 12 chamadas, nenhuma venda duas vezes |
| P3 comentário de schema apontando caminho antigo | corrigido |
| P3 corrida de lock obsoleto entre dois processos no mesmo microssegundo; PID reutilizado após reinício; host órfão após SIGKILL do agente | **residual documentado**: improvável (DPAPI introduz segundos de defasagem); recuperação = remover o `.lock` após conferir; matar o host órfão pelo PID persistido fica para o empacotamento do agente (D04/D05) |
| P3 logs de regressão comparados só por contagem | comparados por nome: `evidence/regression-failure-diff-candidate-vs-main.txt` |

Ao final das correções da rodada 2, toda a bateria foi reexecutada (`evidence/battery-summary.json`).

## Rodada 3 (delta após a rodada 2) — APPROVE

Sem P0/P1/P2. Confirmou: a recusa por orçamento acontece antes de qualquer byte (nunca NO_EFFECT indevido); o TOMBSTONE
não libera impressora com tentativa anterior escrevendo; `reset` só declara saída fechada após o host sair; venda
elegível nunca cai em navegador silencioso; regra `NetworkOnly` segura.

P3 aplicados: relatório enviado logo após cada despacho; orçamento inválido (NaN) recusado; janela fechada pelo operador
não registra nada; host que falhou ao iniciar não trava resets; venda fora do contrato volta **exatamente** ao fluxo
anterior (automático → aviso legado; manual → diálogo); testes unitários para recusa por orçamento e TOMBSTONE de
tentativa nova (PW10/PW11 no Playwright). Residual: o orçamento de lease é medido no servidor antes do envio da resposta
(margem de ~15 s mitiga; o efeito possível é só exibir "incerto" por alguns segundos, nunca reenviar).

## Rodada 4 (CI corretivo da PR #327) — APPROVE

Escopo: mocks de `@/lib/operations-store` nos testes `parity-pin-keymap`/`classic-weight-sale-guard` e renomeação
`PrintDelegation.sessionVersion` → `principalSessionVersion`. Sem P0/P1/P2. Confirmou: causa raiz das duas falhas; mocks
não escondem comportamento que esses testes deveriam afirmar (o catálogo tem teste próprio do #325); renomeação neutra no
banco (`migrate diff` vazio, coluna/índice/FKs iguais) e sem consumidor do client Prisma; nada alterado em
`prisma/migrations`, `scripts/platform`, `.github/workflows` ou nas migrations candidatas; nenhum outro workflow passa a
disparar.

| Achado P3 | Tratamento |
|---|---|
| `HASHES.json` desatualizado após os ajustes | manifesto regenerado (inclui os 2 testes do PDV) |
| `typecheck-full.log` sem código de saída | regravado com `exit=0` |
| `main` segue com os mocks desatualizados | relatado (fora do escopo desta PR; correção própria na main) |
| `run-pilot-e2e.mjs` frágil a homônimos dos 4 campos | observação; script do piloto não alterado |
| restante do E2E do piloto nunca rodou no CI | confirmado pela rodada de CI do novo commit |

## Rodada 5 (gates para decisão do proprietário, sobre `8edd892`) — REQUEST_CHANGES → APPROVE

Escopo: `DECISOES_PROPRIETARIO_OMNI_PRINT.md`, `d02-rehearsal.pg.test.ts`, `d02/rollback_print_candidate.sql`, cenários S31–S33,
correção em `core.ts` (claim), roteiro físico e matriz. Primeira passada: **REQUEST_CHANGES** (5 P2, 9 P3). Segunda passada,
após as correções: **APPROVE** (sem P0/P1/P2; 8 P3, tratados abaixo).

| Achado | Tratamento |
|---|---|
| P2 expurgo descrito como exigindo mudança de schema (o schema já permite expurgo em sentido único) | texto corrigido; S33 prova expurgo, recusa de segundo expurgo/restauração/DELETE e dedup preservada |
| P2 documento citava a rodada 5 antes de existir | esta seção registra a rodada com o veredito real |
| P2 proteção contra travar vendas dependia de `PGOPTIONS` | guarda dentro do arquivo (`CUT_GUARD`), ensaiada sem `PGOPTIONS`; endpoint direto Neon (não `-pooler`) e papel da aplicação exigidos |
| P2 ordem com o `migrate deploy` do build | plano com duas pastas, `migrate resolve --applied` de ambas antes do merge, conferência em `_prisma_migrations`, `--rolled-back` no rollback |
| P2 rollback sob carga não ensaiado | medido: `AccessExclusiveLock` nos pais; locks em ordem (`vendas` primeiro), `lock_timeout` 2 s; teste 4 com venda aberta; rollback preferido = desligar o recurso |
| P3 estado parcial, pior caso, chaves/`keyRef`, fallback por bytes, retenção incompleta, D04 (PID/reinício), Preview por branch, S31 sem prova do atraso, robustez do d02 | corrigidos (texto, `run-loop.ps1`, asserção `STARTED`, testes independentes, `searchParams`, porta 5432) |
| P3 (achado na revisão) `claim()` falhava inteiro com chave rotacionada durante envio | **corrigido** em `core.ts`; S32 (falha sem a correção) |
| P3 2ª passada: relatório §7.2 desatualizado; heartbeat/login "não esperam" amplo demais; transação única (ii) não ensaiada; aviso de `migrate dev` na pasta (i); expurgo de `details` apagaria a prova do incerto; redação PW10/PW11; S32/S33 podiam passar sem exercitar o caminho; diretório temporário | corrigidos: §7.2 reescrito; texto restrito a "enquanto aguarda"; ensaio aplica `CUT_II` (01+02 numa transação); aviso registrado; expurgo de `details` só de eventos sem prova; redação ajustada; asserções de lease vigente e linhas afetadas; temp em `beforeAll`/`afterAll` |

## Rodada 6 (D01-A1, reimpressão registrada, sobre `f639248`) — REQUEST_CHANGES → APPROVE

Escopo: `direct-reprint-panel.tsx`, `cupom-nao-fiscal.tsx`, Histórico/Conferência, `browserFallback` com origem REPRINT,
`UNSUPPORTED_DIRECT_PRINT`, cartão de configuração, PW12–PW18, S34. Primeira passada: **REQUEST_CHANGES** (1 P2, 10 P3).
Segunda passada: **APPROVE** (sem P0/P1/P2; 3 P3).

| Achado | Tratamento |
|---|---|
| P2 consentimento da cópia pelo navegador não ficava preso ao risco (duas abas com risco > 0 imprimiam sem nova confirmação) | origem REPRINT exige token assinado (cotação ou reconfirmação do servidor) comparado ao risco atual; S34 e PW15 cobrem duas abas com risco; mutação comprova |
| P3 texto do cartão; motivo térmico; via na fila invisível; limite de bytes em laço; `COMMAND_LIMIT` ambíguo; erro de outra venda; `role`/`aria-live`; acompanhamento de 90 s; gravação ao abrir; consentimento expirado | corrigidos (ressalva KG; `UNCERTAIN_RESULT`; `queuedCopies`; térmica escondida com aviso; `COPIES_LIMIT`; erro oculto e zerado por venda; mensagem só no bloco; "Conferir de novo"; painel começa parado; nova cotação automática) |
| P3 2ª passada: volta ao fluxo antigo sem explicação | corrigido: linha explicando que a venda segue o fluxo atual, sem registro |
| P3 2ª passada: API do PDV aceita `confirm: true` sem token; térmica sem segundo clique | registrados como residuais e **fechados na rodada 7** |

## Rodada 7 (D01-A1: CI, consentimento na origem PDV, confirmação térmica, sobre `7e86fdd`) — APPROVE

Escopo: runner `ubuntu-24.04` nos três jobs com Playwright desta PR; `browserFallback` decidido pelo estado do servidor
(só a 1ª via legítima sem consentimento; `confirm` ignorado); cliente do PDV com token; `confirm-thermal` no painel; S28
adaptado, S35 e PW19 novos. Sem P0/P1/P2.

| Achado P3 | Tratamento |
|---|---|
| confirmação do navegador no PDV dizia "0 via(s)" quando o servidor pede confirmação sem via exposta | texto próprio: venda fora da janela da 1ª via sai como SEGUNDA VIA e fica registrada |
| `pdv-scale-visor` (browser) e `cadastros-cliente-assistido` (validate) seguem em `ubuntu-latest` com Playwright | pendência fora desta PR, registrada em `D01_A1_REIMPRESSAO_REGISTRADA.md` (a #327 dispara o visor) |
| venda antiga sem via sai SEGUNDA VIA também pelo PDV | conservador e coerente; registrado como residual para a homologação física |

## Rodadas 8 e 9 (D02-A, migrations seguras, sobre `1b2912c`) — REQUEST_CHANGES → APPROVE

Escopo: `tools/print-d02/` (recorte, gerador, ferramenta do operador, 3 pastas preparadas, `APLICACAO.json`, testes),
`store-print-links.ts` e a rota `DELETE /api/stores/[id]`, `.gitattributes`, `RUNBOOK_D02.md`, `D02_MIGRATIONS_SEGURAS.md`.

Rodada 8: **REQUEST_CHANGES** (2 P2, 8 P3). Rodada 9: **APPROVE** (sem P0/P1/P2; 2 P3).

| Achado | Tratamento |
|---|---|
| P2 o teste PG novo quebrava o `npm test` sem banco (o corpo do `describe` roda na coleta mesmo pulado) | `template` só é calculado com `PRINT_PG_URL`; sem banco: 1 arquivo pulado, nenhuma falha |
| P2 o roteiro mandava remover `tools/print-d02/migrations` no merge, o que quebraria a guarda, o gerador e a ferramenta | o roteiro manda manter a pasta (as promovidas são comparadas com ela) |
| P3 `--chave=valor` cortava no segundo "=" (contornava a recusa por `pgbouncer=true`) | separa no primeiro "=" |
| P3 várias linhas em `_prisma_migrations` (falha → `--rolled-back` → aplicada) sem ordem definida | ordena por `started_at`; a linha aplicada prevalece; cenário 7 cobre com `resolve` |
| P3 roteiro sem `export` nem sintaxe do PowerShell; rollback sem `-d` | Git Bash com `export` + equivalente PowerShell; rollback com `-d "$D02_DATABASE_URL"` e `status` antes/depois |
| P3 guarda do build fora do CI | workflow novo `omni-print-d02-guard.yml` (`generate --check` + `d02-guard`) |
| P3 janela entre `resolve` e merge não provada | cenário 1: `migrate deploy` com o diretório da `main` responde "No pending migrations" |
| P3 redação da senha incompleta; comentário inexato em `cut.mjs` | `redact()` cobre a forma crua e a codificada; comentário corrigido |
| P3 (rodada 9) workflow não disparava ao alterar só o ensaio | `d02-rehearsal.pg.test.ts` incluído em `paths` |
| P3 (rodada 9) aviso LF→CRLF nos arquivos de evidência | cosmético; checksums de migration têm `eol=lf` próprio |
