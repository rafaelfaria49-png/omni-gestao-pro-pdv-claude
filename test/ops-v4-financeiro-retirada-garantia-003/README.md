# Garantias V4 — experiência local

Branch `codex/experiment-ops-v4-garantias`, baseada em `origin/main` `66b3044`.
Financeiro 002 (`d5570e8`) e Datas V4 (`183898e`) foram integrados por merges normais.
Esta experiência não abre/fecha o GOAL 003, não promove AEP, não altera schema e não publica em produção.

## Abrir e testar

Na worktree `codex/experiment-ops-v4-garantias` desta experiência (o launcher também aceita execução por caminho absoluto a partir de outra pasta):

```powershell
node test/ops-v4-financeiro-retirada-garantia-003/local-preview.mjs
```

Abra <http://127.0.0.1:3043/dashboard/operacoes-v4-preview>.
Login sintético: `garantias@qa.test` / `GarantiasLocal2026!`.
Se aparecer a configuração inicial, escolha **Voltar depois**.
Selecione a loja **Loja E2E Garantia 002** e busque **OS-QA-GARANTIAS**.

1. Na etapa **Entrega**, confira Tela 90, Software 30, outra Tela 90 e Transferência de Dados 0 dias. As duas telas são linhas distintas.
2. Use **Ver condições**. Depois **Alterar prazo**, escolha uma tela, informe 180 e um motivo, e salve. Os outros serviços continuam com seus prazos.
3. Confirme a entrega real. A OS sintética já tem uma cortesia autorizada; nenhum recebimento ou cobrança é criado ao emitir o termo.
4. Abra **Imprimir Termo de Garantia** e imprima/reabra. A v1 congela empresa, cliente, aparelho, serviços, textos, início e vencimento.
5. Altere Software de 30 para 60 com motivo. Isso cria um aditivo v2. No documento, selecione v1: ela continua igual à emissão original.
6. Use **Corrigir datas** no registro da entrega, escolha uma data válida anterior, informe motivo e confirme o impacto por serviço. Uma versão de correção é acrescentada; a entrega não se repete.
7. Troque para **OS-QA-LEGADO**: a falta do original é indicada. Informe motivo e use **Reemitir termo legado**. A versão será identificada como reemissão.

Para restaurar somente esses dois cenários sintéticos:

```powershell
node --env-file=.env --import tsx test/ops-v4-financeiro-retirada-garantia-003/qa-seed.ts --reset
```

## Isolamento

O launcher recusa URLs diferentes de `127.0.0.1:55439/ops_v4_frg_qa_garantias`, bem como arquivos de override `.env.local` e `.env.development*`.
O cluster PostgreSQL descartável, logs, screenshots e PID ficam em `.local/`, ignorado pelo Git. `.env`, dependências e Prisma Client gerado também não são versionados.
O servidor usa somente loopback, porta 3043. Não encerra nem reutiliza outros servidores ou bancos.
O primeiro acesso pode compilar rotas sob demanda; não há build de produção.

Para reprovisionar fora desta worktree, use o schema existente no banco descartável acima, gere o Prisma Client local, execute `qa-bootstrap.mjs` da trilha 001 e depois `qa-seed.ts` desta pasta. As credenciais e o segredo de sessão devem ser exclusivos do QA. Não copie ambientes de produção.

## Verificação

Validação experimental em 13/10/2026: typecheck completo aprovado; lint dos arquivos alterados sem erros (um aviso preexistente em `app/actions/operacoes.ts:1433`); 395 testes unitários em 22 arquivos, 62 testes de componentes e 12 testes de PostgreSQL aprovados. Os dois cenários E2E abaixo e a autenticação real passaram, com zero retries e um worker. O termo foi conferido visualmente em 1440, 768 e 390 px, incluindo foco por teclado e retorno ao botão de origem. Nenhum build de produção foi executado. Os logs e screenshots desta sessão estão em `.local/`.

Os testes novos cobrem identidade das linhas, padrões 90/30/0, extensão sem teto comercial, motivo e permissão no servidor, escopo de loja/OS, versões imutáveis, ausência de dados internos, legado, retorno, concorrência e não duplicação.
`vitest.config.ts` monta os componentes reais; `vitest.pg.config.ts` executa os writers reais em PostgreSQL descartável; `playwright.config.ts` usa Credentials real e Edge na prévia local, com zero retries.

```powershell
npm run typecheck
node --env-file=.env node_modules/vitest/vitest.mjs run --config test/ops-v4-financeiro-retirada-garantia-003/vitest.config.ts
$env:OPS_V4_FRG_TEST_DATABASE_URL=$env:DATABASE_URL='postgresql://qa@127.0.0.1:55439/ops_v4_frg_qa_garantias?schema=public'
$env:DIRECT_URL=$env:DATABASE_URL
node --env-file=.env node_modules/vitest/vitest.mjs run --config test/ops-v4-financeiro-retirada-garantia-003/vitest.pg.config.ts
node --env-file=.env node_modules/@playwright/test/cli.js test --config test/ops-v4-financeiro-retirada-garantia-003/playwright.config.ts e2e/specs/ops-v4-financeiro-retirada-garantia-003.spec.ts e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts --retries=0 --workers=1
```

Textos publicados foram preservados numa fonte canônica com fachadas V3. Texto personalizado aparece como pendente de revisão jurídica. Reemissão legada não comprova o conteúdo original nem presume aceite/assinatura. As versões emitidas preservam o conteúdo do documento; alterações futuras do código de apresentação ainda exigem compatibilidade do renderizador.
