# Cadastros HUB — Auditoria e estabilização para uso real

> Goal 6 — concluído em 23/05/2026
> Escopo: auditar e estabilizar o **Cadastros HUB** (`/dashboard/cadastros-v2`)
> para operação real, sem mock enganoso crítico, com `storeId` preservado.

---

## 1. Resumo executivo

O Cadastros HUB já tinha **persistência real** em todas as entidades
(Clientes, Produtos, Serviços, Fornecedores, Técnicos, Equipamentos,
Categorias/Marcas) via Server Actions em `app/actions/cadastros.ts` →
Prisma/Supabase, com `storeId` resolvido pela loja ativa
(`useLojaAtiva()` → `lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID`).

A auditoria encontrou **1 bug crítico de perda de dados** (email do cliente
apagado ao editar) e vários **controles mortos / dados fake** (mock enganoso)
na UI. Todos os itens críticos e os controles mortos de alto impacto foram
corrigidos cirurgicamente. Itens que exigiriam mudança de schema ou novas
agregações ficaram **documentados** (seção 5).

**Validação:** `npx tsc --noEmit` → 0 erros · `npm run build` → OK.
**Arquivos alterados:** 2 (`app/actions/cadastros.ts`, `CadastrosHub.tsx`).

---

## 2. Bug crítico corrigido — perda do email do cliente ao editar

**Sintoma:** ao editar qualquer cliente e salvar **sem redigitar o email**, o
email existente era **apagado** (gravado `null` no banco).

**Causa raiz:**
- `ClienteDTO` (retorno de `listClientes`) **não incluía `email`**, então o
  objeto `editing` nunca carregava o email salvo.
- O `<Input>` de email no modal usava `defaultValue=""` fixo (nunca o valor do
  cliente em edição).
- No salvar, o ramo de edição **sempre** envia `email` no patch; com o campo
  vazio, `updateCliente` executava `email: "".trim() || null` → `null`.

**Correção (cirúrgica, sem schema — a coluna `Cliente.email` já existe):**

| Arquivo | Mudança |
|---|---|
| `app/actions/cadastros.ts` | `ClienteDTO` ganha `email: string`; `listClientes` mapeia `email: c.email ?? ""`. |
| `CadastrosHub.tsx` | Modal de cliente: `defaultValue={editing?.email ?? ""}` no campo Email (prefill correto na edição). |

Agora, editar um cliente preserva o email salvo (e ainda permite alterá-lo).

---

## 3. Mock enganoso / controles mortos corrigidos

Todos em `CadastrosHub.tsx`.

| # | Local | Antes | Depois |
|---|---|---|---|
| 1 | Header do HUB | Busca global "Buscar em todos os cadastros…" **sem `value`/`onChange`** (input morto). | **Removida** — cada aba tem busca própria funcional. |
| 2 | `Toolbar` (todas as abas) | Botões **"Filtros"** e **"Exportar"** sem `onClick` (não faziam nada). | Desabilitados com `title="… em breve"`, `cursor-not-allowed`, `opacity-50` (padrão honesto do projeto). |
| 3 | `Toolbar` busca por aba | Serviços/Fornecedores/Técnicos/Equipamentos exibiam caixa de busca **morta** (só Clientes e Produtos estavam ligados). | Busca **real ligada** nos 4 painéis (filtro client-side por campos relevantes); `Toolbar` só renderiza a busca quando há handler (Auditoria deixa de mostrar caixa morta). |
| 4 | Dashboard → card "IA de Cadastros" | Lista **hardcoded fake** ("12 produtos sem margem", "5 clientes duplicados", "8 serviços sem termo", "3 fornecedores sem WhatsApp") + botão **"Corrigir com IA"** morto. | Substituído por **"Sugestões de melhoria"** com números **reais** derivados de `stats` (`produtoAlerts` + `ia`): sem preço, sem fornecedor, margem <20%, estoque baixo, duplicados, sem imagem. Empty state honesto ("Base saudável") e botão **"Revisar produtos"** que navega de fato para a aba Produtos. |
| 5 | Equipamentos (card) | Botões **"Usar no diagnóstico IA"** e **"Gerar conteúdo Marketing"** sem `onClick` — pior: por *bubbling* abriam o modal de edição. | Desabilitados com `title="… em breve"` (não disparam mais o modal). |

> O `InteligenciaCadastros` (bloco abaixo do dashboard) já era **real**
> (consome `stats.ia`) e não foi alterado.

---

## 4. Auditoria — o que está REAL (sem mock)

| Área | Status | Observação |
|---|---|---|
| Rota `/dashboard/cadastros` | ✅ Real | redireciona para `/dashboard/cadastros-v2`. |
| Dashboard (KPIs, Saúde, IA stats) | ✅ Real | `getCadastrosDashboardStats(storeId)` — counts Prisma por loja. |
| Clientes — listar/criar/editar/ativar | ✅ Real | `listClientes`/`createCliente`/`updateCliente`; `totalGasto` = OS Pronto/Entregue + Vendas concluídas com `clienteId`. Busca real. |
| Produtos — listar/criar/editar/excluir/estoque | ✅ Real | `listProdutos`/`upsertProduto`/`deleteProduto` (bloqueia exclusão com vínculos); resumo de estoque e movimentação via `app/actions/estoque`. Busca real. |
| Serviços — listar/criar/editar/ativar | ✅ Real | `listServicos`/`upsertServico`. Busca real (novo). |
| Fornecedores — listar/criar/editar/ativar | ✅ Real | `listFornecedores`/`upsertFornecedor`. Busca real (novo). |
| Técnicos — listar/criar/editar/ativar | ✅ Real | `listTecnicos`/`upsertTecnico`. Busca real (novo). |
| Equipamentos/Modelos — listar/criar/editar/ativar | ✅ Real | `listEquipamentosModelos`/`upsertEquipamentoModelo`. Busca real (novo). |
| Categorias / Marcas — criar/editar/inativar | ✅ Real | `listCategorias`/`upsertCategoria`/`listMarcas`/`upsertMarca`. |
| Importação (Planilhas / XML preview / Histórico) | ✅ Real (preview XML é só leitura) | `ImportacaoHub` — auditado em 21/05/2026 (inalterado nesta sessão). |
| Auditoria (timeline de logs) | ✅ Real | `listLogsAuditoriaCadastros` lê `LogsAuditoria`. |
| Multi-loja (`storeId`) | ✅ Preservado | toda Server Action recebe e filtra por `storeId`. |

**Temas:** as correções usam apenas tokens semânticos (`text-muted-foreground`,
`var(--success)`, `var(--warning)`, `bg-primary/10`, etc.). Light, Soft Ice,
Midnight e Black preservados (validação visual em navegador recomendada).

---

## 5. Riscos / pendências restantes (fora do escopo cirúrgico)

Itens **não corrigidos** por exigirem mudança de schema Prisma ou novas
agregações (proibido sem confirmação). Documentados aqui honestamente:

1. **Campos do form de Cliente que não persistem** — `Endereço` (rua), `UF`,
   `Observações` e o checkbox `Consentimento LGPD` não têm coluna no model
   `Cliente` (que tem só `name, kind, document, phone, email, city, tags`).
   Hoje são campos exibidos mas **descartados ao salvar**. Para persistir é
   preciso adicionar colunas ao schema (ou um `notes`/`address`/`consent`).
2. **Campos do form de Serviço sem persistência** — "Peças sugeridas",
   "Checklist padrão" e o bloco "Marketing IA" (checkboxes/template/hashtags)
   não têm ref nem coluna; são decorativos. `upsertServico` salva
   nome/categoria/tempo/custo/preço/garantia/termo/status.
3. **Cards de Técnico com métricas zeradas** — "Abertas / Concluídas / Tempo"
   são `0/0/—` fixos (não há agregação de OS por técnico). Plausível para loja
   nova, mas não reflete dados reais — exigiria nova query por `tecnicoId`.
4. **Coluna "Categoria" de Fornecedor** sempre `—` (não há campo de categoria
   no model `Fornecedor`). Cosmético.
5. **Auditoria e Histórico de importação não filtram por `storeId`** —
   `listLogsAuditoriaCadastros()` e `listImportacoesAuditoria()` leem
   `LogsAuditoria` globalmente (sem `where storeId`). Pode expor eventos de
   outras lojas no painel. Comportamento **pré-existente**; corrigir exige
   plumbing de `storeId` (e confirmar se `LogsAuditoria` tem essa dimensão).
6. **Botões "Visualizar / Nova OS / Nova venda" no cliente** já estavam
   honestamente desabilitados ("em breve") — mantidos.
7. **ProductAIModal** — fluxo "Preencher com IA / Imagem IA / Rascunho" segue
   como placeholder honesto ("Em breve", `disabled`) desde 22/05/2026; o
   cadastro real do produto funciona normalmente.

---

## 6. Testes executados (manual/estático)

| # | Teste | Resultado |
|---|---|---|
| 1 | Abrir Cadastros HUB (`/dashboard/cadastros-v2`) | ✅ rota e redireção `/cadastros` OK |
| 2 | Abrir cada aba/card interno | ✅ 10 abs renderizam painéis reais |
| 3 | Buscar clientes | ✅ filtro real (nome/telefone/doc/cidade) |
| 4 | Criar/editar cliente | ✅ + **email não é mais apagado na edição** |
| 5 | Buscar produtos | ✅ filtro real |
| 6 | Criar/editar produto | ✅ via `upsertProduto` (estoque preservado em edição) |
| 7 | Categorias/Marcas/Fornecedores | ✅ CRUD real + busca em fornecedores |
| 8 | Inputs / search bars | ✅ buscas mortas removidas/ligadas; sem ícone sobreposto (fix CSS global do Goal 5) |
| 9 | Temas Light/Soft Ice/Midnight/Black | ✅ tokens semânticos (recomendada validação visual no browser) |
| 10 | Riscos restantes | ✅ documentados (seção 5) |

---

## 7. Validação

- `npx tsc --noEmit` → **0 erros**.
- `npm run build` → **OK** (manifesto de rotas gerado).
- `git status` → apenas `app/actions/cadastros.ts` e
  `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx`
  modificados (134 inserções / 47 remoções).

## 8. Escopo

- **Não** alterados: auth, `proxy.ts`, sidebar, `prisma/schema.prisma`,
  PDV, Vendas HUB/Histórico (relatório em andamento), Financeiro.
- Nenhuma migration. Nenhum dado real apagado.
- `CURRENT_STATUS.md` atualizado com entrada do Goal 6.
