# Auditoria PDV Assistência — Serviços Rápidos e Catálogo Real

GOAL: PDV-ASSISTENCIA-SERVICOS-RAPIDOS-AUDIT-001
Modo: auditoria read-only (nenhum código alterado)

## Commit auditado

`79bcca6` (`feat(caixa): adicionar comprovante pos-fechamento`), branch `main`, idêntico a `origin/main` no momento da auditoria.

> Nota: entre a execução da auditoria e a criação deste documento, outro commit de Caixa (`b969d65` — `feat(caixa): adicionar calculadora de dinheiro no fechamento`) foi integrado a `main`/`origin/main`. Isso não afeta os achados abaixo, que são todos relativos ao PDV Assistência / catálogo de serviços, área não tocada por esse commit.

## Estado Git

No momento da auditoria original (commit `79bcca6`):
```
 M components/dashboard/caixa/fechamento-caixa-modal.tsx
 M components/dashboard/caixa/fechamento-pos-fechamento-dialog.tsx
 M lib/caixa-fechamento-resumo.ts
 M next-env.d.ts
?? components/dashboard/caixa/calculadora-dinheiro-caixa.tsx
?? docs/audits/AUDITORIA_OMNI_AGENT_TO_PLATFORM_v01.md
?? docs/audits/AUDITORIA_PDV_TRIO_CODE_AUDIT_001_v01.md
?? e2e/specs/99-temp-manual-check.spec.ts
```
Zero arquivos staged. Branch = `main`. Nenhum arquivo foi alterado por esta auditoria.

No momento da criação deste documento (pré-flight de escrita):
```
## main...origin/main
 M next-env.d.ts
?? docs/audits/AUDITORIA_OMNI_AGENT_TO_PLATFORM_v01.md
?? docs/audits/AUDITORIA_PDV_TRIO_CODE_AUDIT_001_v01.md
?? e2e/specs/99-temp-manual-check.spec.ts
```
`HEAD` (`b969d65`) == `origin/main` (`b969d65`) — sem commits locais não pushados. O WIP de Caixa listado na auditoria original já foi commitado e pushado por outro agente; nenhum desses arquivos foi tocado por este trabalho.

## Causa raiz de Serviços = 0

A aba "Serviços" do PDV Assistência filtra `realCatalog` (derivado exclusivamente da tabela `Produto`) por `category === "Servicos"`. Nenhuma linha real de `Produto` está cadastrada com essa categoria hoje — os serviços reais do negócio estão em uma tabela dedicada (`Servico`), que o PDV Assistência nunca consulta. Não é um bug de renderização: é ausência de dado na fonte que o componente de fato lê.

## Arquivos principais auditados

- `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` (2700 linhas) — componente único e monolítico da tela do PDV Assistência.
- `components/dashboard/vendas/item-avulso-modal.tsx` — modal de item avulso (tecla INSERT).
- `lib/operations-store.tsx` — store que expõe `inventory` (fonte única de catálogo do PDV).
- `app/api/ops/inventory/route.ts` — API que popula `inventory` (`prisma.produto.findMany`, linha 133).
- `app/actions/cadastros.ts` — CRUD real de `Servico` (`listServicos`, `upsertServico`).
- `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` — UI de cadastro de serviços.
- `components/operacoes/lovable/api/servicos.ts` — adapter do Operações HUB legado (v2, Lovable) que consome `listServicos`.
- `lib/operacoes-v3/nova-os-actions.ts` — fluxo real de criação de OS (V3).
- `lib/operacoes/services/garantia-operacional-service.ts` — cálculo de garantia da OS.
- `prisma/schema.prisma` — models `Servico` (linhas 1037-1062) e `OrdemServicoItem` (linhas 712-735).

## Como o PDV Assistência lê produtos hoje

`pdv-assistencia-enterprise.tsx:815-835` monta `realCatalog` (tipo `PdvCatalogProduct`) mapeando 1:1 o array `inventory` vindo de `useOperationsStore()` (linha 788). O próprio código documenta isso:

> `pdv-assistencia-enterprise.tsx:814` — `// Somente itens reais do estoque — única fonte de catálogo no PDV Assistência`

`inventory` vem de `GET /api/ops/inventory` (`lib/operations-store.tsx:556`), que consulta **apenas** `prisma.produto.findMany(...)` (`app/api/ops/inventory/route.ts:133`). Tudo que aparece no PDV Assistência (produtos e "serviços") é linha da tabela `Produto` (`estoque_produtos`).

## Como serviços entram no carrinho hoje

Não existe fonte própria de serviços no PDV Assistência — "serviço" é apenas um **produto com `category === "Servicos"`** dentro do mesmo `realCatalog`:
- `pdv-assistencia-enterprise.tsx:930` — `if (cat === "Servicos") result.push(live)` (dentro de `quickServices`)
- `pdv-assistencia-enterprise.tsx:481` — `entries.filter((e) => e.categoria === "Servicos")`
- `pdv-assistencia-enterprise.tsx:1454` e `:2585` — `product.category !== "Servicos" && product.stock < 999` (a checagem de estoque é pulada quando `category === "Servicos"` — o mecanismo de "serviço sem controle de estoque" já existe, mas depende inteiramente do campo `category` do `Produto`).

Zero ocorrências de import relacionado a `Servico`/Cadastros no arquivo.

As duas únicas formas reais de um serviço entrar no carrinho hoje:
1. Como `Produto` com `category === "Servicos"` (hoje: zero linhas cadastradas assim → aba vazia).
2. Via **Item Avulso** (`item-avulso-modal.tsx`), tecla INSERT: descrição livre, preço manual, custo opcional (`custoUnitario: number | null`, linha 42), sem controle de estoque, sem categoria, sem vínculo a nenhum catálogo — cada venda redigita tudo do zero, sem herdar garantia/termo/checklist.

## Model Servico real existente

`prisma/schema.prisma:1037-1062` define `model Servico` (tabela `servicos`), com campos `name, category, avgTime, cost, price, margin, warrantyDays, terms, status, active`, escopado por `storeId` (default `"loja-1"`, `onDelete: Restrict`).

## CRUD existente em app/actions/cadastros.ts

- `listServicos(storeId)` — `app/actions/cadastros.ts:1602-1620` (`prisma.servico.findMany`)
- `upsertServico(storeId, input)` — `app/actions/cadastros.ts:1622-1674` (`prisma.servico.create`/`update`)
- Também usado para métricas no dashboard de Cadastros (`app/actions/cadastros.ts:101-103`, `db.servico.count`).

Consumidores atuais desse CRUD: `CadastrosHub.tsx` (tela de cadastro) e `components/operacoes/lovable/api/servicos.ts` (Operações HUB legado, apenas leitura — escrita deliberadamente bloqueada, ver linhas 20-24 do adapter: "Escrita ainda não disponível neste HUB... Use Cadastros"). **Nenhum dos dois é o PDV Assistência real**, nem o motor de OS atual (`lib/operacoes-v3/`).

## Por que Produto.category="Servicos" é caminho ruim

`Servico` e `Produto.category === "Servicos"` são dois modelos paralelos e incompatíveis. Se alguém simplesmente cadastrar `Produto`s com `category = "Servicos"` para "resolver" a aba vazia, cria-se um catálogo duplicado e desalinhado do catálogo real usado por Cadastros/Operações legado — dívida técnica adicional, não correção. Além disso:
- `Produto` não tem `warrantyDays`/`terms`/checklist — qualquer garantia/termo teria que ser reinventado fora do model já preparado para isso.
- `OrdemServicoItem.produtoId` referencia só `Produto` (`onDelete: Restrict`), então um "serviço-fake" cadastrado como `Produto` poderia acabar contaminando o vínculo de peças da OS.

## Respostas às 20 perguntas da auditoria

1. **Onde fica o componente principal do PDV Assistência?** `components/dashboard/vendas/pdv-assistencia-enterprise.tsx`.
2. **Como ele lista produtos?** Via `realCatalog`, derivado 1:1 de `inventory` (`useOperationsStore()`), que vem de `GET /api/ops/inventory` → `prisma.produto.findMany`.
3. **Como ele lista serviços?** Filtrando o mesmo `realCatalog` por `category === "Servicos"` — não há fonte separada.
4. **Por que a aba Serviços aparece 0?** Porque nenhuma linha de `Produto` tem `category === "Servicos"` cadastrada; os serviços reais estão em outra tabela (`Servico`) nunca consultada pelo PDV.
5. **Serviços vêm de uma API real, mock, localStorage ou cadastro inexistente?** Vêm de cadastro real (model `Servico` com CRUD funcional), mas esse cadastro não está conectado ao PDV — o PDV lê `Produto`, não `Servico`.
6. **Existe tabela/modelo de Serviço no Prisma?** Sim, `model Servico` (`prisma/schema.prisma:1037-1062`).
7. **Existe diferença entre produto e serviço no carrinho?** Só via flag de categoria textual (`category === "Servicos"`), que afeta a checagem de estoque — não há tipo estruturado `kind: "produto" | "servico"`.
8. **Serviço pode ser vendido sem controlar estoque?** Sim, o mecanismo já existe (`product.category !== "Servicos" && product.stock < 999` pula a checagem), mas depende do campo `category` de `Produto`.
9. **Serviço pode ter preço manual no PDV?** Não pelo catálogo real (preço fixo do item); só via Item Avulso, que tem preço 100% livre mas não é ligado a nenhum catálogo.
10. **Serviço pode ter custo opcional?** No model `Servico`, `cost` já existe e não é obrigatório; no Item Avulso, `custoUnitario: number | null` também já suporta opcional. Nenhum dos dois está conectado ao catálogo real do PDV.
11. **Serviço pode carregar garantia padrão?** O model `Servico` tem `warrantyDays`, mas nada no fluxo de venda hoje lê esse campo.
12. **Serviço pode carregar termo de garantia padrão?** O model `Servico` tem `terms`, mas idem — não é lido pelo fluxo de venda.
13. **Serviço pode carregar checklist padrão?** Não — `Servico` não tem campo de checklist hoje.
14. **Serviço pode aparecer na OS?** `OrdemServicoItem` tem `tipo: "peca" | "servico"`, mas sem FK para `Servico` — é `descricao` (texto livre) + `precoUnitario` (snapshot).
15. **Existe relação entre serviço e OS/Operações V4?** Não uma relação real: no fluxo V3 (`lib/operacoes-v3/nova-os-actions.ts:122-130`), o `servicoId` gerado é sintético (`` `nova-${it.id}` ``), não um ID real da tabela `servicos`.
16. **Existe cadastro de serviços em Cadastros HUB?** Sim, `CadastrosHub.tsx` usa `listServicos`/`upsertServico`.
17. **Esse cadastro está conectado ao PDV Assistência?** Não. Só está conectado ao próprio Cadastros HUB e, em modo leitura, ao Operações HUB legado (Lovable v2).
18. **Quais arquivos teriam que mudar para conectar serviços reais?** `pdv-assistencia-enterprise.tsx` (mesclar `Servico` em `realCatalog`), `lib/pdv-catalog.ts` (tipo `PdvCatalogProduct` precisa diferenciar origem), possivelmente uma nova rota `GET /api/ops/servicos` ou reuso direto da Server Action `listServicos`.
19. **Quais arquivos teriam que mudar para serviços rápidos com valor manual?** `pdv-assistencia-enterprise.tsx` (override de preço por linha do carrinho, hoje só existe em `item-avulso-modal.tsx`), possivelmente `CartLine`/`addItem` (linhas 1404-1431).
20. **Quais arquivos teriam que mudar para garantia/termo automático?** `prisma/schema.prisma` (novo campo de checklist em `Servico`, FK `servicoId` em `OrdemServicoItem` — mudança em tabela core, exige autorização explícita), `app/actions/cadastros.ts` (editar novos campos), `lib/operacoes/services/garantia-operacional-service.ts` (ler preset do serviço).

**Sobre presets por ramo**: não existe hoje nenhum conceito de "ramo de negócio" (celular, informática, games, eletrônicos, balcão rápido, películas/acessórios) no schema. `Servico.category` é string livre sem taxonomia fixa. `AppLojaSettings.perfilLoja` (`prisma/schema.prisma:1079-1085`, hoje só `"assistencia"`) é o campo mais próximo de "perfil de loja", mas não é usado para presets de catálogo.

## Gaps por fase

**Fase 1 — conectar serviços reais/presets**
- Expor `listServicos` para o client do PDV Assistência ou criar rota `GET /api/ops/servicos`.
- Estender `realCatalog` (`pdv-assistencia-enterprise.tsx:815`) para mesclar `Servico` (sem estoque, `stock` sintético) junto de `Produto`, mantendo a aba "Serviços" já existente (`tab === "servicos"`, linha 855).
- Adaptar `PdvCatalogProduct` (`lib/pdv-catalog.ts`) para diferenciar origem (`kind: "produto" | "servico"`) em vez de depender só da string `category === "Servicos"`.

**Fase 2 — valor manual + custo opcional**
- Adicionar override de preço por linha do carrinho para itens de serviço (hoje só existe no Item Avulso), reaproveitando o padrão de `custoUnitario: number | null` já validado ali.
- Reaproveitar `Servico.cost`/`Servico.price` como valores-sugestão editáveis no PDV, não fixos.

**Fase 3 — serviço como template operacional**
- Adicionar ao model `Servico`: checklist padrão (`checklistPadrao Json?`), peças sugeridas, tempo médio (padronizar `avgTime`, hoje string livre), observação padrão.
- Ajustar `upsertServico` e a UI de Cadastros para editar esses novos campos.

**Fase 4 — integração com OS**
- Adicionar `servicoId String?` em `OrdemServicoItem` (migração Prisma — tabela core, requer aprovação explícita do usuário) para vincular item de OS ao catálogo real.
- Ao adicionar um "serviço" à OS, pré-preencher garantia/termo/checklist a partir de `Servico`, com override manual permitido (auditável em `payload.historico[]`).
- Conectar `lib/operacoes/services/garantia-operacional-service.ts` para ler o preset de garantia do serviço quando disponível.

**Fase 5 — serviços pré-configurados por ramo**
- Criar seeds/presets de `Servico` por `perfilLoja` (reaproveitando `AppLojaSettings.perfilLoja` como o "ramo") ativáveis no onboarding/configuração da loja, sem alterar o schema core além do já necessário na Fase 3.

## Riscos

- Catálogo duplicado se `Produto.category="Servicos"` for usado como atalho em vez de conectar `Servico` de fato.
- Qualquer vínculo `Servico` ↔ `OrdemServicoItem` exige migração em tabela core de Operações — proibido sem autorização explícita conforme `docs/skills/rules/CORE_RULES.md`.
- `Servico.storeId` tem `onDelete: Restrict` e default `"loja-1"` — multi-loja precisa ser respeitado ao expandir uso.
- O Operações HUB legado (`components/operacoes/lovable`) roda isolado com dados mock/local por convenção do projeto (Lovable Hub Pattern) — qualquer expansão real deve preferir o caminho V3/V4 (`lib/operacoes-v3`), evitando reforçar o hub legado.
- `pdv-assistencia-enterprise.tsx` já tem ~2700 linhas — qualquer adição de fonte de dados (Servico) deve ser cirúrgica, sem refactor amplo, conforme CORE_RULES.md.

## Próximos GOALs recomendados

1. **GOAL Fase 1** — Conectar `Servico` real ao `realCatalog` do PDV Assistência (leitura apenas, sem alterar schema).
2. **GOAL Fase 2** — Permitir valor manual e custo opcional para itens de serviço no carrinho do PDV Assistência.
3. **GOAL Fase 3** — Estender `Servico` com checklist padrão, peças sugeridas e observação padrão (migração aditiva).
4. **GOAL Fase 4** — Vincular `Servico` a `OrdemServicoItem` via FK e propagar garantia/termo/checklist automaticamente na criação de OS (requer autorização explícita para mexer em tabela core).
5. **GOAL Fase 5** — Presets de serviços por ramo de negócio, usando `AppLojaSettings.perfilLoja` como base.
