# Entrega de pesagem — 21/10/2026

**Núcleo de pesagem isolado; ainda não ligado à venda produtiva.**

Branch: `codex/pesagem-core-isolado`.
Worktree: `C:/Projetos/omni-gestao/.worktrees/pesagem-core-isolado`.
Base observada e confirmada por fetch: `8aed9e1d7c7891fd1e6f53b60da53679be0f1117`.
Implementação: `4c1c6dec2a1e75b42bb11289b77cc569ae6c6ebf`.
O commit seguinte contém somente este handoff.
API, exemplos, precisão, estados e pendências: [README.md](README.md).

## Escopo e coordenação

Paths exclusivos: `lib/pesagem/**`, `services/pesagem/**`, `test/pesagem/**`,
`docs/padaria/pesagem/**`, `.github/workflows/pesagem-isolada.yml`.
Preflight verificou o status desses paths em **106 worktrees**, sem WIP nesses
caminhos e sem falha de leitura na verificação final. A worktree raiz e as
frentes `codex/ramos-cadastros` e `goal/pdv-parity-n5-c-e2e-002` foram apenas
inspecionadas. Não houve checkout/reset/stash/limpeza de trabalho alheio.

Nenhum GOAL presumido de CAD-R2 foi criado. AEP opt-in ausente na raiz e nesta
worktree; não foi executado `open/close` de outra trilha, nem alterado seu
state/ledger/registry. N5-C rev5 continua com seu executor e seus gates próprios.
A sessão **Adaptar configurações e cadastros** é responsável pelo contrato
compartilhado; o mapeamento físico/comercial está no README.

Reservados e preservados integralmente os 16 padrões de N5-C rev5:

```text
e2e/pdv-core.playwright.config.ts
e2e/fixtures/pdv-core.ts
e2e/specs/pdv-core-n5.spec.ts
docs/pdv/PDV_CORE_N5_FINAL_MATRIX_002.md
docs/ai-execution/_evidence/PDV-PARITY-N5-C-E2E-002.md
components/dashboard/vendas/pdv-assistencia-enterprise.tsx
lib/pdv/parity-assistencia-finalize-audit.component.test.ts
components/dashboard/vendas/pdv-classic.tsx
lib/pdv/parity-classic-finalize-audit.component.test.ts
generated/prisma/**
components/dashboard/vendas/pdv-supermercado.tsx
lib/pdv/parity-supermercado-finalize-audit.component.test.ts
components/dashboard/vendas/venda-completa-enterprise.tsx
lib/pdv/parity-venda-completa-finalize-audit.component.test.ts
lib/pdv-pending-post-sale-effects.static.test.ts
lib/pdv/current-main-correction.component.test.ts
```

Também preservados `components/cadastros/**`, `components/configuracoes-v3/**`,
StoreSettings/tipos/provider/endpoints, capabilities compartilhadas,
ProductWriteService/ClientWriteService, StockLedger, persistência de vendas,
contrato de quantidade, Prisma/schema/migrations, `services/hardware-bridge.ts`
e todos os seus consumidores. Zero imports do núcleo na aplicação produtiva.
Diff revisado integralmente, com apenas arquivos novos nos paths exclusivos.

## Validação executada localmente

Node `v24.14.1`; dependências existentes reutilizadas de `../../node_modules`,
sem instalação nem duplicação. Havia aproximadamente 1 GB livre antes da
worktree, e cerca de 886 MB após a implementação. Nenhum build pesado local.

| Comando (prefixo `node ../../node_modules/`) | Resultado |
| --- | --- |
| `vitest/vitest.mjs run --config test/pesagem/vitest.config.mts` | **66/66 PASS**, 3 arquivos: 22 parser/conversão/framing, 29 sessão, 15 transporte |
| `typescript/lib/tsc.js -p test/pesagem/tsconfig.json --noEmit` | PASS, núcleo + transporte + testes/harness |
| `eslint/bin/eslint.js lib/pesagem services/pesagem test/pesagem --no-cache` | PASS, zero diagnósticos |
| `tsx/dist/cli.mjs test/pesagem/harness.ts all` | PASS, oito cenários e reconexão, todos marcados SIMULADO |
| `git diff --cached --check` | PASS |

A primeira tentativa Vitest foi impedida por EPERM no temporário do sandbox,
antes de executar testes. Resolvido usando `TEMP`/`TMP` dentro da pasta própria
`test/pesagem/.artifacts/tmp`. O TypeScript apontou inicialmente incompatibilidade
da exponenciação BigInt com target ES6; corrigida com escala decimal por string,
mantendo o target produtivo. O harness inicialmente exigiu ajuste de async main
para o formato CommonJS do projeto; execução completa posterior passou.

O TypeScript completo é validado pelo workflow **Núcleo de pesagem isolado**,
com Node 24 e cliente Prisma gerado em runner descartável. A worktree local não
tem esse cliente; o schema da raiz é de outra revisão e não foi reutilizado.
Nenhum resultado remoto deve ser interpretado como typecheck completo local.
Consultar o resultado do SHA da branch nos checks do PR. O workflow também
repete os 66 testes, harness, TypeScript focado e lint, sem migrations e com
URLs fictícias locais. Não roda venda, pagamento, estoque ou banco real.

## Integração e limites

Consumir os entrypoints `lib/pesagem/index.ts` e `services/pesagem/index.ts`.
Reconexão/contexto novo exige nova instância e identidade de sessão única.
A frente PDV é responsável pela ligação futura ao Clássico após reconciliar
N5-C. Contexto, permissão, produto, terminal, recursos e estoque fracionado
continuam gates externos ao núcleo. Migrations automáticas continuam preservadas.

Aceite de integração futura: **0,350 kg × R$ 20,00/kg = R$ 7,00**, com venda,
pagamento e baixa de estoque corretos. Isso **não foi comprovado** nesta missão.
Identificar equipamento, protocolo, tara, resolução, estabilidade, sobrecarga e
backlog físico antes de homologar. Etiquetas com preço/peso aguardam formato.
Zero solicitação de porta, conexão com equipamento, alteração de permissões,
secrets, banco produtivo, merge ou deploy executado por esta missão.

```text
NUCLEO_PESAGEM=IMPLEMENTADO_E_TESTADO
TESTES_DE_TRANSPORTE=SIMULADOS
EQUIPAMENTO_REAL=NAO_HOMOLOGADO
PDV_CLASSICO_PRODUTIVO=NAO_ALTERADO
VENDA_FRACIONADA_PRODUTIVA=NAO_ATIVADA_POR_ESTA_MISSAO
CONFIGURACOES_CADASTROS_EM_ANDAMENTO=PRESERVADOS
PRODUCTION_DB_WRITES=0
```
