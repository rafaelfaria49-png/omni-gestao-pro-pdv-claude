# Cadastros — Categoria e Marca como cadastros controlados (autocomplete + criar rápido)

> Data: 25 Mai 2026 — Sessão: profissionalização de Categoria/Marca no cadastro de produtos.

## Objetivo

No modal **Novo/Editar Produto** em `/dashboard/cadastros-v2`, **Categoria** e **Marca** eram inputs de texto livre, gerando cadastros bagunçados ("Apple" / "apple" / "APPLE " separados), atrapalhando busca, filtros e marketplace. O objetivo desta entrega é:

- transformar os dois campos em **autocomplete/select** com opção de **criar novo na hora**;
- evitar duplicatas óbvias (case + espaços);
- **preservar** produtos existentes e strings legadas (importadores);
- **não** introduzir NCM/tributação automática nesta fase;
- manter compatibilidade visual nos 6 temas (Light / Soft Ice / Midnight / Black / Quantum Violet / Coffee Gold).

## Estado anterior (auditoria rápida)

- `Produto.category: String?` e `Produto.brand: String` — armazenados como texto bruto.
- **Já existiam** os modelos `CategoriaCadastro` e `MarcaCadastro` no schema com `@@unique([storeId, type, name])` e Server Actions completas (`listCategorias`, `upsertCategoria`, `listMarcas`, `upsertMarca`), usadas apenas pelo painel "Categorias / Marcas" do Cadastros HUB.
- O modal de produto (`produto-ia.tsx`) usava `<Input ref=categoriaRef>` / `<Input ref=marcaRef>` desconectados desse dicionário.
- Search/filtros e importadores (`smart-sheet-import`, `importador-avancado/persistidor`) escrevem direto em `Produto.brand`/`Produto.category` como string — não podem ser quebrados.

## Decisão de arquitetura

**Solução backward-compatible, sem alterar schema:**

- `Produto.category` e `Produto.brand` continuam **string** (campos atuais preservados → importadores e queries existentes intactos).
- `CategoriaCadastro` / `MarcaCadastro` viram o **dicionário** consultado pelo autocomplete.
- Ao salvar, gravamos o **nome canônico** (string) em Produto — sem FK nova, sem migration.
- O autocomplete une **dicionário + valores já em uso** em produtos (cobre lojas legadas que importaram milhares de SKUs antes da feature).
- Dedup case-insensitive feito no servidor antes de inserir nova entrada no dicionário (impede `Apple`/`apple` duplicados via UI).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `app/actions/cadastros.ts` | (1) `upsertCategoria` e `upsertMarca` agora **dedupam por nome case-insensitive** dentro de `(storeId, type)` antes de criar: se já existe → retorna o registro existente (reativando se inativo). Tipo de retorno expandido para `{ id, name }`. (2) Novo Server Action **`listCategoriasMarcasUsadasEmProduto(storeId)`** → `{ categorias: string[]; marcas: string[] }` via `prisma.produto.findMany distinct` em `category`/`brand` (degrada para `[]` se Prisma indisponível). |
| `components/cadastros/lovable/components/cadastros/produto-ia.tsx` | (1) Novo componente local **`CategoriaMarcaCombobox`** — input com popover, busca incremental case-insensitive, marca opção exata com `Check`, mostra **"+ Criar 'X'"** quando não há match. Teclado: Enter cria/seleciona, Esc fecha, ↓ abre. Texto livre permitido no `onBlur` (compat). Apenas tokens semânticos (`bg-popover`, `border-border`, `bg-accent`, `text-primary`, `border-input`) → funciona nos 6 temas sem regra adicional. (2) `categoriaRef` / `marcaRef` substituídos por **state**. (3) `useEffect` carrega `listCategorias` (filtra `type ∈ {produto, geral} && active`) + `listMarcas` (`active`) + `listCategoriasMarcasUsadasEmProduto` ao abrir o modal e mescla via map case-insensitive (dicionário tem precedência sobre legado). (4) `createCategoria` / `createMarca` locais chamam `upsertCategoria(type:"produto")` / `upsertMarca`, capturam o nome canônico retornado e atualizam a lista do combobox. (5) Salvar consome `categoria.trim()` / `marca.trim()` do state. |

## Funcionalidades entregues

- ✅ Selecionar **categoria existente** num popover com busca incremental.
- ✅ Selecionar **marca existente** no mesmo padrão.
- ✅ **"+ Criar 'X'"** dentro do fluxo do produto, sem sair do modal — grava em `CategoriaCadastro` (type=`produto`) e `MarcaCadastro` (type=`""`).
- ✅ Dedup case-insensitive: digitar `apple` quando já existe `Apple` → seleciona o existente; tentar criar duplicata cai no caminho de dedup do servidor (não cria + retorna canônico).
- ✅ Compatibilidade com strings legadas: valores já gravados em produtos aparecem no dropdown mesmo sem entrada no dicionário (vindos de importação).
- ✅ Edição: produtos antigos abrem com o valor pré-selecionado no autocomplete (sem reset).
- ✅ Texto livre tolerado no `onBlur` → produto pode ser salvo mesmo se o operador digitar algo fora do dicionário (não bloqueia operação).
- ✅ Visual nos 6 temas: só tokens semânticos (sem `bg-blue-…`/cor hardcoded).

## Restrições respeitadas

- ❌ Não alterado: PDV, caixa, vendas, financeiro, multi-terminais, auth/proxy.
- ❌ Sem mudança de schema Prisma (sem `db push`, sem migration).
- ❌ NCM/tributação automática **não** implementados (escopo da próxima fase).
- ❌ Nenhum produto apagado; importadores intactos.
- ✅ `storeId` propagado em todas as chamadas (multi-loja preservado).

## Validação

- **TypeScript:** `npx tsc --noEmit` → **0 erros**.
- **Build:** `npm run build` → ✓ Compiled successfully (2.2 min, todas as rotas compilaram).
- **Git status:** `working tree clean` no encerramento (mudanças foram absorvidas no commit `1423759` — pelo usuário/host; conteúdo de Categoria/Marca verificado em `HEAD`).

## Pendências / riscos restantes

- Painel **"Categorias / Marcas"** do Cadastros HUB segue usando `CategoriaCadastro`/`MarcaCadastro` diretamente — agora a UX do modal de produto também alimenta esses cadastros, então usuários acabarão criando entradas pelo modal **sem passar** pelo painel. Sem problema funcional (ambos os pontos de entrada gravam no mesmo registro), mas o painel não tem botão "sincronizar valores legados" → fica para próxima fase, se a equipe quiser uma rotina única que promova strings legadas para o dicionário.
- **NCM / Tributação:** **não** entregue nesta fase (estava fora do escopo do goal).
- A coluna `Produto.category`/`Produto.brand` continua sendo a fonte de leitura em `listProdutos`, search PDV (`pdv-product-search`), filtros e relatórios. **Não há FK** entre produto e dicionário — se um nome for renomeado em `CategoriaCadastro`/`MarcaCadastro`, os produtos antigos seguem com o nome anterior gravado em string. Isso é **intencional** para manter compat e evitar UPDATE em massa; documentado para que ninguém suponha sincronização automática.
- **CadastrosHub.tsx** (painel de categorias/marcas) usa `await upsertCategoria(…)` sem desestruturar o retorno — a expansão do tipo de retorno para `{id, name}` é **superset compatível** (nenhuma chamada existente quebra).

## Docs

- `docs/ai/CURRENT_STATUS.md` **não** foi atualizado nesta sessão: a mudança é melhoria de UX/cadastros, não mudança de "real vs mock" de módulo. Se preferir registrar, sugiro acrescentar uma linha curta em "Concluído" como `Cadastros — Categoria e Marca via autocomplete (25/05/2026)` apontando para este relatório.
