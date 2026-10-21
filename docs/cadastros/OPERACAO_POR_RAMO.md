# Cadastros por ramo — validação integrada e correções operacionais

Missão descritiva de fechamento operacional dos Cadastros por ramo, sobre a main
publicada após a PR #295. Não cria nem renumera CAD-R2/GOAL; não reabre #294/#295.
AEP opt-in inativo na worktree; nenhum state, ledger ou registry alterado.

## Prova integrada (job `e2e-authenticated` do workflow `Ramos e Cadastros`)

`scripts/cadastros/run-ramos-e2e-isolated.mjs` + `e2e/cadastros-ramos/**`:

- Build de produção (`npm run build`, `MIGRATION_SKIPPED`) servido por `next start`
  em `127.0.0.1`, contra o PostgreSQL descartável do próprio job.
- Banco: guard de variáveis existente + identidade positiva e vacuidade lidas do
  servidor por catálogo (`current_database`, `current_user`, postmaster
  recém-iniciado, zero tabelas) **antes** do primeiro comando de escrita, inclusive
  o DDL. Schema inalterado materializado com `db push`; sem migrations.
- Usuários e lojas sintéticos (`*.invalid`), senha aleatória por execução, hash
  bcrypt como no `seed-admin`. A senha não passa por `fill()` (não entra no call
  log), trace fica desligado e o runner redige qualquer ocorrência nos artifacts.
- Login NextAuth Credentials real pela tela `/login`. Sem rota de bypass, cookie
  forjado, usuário mágico ou mudança de autorização no código publicável.
- Caminho de sucesso sem mocks: configuração, Server Actions, ProductWriteService,
  autenticação e persistência reais. O banco é só **lido** para conferir o que a
  interface gravou. Injeções de falha (rede abortada no save, PUT retido para
  provar que o sucesso só aparece após a confirmação) são explícitas e separadas.
- Service worker bloqueado (o PWA não serve `/api` do cache durante a prova).

Cenários (11, todos PASS no head publicado):

| Arquivo | Cobertura |
| --- | --- |
| `01-padaria` | Login → Configurações → Geral → Padaria salva só após o servidor → reload → Cadastros HUB pelo menu → apresentação da padaria, sem editor duplicado, atalho oficial → produto unitário (falha de rede preserva digitação; SKU duplicado recusado pelo servidor; dupla submissão = 1 registro) → listagem, busca, reabertura, edição → encerrar sessão → novo login → dados conferidos. Produto por peso: saldo inicial incompatível recusado; KG com saldo 0 e aviso de preparação; reabrir não reinterpreta unidade; editar campo comum preserva a declaração; nenhum lançamento de estoque |
| `02-lojas-mistas` | Variedades com peso + grade sem mudar ramo nem ativar assistência/acessórios, layout do PDV preservado; campos ocultos (reabrir sem salvar não grava; patch de preço preserva vínculos, `cadastroRecursos` com `false`, garantia, fiscal e chave não enviada); Assistência legada com recursos e vínculos preservados e sem gravar configuração; Acessórios com compatibilidade sem assistência e alteração de uma aplicação sem enviar a outra |
| `03-permissoes-multiloja` | Operador sem Configurações: redirecionado, PUT 403, outra loja 403 em settings/busca/escrita, produto de outra loja = 404 sem oráculo, cadastro na própria loja funciona; papel sem Cadastros recusado no servidor; GET atrasado de A entregue após a troca não hidrata B; listagem/busca de B sem produtos de A; mudar ramo não altera layout do PDV, preços, saldos, metadata, `updatedAt` nem movimentações |
| `04-responsivo` | 390 e 320 px: editor de ramo e ficha de produto sem overflow, sem gravar |

Homologação isolada com dados sintéticos **não equivale** a cadastro real feito
na loja da cliente.

## Correções

| Origem | Correção | Regressão |
| --- | --- | --- |
| E2E (defeito real) | `CadastrosHubIsolated` não montava o `Toaster` do sonner: o operador não via sucesso nem erro de gravação. Montado o Toaster do kit do próprio HUB | E2E: toasts de sucesso/erro exigidos em todas as gravações |
| P3-1 #295 | Ramo desconhecido gravado fora do contrato derrubava o resolvedor (`PRESETS[branch].includes`). `configuredBusinessBranch` trata valor fora do contrato como loja sem ramo (legado) em resolvedor, apresentação, `useStoreBusiness`, provider/adapter de perfil e runtime de capabilities | `store-business-capabilities.test`, `perfil-loja/route.test` |
| P3-2 #295 | Toggle trocava override em objeto por booleano e marcar/desmarcar gravava escolha explícita. Agora troca só `enabled` e voltar ao estado salvo desfaz a escolha | `business-catalog.component.test` |
| N1 #295 | PUT de settings validava capabilities que o merge descartaria (snapshot com seções irmãs), recusando patch legítimo. Valida só o patch dedicado (e backfill); merge e validação usam o mesmo predicado `isDedicatedCapabilitiesPatch` | `stores/[id]/settings/route.test` |
| N3 #295 + settings | Erro de banco virava `VALIDATION_ERROR` com mensagem crua em `upsertProduto`; GET/PUT de settings devolviam `e.message`. Agora `SAVE_ERROR`/500 com mensagem genérica | `cadastros.product-interactive.test`, `settings/route.test` |
| N4 #295 | Importação de catálogo abortava sem identificar o item. 409/500 informam SKU e unidade (origem/destino) — só após autorizar as duas lojas — e 500 não expõe detalhes internos | `import-catalog/route.canonical-014.test` |
| Revisão independente | PUT de settings aceitava `backfill` não booleano: a validação exigia `=== true` e a persistência usava `!!backfill`, deixando passar capabilities inválidas. Agora só booleano | `settings/route.test` |
| Revisão independente | `upsertProduto` pré-checava o saldo antes do cadastral e relia depois: devolução concorrente entre as leituras levava produto por peso ao ajuste de saldo. A releitura reconfirma a declaração antes do ledger | `cadastros.product-interactive.test` |

Cada regressão nova falhou antes da correção correspondente. Validação de
autoridade e contrato preservada; nenhum payload inválido passou a ser aceito.

## Encaminhamentos (fora do escopo)

- P3-3 (#295): guard de peso também atinge `/api/ops/sync-legacy-vendas` — motor de venda.
- P3-4 (#295): comentário do 409 de peso em `venda-persist` — rota de venda/PDV.
- N2 (#295): REST PATCH com o mesmo saldo continua recusando produto por peso
  (409, fail-closed). A tentativa de igualar ao cadastro foi revertida: sem checagem
  sob o lock do StockLedger (fora do escopo), divergência de depósito ou devolução
  concorrente poderia movimentar saldo.
- Server Actions de Cadastros chamadas antes de a loja ativa resolver registram
  `Loja não selecionada` no log do servidor (sem efeito visível na jornada).
- Loja legada exibe o ramo derivado do perfil como selecionado; para gravar o mesmo
  ramo explicitamente é preciso trocar e voltar (UX, sem perda de dado).

## Fronteiras preservadas

Sem alteração em PDVs, N5-C (16 caminhos), `lib/pesagem/**`, `services/pesagem/**`,
`services/hardware-bridge.ts`, StockLedger, contrato de quantidade, finalização,
fiscal, financeiro, Prisma/schema/migrations e voz CAD-R2-021. Peso e grade
continuam preparação (`operational: false`).
