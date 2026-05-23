# CRM / Clientes HUB — Auditoria e estabilização para uso real

> Goal 8 — concluído em 23/05/2026 · Modelo: Claude Opus 4.7
> Escopo: auditar o **CRM / Clientes HUB** (`/dashboard/clientes`) — listagem,
> detalhe, histórico de compras/OS, total gasto, timeline, integrações
> Venda→Cliente e OS→Cliente, busca/filtros, contatos, multi-loja — e
> consolidar para uso real, sem mock crítico.

---

## 1. Resumo executivo

O CRM `/dashboard/clientes` é uma SPA Lovable-style autônoma (≈2.235 linhas,
`ClientesPageClient.tsx`) com listagem rica, drawer de cadastro/edição com 5
abas (Principal, Contatos, Endereço, Financeiro, Operacional), drawer de perfil
com 3 abas (Histórico, Ficha, Timeline) e exclusão protegida. A persistência
passa por `/api/clientes` (lista + POST) e `/api/clientes/[id]` (detalhe + PATCH
+ DELETE), tudo **storeId-scoped** via `x-assistec-loja-id`.

A auditoria encontrou **1 bug de consistência crítico** (total gasto não
agregado), **1 métrica falsa** (ticket médio com fallback 380,00) e **1 bug de
contraste de tema** (caixas de erro com vermelhos hardcoded ilegíveis no Light/
Soft Ice). Todos corrigidos cirurgicamente. Histórico (OS + Vendas) e timeline
do perfil já eram reais via relações Prisma — não precisaram de mudança.

**Validação:** `npx tsc --noEmit` → 0 erros · `npm run build` → OK.
**Arquivos alterados (deste goal):** 3 (+71 / −6).

---

## 2. Bug crítico corrigido — Total Gasto não agregado (inconsistência)

**Sintoma:** o CRM mostrava `Total Gasto` na coluna e `Total Consumido` no perfil
vindos da **coluna estática `Cliente.totalSpent`** (preenchida apenas em import
GestaoClick — nunca atualizada por vendas/OS no app). Resultado: um cliente com
5 vendas e 2 OS listadas no histórico do perfil podia exibir "Total Consumido
R$ 0,00" — o cabeçalho dizendo zero enquanto a lista abaixo somava centenas.
Também afetava o KPI "Ticket Médio" (calculado sobre `r.totalSpent`).

Pior: o **Cadastros HUB** (Goal 6) já mostra o total **agregado real**
(`listClientes` agrega `OrdemServico Pronto/Entregue` + `Venda concluida` por
`clienteId`, com fallback ao estático). Logo o mesmo cliente exibia totais
diferentes em telas diferentes.

**Causa raiz:** `/api/clientes` (GET lista) e `/api/clientes/[id]` (GET detalhe)
retornavam `Cliente.totalSpent` cru, sem agregação.

**Correção (espelhando o padrão do Cadastros):**

| Arquivo | Mudança |
|---|---|
| `app/api/clientes/route.ts` | Após o `findMany`, dois `groupBy` paralelos (`ordemServico` filtrando `status ∈ {Pronto, Entregue}` + `venda` filtrando `status:"concluida"`) somando por `clienteId`, scoped por `storeId`. Mapa `totalPorCliente` substitui `totalSpent` por cliente; fallback à coluna estática para quem não tem OS/Venda no app. Falha do `groupBy` → log + fallback (não quebra a lista). |
| `app/api/clientes/[id]/route.ts` | Após o `findFirst`, dois `aggregate` paralelos (não limitados aos 15 últimos do `include`) somando OS+Vendas do cliente. Se houver ao menos uma OS/Venda qualificada, o `totalSpent` retornado é a soma real; senão preserva o estático. Falha → log + fallback. |

Agora o "Total Consumido" do perfil bate com a soma das compras+OS listadas no
histórico, e o "Total Gasto" da lista é o mesmo do Cadastros HUB (consistência
entre módulos).

> Decisão de escopo: **não** mexi no schema (`Cliente.totalSpent` permanece como
> coluna legacy preenchida pelo import). Optei por **agregar em tempo de leitura**
> — mesma estratégia já validada no Cadastros HUB — em vez de adicionar gatilhos
> de write em todos os fluxos de PDV/OS (escopo grande, exigiria migração de
> dados históricos). Recomendação futura: jogar fora a coluna `totalSpent` quando
> não houver mais consumidores que dependem do valor importado.

---

## 3. Métrica falsa removida — Ticket Médio com fallback R$ 380,00

`ClientesPageClient.tsx` (cálculo de `kpis`):

```ts
const spent = rows.map((r) => r.totalSpent || 0).filter((s) => s > 0)
const avgSpent = spent.length > 0 ? ... : 380.00   // ← fake
```

Em uma loja nova (ou após reset), `spent.length === 0` exibia o card "Ticket
Médio: R$ 380,00" como se fosse real. Corrigido para `0`. Com o fix da §2, o
ticket médio agora reflete a média real do total gasto agregado por cliente.

---

## 4. Bug de tema corrigido — caixas de erro ilegíveis no Light/Soft Ice

Duas caixas (`listError` na tabela, `formError` no drawer) usavam:

```
border border-red-700/30 bg-red-950/20 ... text-red-200
```

`bg-red-950/20` é um vermelho-muito-escuro a 20% de opacidade; `text-red-200` é
um vermelho-quase-branco. No **Light/Soft Ice** (fundo claro) o resultado é uma
caixa quase invisível com texto de baixíssimo contraste — mensagens de erro
inutilizadas. Funcionava bem só em Midnight/Black.

Trocado por tokens semânticos `destructive`:
`border-destructive/30 bg-destructive/10 text-destructive`. Os 4 temas
(Light/Soft Ice/Midnight/Black) passam a renderizar a mesma severidade com
contraste correto.

---

## 5. Auditoria — o que está REAL (sem mock)

| Área | Status |
|---|---|
| Rota `/dashboard/clientes` (sidebar "Clientes") | ✅ Real (`Suspense` + skeleton de loading próprio). |
| Lista de clientes (`GET /api/clientes?q=`) | ✅ Real — busca server-side por `name/phone/document/city` (insensitive), `storeId` no header, take 200, ordenação por `createdAt desc`. |
| Filtros locais (PF/PJ, Ativo/Inativo, VIP, Inadimplente, Cidade) | ✅ Reais — derivam de `r.tags` (JSON estruturado) e `r.kind/active/city`. |
| KPIs (Total, Ativos, Novos 30d, Inadimplentes, Ticket Médio) | ✅ Reais — agregados de `rows`. Ticket médio agora honesto (sem fallback fake). |
| Criar/editar cliente (`POST/PATCH /api/clientes`) | ✅ Reais — `requireAdmin` gate, `storeId` obrigatório, validação `isValidPhoneBr`. Tags estruturadas (`labels[], rg_ie, birthDate, gender, whatsapp, phoneSecondary, address{}, financial{}, operational{}`) persistidas em `Cliente.tags` (JSON). |
| ViaCEP autocompletar endereço | ✅ Real (API pública `viacep.com.br`, best-effort). |
| Excluir cliente | ✅ Real — `AlertDialog` com confirmação. |
| Drawer de perfil — histórico de OS | ✅ Real — `cliente.ordensServico` (relação Prisma, últimas 15 desc) com nº, equipamento, defeito, valor, status. |
| Drawer de perfil — histórico de Vendas | ✅ Real — `cliente.vendas` (relação Prisma, últimas 15 desc) com `pedidoId`, data, total, status. |
| Drawer de perfil — Total Consumido | ✅ Real **(corrigido neste goal)** — soma OS Pronto/Entregue + Vendas concluídas. |
| Drawer de perfil — Ficha (Contato/Endereço/Financeiro/Operacional) | ✅ Real — lê `tags` estruturado, com fallbacks honestos quando o sub-bloco não existe. |
| Drawer de perfil — Timeline | ✅ Real — 3 eventos derivados de campos reais (`lastPurchaseAt`, primeira OS, `createdAt`). |
| Ações por cliente (Editar, Nova OS, Iniciar Venda PDV, WhatsApp) | ✅ Reais — links com `?clienteId=…` para `/dashboard/os` e `/dashboard/pdv`; WhatsApp via `wa.me/55…`. |
| Multi-loja (`storeId`) | ✅ Preservado em 100% das chamadas (`ASSISTEC_LOJA_HEADER`). |
| Loading / Empty states | ✅ Reais (`LoadingState`, `EmptyState`, `Skeleton` no `loading.tsx`). |

**Integrações Venda→Cliente e OS→Cliente:** já materializadas pelos goals
anteriores (Vendas Goal 5 — `Venda.clienteId` agora populado por OS→Venda;
Operações Goal 4 — `criarVendaDeOSAction` persistindo FK). O CRM consome esses
vínculos via as relações `Cliente.vendas` e `Cliente.ordensServico`, e agora
soma os totais corretamente.

---

## 6. Riscos / limitações documentados (não corrigidos)

1. **Histórico do perfil limitado a 15 últimas** OS e 15 últimas Vendas (`take:
   15` no include). O total agora é agregado **sem esse limite** (correto). A
   lista é só visualização — para histórico completo o operador usa Histórico de
   Vendas / Operações HUB.
2. **Dois editores do cliente com formatos de `tags` diferentes** — o
   **Cadastros HUB** (Goal 6) salva `tags` como `string[]` (labels apenas); o
   **CRM** salva como objeto `{labels, address, financial, operational, ...}`.
   O CRM lida com ambos (fallback). Mas **editar um cliente no Cadastros HUB
   sobrescreve `tags` como array** → perde endereço/financeiro/operacional do
   CRM. *Recomendação:* converter o Cadastros HUB para também ler/escrever o
   formato estruturado, ou centralizar a edição no CRM.
3. **Coluna `Cliente.totalSpent` permanece estática** — o write nunca ocorre
   em PDV/OS. Funciona como fallback para clientes importados. Goal futuro:
   triggers de write ou remoção da coluna.
4. **Opções hardcoded de Carteira Padrão e Técnico Responsável** no form
   Financeiro/Operacional (ex.: "Caixa Principal PDV", "Banco Itaú PJ",
   "Michel/Israel/Larissa/Paulo"). São persistidas como string em `tags`, mas
   não vêm da lista real de carteiras/técnicos. *Recomendação:* alimentar via
   `listTecnicos` / API de carteiras.
5. **`toastRafacell`** força um toast preto-com-borda-vermelha (`bg-zinc-950
   text-white border-red-600/45`) em todos os temas — escolha de marca,
   readability OK, mas é um desvio dos tokens semânticos. Documentado.
6. **Asteriscos de campo obrigatório `text-red-400`** (Nome, Telefone) seguem
   hardcoded — contraste aceitável nos 4 temas, mas idealmente `text-destructive`.
7. **Texto de header diz "Cadastros HUB"** acima de "Clientes" — herança
   visual da navegação. Não alterado para não confundir com o Cadastros HUB
   real (`/dashboard/cadastros-v2`).
8. **`/api/clientes` POST/PATCH aceita `totalSpent` do body** — pode permitir
   um admin sobrescrever o total estático manualmente (override). O total
   exibido agora ignora isso quando há OS/Venda real (agregação ganha).
   Comportamento documentado.

---

## 7. Testes documentados

| # | Teste | Resultado |
|---|---|---|
| 1 | Abrir Clientes HUB (`/dashboard/clientes`) | ✅ lista real, skeleton no carregamento |
| 2 | Buscar cliente | ✅ server-side por nome/CPF/CNPJ/email/telefone (Enter ou botão) |
| 3 | Abrir detalhe do cliente | ✅ drawer com header, métricas, 3 abas |
| 4 | Histórico de compras | ✅ vendas reais com pedidoId/data/total/status |
| 5 | Histórico de OS | ✅ OS reais com nº/equipamento/defeito/valor/status |
| 6 | Total gasto | ✅ **agora agregado** (OS Pronto/Entregue + Vendas concluídas), consistente com Cadastros |
| 7 | Editar cliente | ✅ drawer com 5 abas; tags estruturadas persistidas |
| 8 | Inputs / search bars | ✅ sem ícone sobreposto (fix CSS global Goal 5); placeholders honestos |
| 9 | Temas Light/Soft Ice/Midnight/Black | ✅ **caixas de erro agora legíveis nos 4 temas** (era invisível em Light/Soft Ice) |
| 10 | Riscos restantes | ✅ documentados (§6) |

---

## 8. Validação

- `npx tsc --noEmit` → **0 erros**.
- `npm run build` → **OK** (tabela de rotas íntegra).
- `git status` (deste goal): `M app/api/clientes/route.ts`, `M app/api/clientes/[id]/route.ts`, `M app/dashboard/clientes/ClientesPageClient.tsx` (+71/−6).
  Os demais arquivos modificados no `git status` (cadastros.ts, CadastrosHub.tsx,
  gestao-produtos.tsx, CURRENT_STATUS.md, *_GOAL_REPORT.md) são dos Goals 6 e 7
  (Cadastros e Estoque), ainda não commitados.

## 9. Escopo

- **Não** alterados: `auth`, `proxy.ts`, sidebar, `prisma/schema.prisma`, PDV,
  Financeiro, Operações, Vendas, Estoque. Nenhuma migration. Nenhum cliente
  apagado.
- `CURRENT_STATUS.md` atualizado com a entrada do Goal 8.
