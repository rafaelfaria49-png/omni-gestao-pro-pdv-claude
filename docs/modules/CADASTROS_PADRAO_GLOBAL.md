# Padrão global de cadastros — OMNI-CADASTROS-PADRAO-GLOBAL-UX-001

Fonte única das regras de nome, busca, ordenação e duplicidade dos cadastros do
OmniGestão Pro, para todos os ramos (assistência, acessórios, vestuário, padaria,
mercado, variedades). Código: [`lib/cadastros/nome-cadastro.ts`](../../lib/cadastros/nome-cadastro.ts)
(funções puras, usadas no cliente e no servidor) + testes em `nome-cadastro.test.ts`.

## 1. Regras

| Regra | Função | Comportamento |
|---|---|---|
| Limpeza de texto | `limparTextoCadastro` | NFC; remove invisíveis (zero-width, soft hyphen); colapsa espaços, tabs, NBSP e quebras; apara as pontas. Acentos são mantidos. |
| Chave de comparação | `chaveNomeCadastro` | limpeza + sem acento + minúsculas pt-BR. `"  PELÍCULA  3D "` ≡ `"pelicula 3d"`. |
| Capitalização | `padronizarNomeCadastro(v, estilo)` | Só age quando o texto veio **todo** em minúsculas ou **todo** em maiúsculas. Grafia mista é intenção do usuário e é preservada. |
| Gravação | `nomeCadastroParaGravar(v, estilo, atual)` | Na edição, se o texto enviado é o mesmo já gravado (só espaços de diferença), o valor legado fica intacto. Só o que o usuário alterou passa pelo padrão. |
| Ordenação | `compararNomesPtBR` / `ordenarPorNome` | `Intl.Collator("pt-BR", base, numeric)`: ignora caixa/acento; `iPhone 9` antes de `iPhone 11`. |
| Busca local | `correspondeBuscaCadastro` | Sem caixa/acento; todos os termos precisam aparecer em algum campo (`"pelicula iphone"` acha `"Película 3D iPhone 13"`). Telefone/CNPJ também casam só pelos dígitos. |
| Duplicidade | `encontrarNomeDuplicado` | Mesma chave = mesmo nome; ignora o próprio registro na edição. |
| União de listas | `unirNomesCadastro` | Autocomplete: funde grafias equivalentes; a primeira grafia vence; resultado em ordem pt-BR. |
| Mensagens | `mensagemErroCadastro` | Mostra a mensagem real do servidor; quando o Next.js mascara o erro da Server Action em produção, mostra o texto em português do fallback. |

### Estilos de capitalização

| Estilo | Onde | Exemplo |
|---|---|---|
| `pessoa` | Cliente, técnico, contato do fornecedor | `JOÃO DA SILVA` → `João da Silva`; `maria das dores` → `Maria das Dores`; `ANA-MARIA D'ÁVILA` → `Ana-Maria D'Ávila`; numeral romano (`II`) e siglas sem vogal/empresariais em nome vindo em CAIXA ALTA (`PJ`, `JR`, `LTDA`, `ME`, `EPP`) ficam como estão. |
| `rotulo` | Categoria, serviço, tipo de equipamento | `capinhas` → `Capinhas`; `troca de tela` → `Troca de tela`; `CAPINHAS` e `capas iPhone` ficam como vieram. |
| `preservar` | Produto, marca, modelo, fornecedor (nome fantasia/razão social) | Só limpeza de espaços. `iPhone 15 Pro Max`, `LG`, `xiaomi`, `TECH CELL LTDA` nunca são recapitalizados. |

**Nunca passam por capitalização nem limpeza:** SKU, EAN/GTIN, IMEI, código interno, NCM/CEST,
documento, telefone, e-mail. Esses seguem os normalizadores próprios já existentes
(`lib/produto-sku-normalize.ts`, `lib/cadastros/gtin.ts`, `lib/aparelhos/imei.ts`,
`lib/vestuario/catalog-normalize.ts`, `lib/cadastros/client-identity/*`).

## 2. Mapa dos cadastros e onde o padrão foi aplicado

| Cadastro | Gravador (servidor) | Tela | Padrão neste GOAL |
|---|---|---|---|
| Produtos (todos os ramos) | `lib/cadastros/product-write-service.ts` | `CadastrosHub` → `produto-ia.tsx` | Nome/categoria/marca/fornecedor do produto: só limpeza de espaços. Duplicidade forte por SKU/EAN já existia (409) e foi mantida. Combobox de categoria/marca: busca e match exato sem acento; listas unidas por chave. |
| Categorias (produto/serviço/equipamento/geral) | `upsertCategoria` (`app/actions/cadastros.ts`) | Aba Categorias/Marcas, modal de produto, modal de serviço | Estilo `rotulo`; duplicidade sem caixa/acento/espaço por tipo (antes só `insensitive`, que deixava `Películas` × `Peliculas`); renomear para um nome já existente é bloqueado; criar um nome inativo reativa o existente. |
| Marcas | `upsertMarca` | Aba Categorias/Marcas, modal de produto | Estilo `preservar`; mesma regra de duplicidade da categoria. |
| Fornecedores | `upsertFornecedor` | Aba Fornecedores | Nome/razão social `preservar`, contato `pessoa`; duplicidade: mesmo CNPJ, ou mesmo nome sem CNPJs divergentes (filiais com CNPJ próprio continuam possíveis). Antes: sem checagem. |
| Clientes | `lib/cadastros/client-write-service.ts` (único gravador: HUB, PDV rápido, REST, texto livre, importação) | Aba Clientes, `ClienteEditor` | Nome estilo `pessoa`, preservando o legado não alterado. Duplicidade por documento/identidade já era do motor de identidade (CAD-R2-019) e não mudou. Busca da aba: sem acento + dígitos. |
| Técnicos | `upsertTecnico` | Aba Técnicos | Estilo `pessoa`; duplicidade por nome na loja. Antes: sem checagem. |
| Modelos de equipamento (assistência) | `upsertEquipamentoModelo` | Aba Equipamentos | Modelo/marca `preservar`, tipo `rotulo`; duplicidade por marca + modelo. Antes: sem checagem. |
| Serviços da assistência | `upsertServico` | Aba Serviços | Estilo `rotulo`; duplicidade por nome **dentro da categoria** (`Troca de tela` pode existir em Celular e em Tablet). Antes: sem checagem. |
| Grades, cores e variações (vestuário) | `lib/vestuario/catalog-service.ts` | `VestuarioCatalogoPanel` | **Já seguia o padrão** (`cleanLabel` + `labelKey`, com CHECK no banco). Não alterado — é a referência do padrão. |
| Cores, locais e compatibilidades (capinhas/películas) | `lib/compat/*` | HUB Compat | **Já tinha normalizador próprio** (`corLabelKey`, `localNomeKey`) com unicidade no banco. Não alterado. |
| Aparelhos por IMEI | `lib/aparelhos/service.ts` | Aba Aparelhos | Identificador (IMEI) com normalizador próprio; fora do padrão de nome por definição. Não alterado. |
| Produtos de padaria/mercado (KG) | `product-write-service.ts` (mesmo gravador) | Modal de produto | Herdam a limpeza de nome do gravador único; unidade/peso seguem `product-commercial-contract`. |

### UI do HUB (`CadastrosHub.tsx`, `ui-kit.tsx`)

- Busca local de Clientes, Serviços, Fornecedores, Técnicos e Equipamentos: sem acento, por vários termos; telefone/CNPJ por dígitos.
- Listas de Serviços, Fornecedores, Técnicos, Equipamentos e chips de Categorias/Marcas em ordem alfabética pt-BR. Ordenação por coluna de Clientes usa o mesmo collator.
- Pré-checagem de duplicidade no formulário (mesmo critério do servidor) com mensagem que diz qual cadastro já existe e foca o campo; o servidor repete a checagem como defesa.
- `window.alert` substituído por toast (sucesso/erro) em todo o HUB; texto em inglês ("updated") corrigido.
- Formulários de Fornecedor, Técnico, Equipamento e Categoria: 1 coluna no celular, 2 a partir de `sm`.
- `Field` liga o rótulo ao controle (`htmlFor`/`id`) e aceita `required` (marcador + `aria-required`).
- Chips de Categorias/Marcas: edição e inativação por **id** (nomes legados repetidos não se confundem); botão de inativar visível no celular (antes só aparecia no hover) e com `aria-label`; tipos com rótulo legível ("Serviço", "Linha de equipamento").

## 3. Preservação de dados

- Nenhum dado existente é reescrito por migração ou rotina: o padrão só age no que o usuário grava.
- Edição sem mudar o nome mantém a grafia legada (inativar uma categoria, editar telefone de um cliente).
- Duplicidade só é checada quando nome/documento mudam — registros legados já duplicados continuam editáveis.
- Toda checagem é por `storeId` (isolamento entre lojas): o mesmo nome em outra loja nunca conflita.
- Preços, estoque, histórico, compatibilidades e relacionamentos não são tocados.

## 4. Exceções e pendências conhecidas

1. **Busca de produtos no servidor** (`lib/cadastros/produtos-listagem-sql.ts`, `ILIKE`) continua sensível a acento: `pelicula` não acha `Película`. Resolver exige `unaccent` (extensão → migration) ou `translate()` com revisão de índice/plano — fora do escopo sem autorização de migration. A busca local e o autocomplete já são tolerantes.
2. **Duplicidade de nome de produto** não bloqueia: nomes iguais são legítimos (variações, lotes, tamanhos). A identidade forte do produto é SKU/EAN (409 já existente).
3. **Unicidade só na aplicação** para fornecedor, técnico, modelo e serviço: sem constraint no banco (exigiria migration e saneamento prévio dos duplicados legados). Duas gravações simultâneas ainda podem duplicar.
4. **Erro de Server Action mascarado em produção**: a pré-checagem no formulário cobre o caso comum; quando o servidor recusa (corrida), o usuário vê a mensagem genérica em português de `mensagemErroCadastro`.
5. `components/pdv-github-original/**` é cópia arquivada — não recebeu o padrão.
6. Lista de categorias inativas não é exibida na aba; reativar = cadastrar de novo com o mesmo nome (o servidor reativa o existente e a UI informa).

## 5. Evidências de validação (2026-11-23)

- `lib/cadastros/nome-cadastro.test.ts` — regras puras (nomes especiais: acentos decompostos, NBSP, hífen/apóstrofo, romanos, siglas, códigos).
- `app/actions/cadastros.nome-padrao.test.ts` — Server Actions com Prisma em memória: dedup sem acento, reativação de inativo, isolamento por loja e tipo, rename bloqueado, legado preservado ao inativar/editar, filial com CNPJ distinto aceita.
- `lib/cadastros/cadastros-padrao-ux.component.test.ts` — HUB real em jsdom: ordem pt-BR, busca sem acento/por dígitos, duplicidade recusada sem chamar o servidor, toast no lugar de `alert`, campo obrigatório, chips por id.
- Navegador (dev server da worktree, página descartável fora do commit): formulário de fornecedor em 2 colunas no desktop (1280 px) com 12/12 rótulos ligados aos campos e aviso "Informe o nome fantasia do fornecedor."; formulário de categoria em 1 coluna no celular (390 px) sem rolagem horizontal. Sem banco nem sessão: listas vazias; dados reais não foram tocados.

## 6. Auditoria: fotos de produto e captura por QR Code (não implementado neste GOAL)

**Estado atual**

- Fotos: tabela `ProductMedia` (`product_media`: `storeId`, `productId`, `url`, `type`, `source`, `isPrimary`, unique `productId+url`) já existe e é **de produto**, não de ramo. Hoje só é contada (`countProdutoImagens`) e lida pelo resolvedor do WhatsApp; não há upload no cadastro. Storage de arquivos existe só no Contador HUB (`lib/contador/documentos/storage-r2.ts`, R2 + URL assinada, bucket com CORS próprio).
- QR Code: leitor local já existe e é genérico (`lib/cadastros/vcard/qr.ts` + `qr-browser.ts`: jsQR sob demanda + `BarcodeDetector` nativo, câmera só por clique, tracks encerradas). Hoje é usado só pela importação de contato (vCard) de clientes.

**Recomendação para que sejam compartilhados por todos os cadastros aplicáveis**

1. Fotos: um componente `ProdutoFotos` montado no modal de produto único (`produto-ia.tsx`) — que já atende todos os ramos — gravando em `ProductMedia` via Server Action escopada por `storeId`. Variantes de vestuário apontam para o produto-pai (sem tabela nova). Reaproveitar o adaptador R2 do Contador como `lib/storage/` comum (prefixo por loja, CORS do bucket configurado antes — ver incidente 020D).
2. QR/código: extrair de `lib/cadastros/vcard/qr-browser.ts` a parte de câmera/decodificação para `lib/cadastros/captura-codigo/`, devolvendo texto cru; cada cadastro interpreta o conteúdo (vCard → cliente; GTIN/SKU → produto; IMEI → aparelho), sempre passando pelos normalizadores de identificador existentes, nunca pelo padrão de nome.
3. Ambos ficam atrás de capacidade da loja (`store-business-capabilities`) e não dependem de ramo.
