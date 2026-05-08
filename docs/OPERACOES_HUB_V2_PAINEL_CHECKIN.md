# Operações HUB V2 — Check-in detalhado (painel por painel)

Data: 2026-05-07  
Escopo: **somente leitura** (sem refatorar/alterar código).  
Objetivo: mapear **painel por painel** o que é **real (Prisma/Server Actions)** vs **mock (db em memória/toast/UI)** no Operações HUB V2.

## 0) Entrada, roteamento e arquitetura base

- **Rota Next**: `/dashboard/operacoes-v2` (`app/dashboard/operacoes-v2/page.tsx`)
  - Carrega via `dynamic(..., { ssr:false })`.
- **Sub-app Lovable**: `MemoryRouter` isolado em `components/operacoes/lovable/OperacoesHubIsolated.tsx`
  - Rotas internas:
    - `/operacoes` (Hub)
    - `/operacoes/dashboard` (Dashboard operacional)
    - `/operacoes/os` (Kanban)
    - `/operacoes/os/:id` (Detalhe da OS)
    - `/operacoes/tecnicos`, `/operacoes/historico`, `/operacoes/garantias`, `/operacoes/servicos`, `/operacoes/notificacoes`
- **Provider/Store**: `OSProvider` em `components/operacoes/lovable/store/osStore.tsx`
  - Faz `refresh()` via `Promise.all(...)` e popula estado local para a árvore do hub.
  - Mantém assinatura “UI-first”: componentes chamam `useOS()`; internamente o provider chama a camada `components/operacoes/lovable/api/*`.

### 0.1) Fonte de dados (resumo)

**OS (persistência real parcial)**
- Camada do hub: `components/operacoes/lovable/api/os.ts`
- Persistência real via Server Actions: `app/actions/operacoes.ts`
  - `listOS`, `createOS`, `updateOSStatus`, `updateOSPayload`
- **Conclusão**: quando o hub chama `osApi.*` ele frequentemente grava no **payload JsonB** da tabela `ordens_servico`.

**Cadastros (reais, leitura)**
- Clientes: `components/operacoes/lovable/api/clientes.ts` → `listClientesCadastros()` (Server Action de cadastros)
- Técnicos: `components/operacoes/lovable/api/os.ts` → `listTecnicosCadastros()` (Server Action de cadastros)
- Equipamentos/modelos + Produtos: `OSProvider` chama `listEquipamentosModelos()` e `listProdutos()` via `app/actions/cadastros` (reais)
- Serviços (catálogo): `components/operacoes/lovable/api/servicos.ts` lê do Cadastros; **escrita não persiste** (ver seção 10)

**Mocks (db em memória — não persiste)**
- DB em memória: `components/operacoes/lovable/api/_db.ts` (seeds + arrays mutáveis runtime)
- Estoque/peças: `components/operacoes/lovable/api/estoque.ts` (reserva/baixa em memória)
- Vendas do hub: `components/operacoes/lovable/api/vendas.ts` (em memória)
- Atendimentos rápidos: `components/operacoes/lovable/api/atendimentos.ts` (em memória)
- Lojas: `components/operacoes/lovable/api/lojas.ts` (em memória)
- Notificações: `components/operacoes/lovable/pages/Notificacoes.tsx` (estado local no componente)

---

## 1) Tela principal / “Hub” (`/operacoes`)

**Arquivo**: `components/operacoes/lovable/pages/OperacoesHub.tsx`

### KPIs / cards / listas

- **KPIs superiores**: derivados de `ordens` do `useOS()` (logo, refletem o que `listOS` retornar).
  - “Trend” (\(+18%, +2, etc.\)) é **texto hardcoded/mock** no array `kpis`.
- **Cards de módulos**:
  - “Nova OS”: abre modal real de criação (`NovaOSModal`) → **cria OS real** (Prisma + payload).
  - “Ordens em andamento”: navega para Kanban.
  - “Atendimento rápido”: abre modal → grava em **db em memória** (não Prisma).
  - “Histórico de clientes”: navega; dados vêm de clientes (cadastros real) + OS (real via listOS).
  - “Garantias”: navega; cálculo deriva das OS (real via listOS).
  - “Técnicos”: navega; técnicos vêm do Cadastros (real leitura) + OS (real).
  - “Catálogo de serviços”: navega; serviços vêm do Cadastros (real leitura), mas “salvar/editar” **não persiste** (mock).

### Botões e ações

- **Ações reais**: abrir `NovaOSModal` e salvar OS.
- **Ações mock**: “Atendimento rápido” persiste apenas no runtime (db em memória); tendências dos KPIs são mock.

---

## 2) Lista/Fila de OS (Kanban) (`/operacoes/os`)

**Página**: `components/operacoes/lovable/pages/OrdensServico.tsx`  
**Kanban**: `components/operacoes/lovable/components/operacoes/OSKanban.tsx`

### Origem dos dados

- `ordens` vem de `OSProvider.refresh()` → `osApi.listOrdens(storeId)` → `app/actions/operacoes.listOS(storeId)` → Prisma `ordemServico.findMany(...)` + parse do `payload`.

### Filtros / busca

- Filtros funcionais (local state):
  - técnico, prioridade, tipo equipamento, SLA atrasado, garantia ativa, “aguardando peça”.
- **Busca textual**: **não existe** na tela Kanban (apenas filtros). O input “Buscar OS...” do header do layout também não está conectado a estado (ver seção 11).
- Botão “Filtros (em breve)” na página é **toast**.

### Alteração de status (drag & drop)

- Drop chama `moveStatus(osId, status)` do `useOS()`.
- `moveStatus` → `components/operacoes/lovable/api/os.ts.moveStatus`:
  - `updateOSStatus(...)` (Server Action, Prisma) + patch de `timeline` via `updateOSPayload(...)` (Server Action).
- **Conclusão**: mover cards no Kanban **persiste no Prisma**, e ainda registra evento na `timeline` (payload).

### Abrir detalhe

- Card `OSCard` é `<Link to="/operacoes/os/:id">` (React Router).

### Criar nova OS

- Botão “Nova OS” abre `NovaOSModal` (cria OS real via Server Action `createOS`).

### Editar/excluir/cancelar

- **Editar**: não há fluxo explícito de “editar OS” no Kanban (fora mover status e abrir detalhe).
- **Excluir**: não existe ação de excluir no Kanban.
- **Cancelar**: existe status `cancelada` no tipo do hub (`types/os.ts`), mas não há UI de “cancelar” no Kanban.

---

## 3) Detalhe da OS (`/operacoes/os/:id`)

**Arquivo**: `components/operacoes/lovable/pages/OSDetalhe.tsx`

### O que lê do banco

Tudo que aparece na tela vem de `getOS(id)` do `OSProvider`:
- Lista em memória `ordens[]` (hidratada por `listOS` Prisma + payload).
- Portanto, o detalhe reflete o `payload` **persistido** da OS (quando presente).

### O que salva no banco

No detalhe, as seguintes interações chamam `useOS()` e chegam ao Prisma via Server Actions:
- **Pipeline de status**: clique nas etapas chama `moveStatus(os.id, p.id)` → Prisma `updateOSStatus` + `updateOSPayload` (timeline).
- **Checklist (toggle estado)**: `updateChecklist(os.id, next)` → `updateOSPayload` (payload) + evento em timeline.

### Painéis renderizados no detalhe

O detalhe compõe:
- Defeito relatado (somente leitura do payload)
- Checklist (se existir)
- Serviços contratados (`os.servicosCatalogo`, leitura do payload)
- **`ObservacoesPanel`** (persistência real via payload)
- **Histórico auditável**: `Timeline` (leitura do payload)
- (no `aside`) Cliente/técnico/garantia e atalhos de ação (ver seções 4–9)

---

## 4) Orçamento

**Painel**: `components/operacoes/lovable/components/operacoes/OrcamentoPanel.tsx`  
**Camada**: `components/operacoes/lovable/api/os.ts`

### Serviços / peças / desconto / total

- Itens podem ser adicionados a partir de:
  - **Serviços do catálogo** (`servicosCatalogo`) — vem do Cadastros (real leitura).
  - **Produtos do catálogo** (`produtosCatalogo`) — vem do Cadastros (real leitura).
- Editar quantidade/valor/desconto/obs re-calcula total via `recalcularTotalOrcamento` (cliente).

### Persistência (payload JsonB)

As ações abaixo chamam `useOS().salvarOrcamento(...)` e persistem via `updateOSPayload(...)`:
- Criar orçamento rascunho (`criarOrcamentoRascunho`)
- Adicionar/remover item
- Salvar alterações
- Enviar orçamento ao cliente (muda status para `enviado`)

### Aprovação/recusa / faturamento pendente / eventos

Quando aprovado/recusado (via botões do painel, na camada `api/os.ts`):
- **Aprovar**: seta `orcamento.status = "aprovado"`, muda OS para `status: "em_execucao"`,
  cria eventos na `timeline` incluindo `faturamento_os_pendente` e grava campos:
  - `faturamentoPendente`, `faturamentoStatus`, `faturamentoOrigem`, `faturamentoTotal`, `faturamentoCriadoEm`, `faturamentoReferencia`
- **Recusar**: seta `orcamento.status = "recusado"` e grava evento `faturamento_os_cancelado`.
- **Persistência**: tudo via `updateOSPayload` (Prisma JsonB).

### Envio ao cliente

- “Enviar orçamento ao cliente” muda status do orçamento para `enviado` e grava evento em `timeline`.
- **Não há envio real por WhatsApp/e-mail** aqui; é mudança de estado/payload.

---

## 5) Anexos/Fotos

**Painel**: `components/operacoes/lovable/components/operacoes/AnexosPanel.tsx`

### Upload / preview / remoção

- Upload: usa `<input type="file">` + `URL.createObjectURL(file)` para criar `url` local (blob URL).
- Chama `useOS().addAnexo(...)`:
  - Persiste no payload via `api/os.addAnexo()` → `updateOSPayload(...)`.
- Preview: abre em nova aba pelo `href={a.url}`.
- **Remoção**: não existe UI de remoção de anexo.

### Risco de perda de dados

Mesmo “persistindo” anexo no payload, o `url` gravado é um **blob URL local da sessão**.
- Ao recarregar / mudar de dispositivo, o link **não será recuperável** (não aponta para Supabase/S3/DB real).
- Portanto: **metadados** (nome, tipo, flags) até podem persistir; **arquivo em si não**.

---

## 6) Observações/Timeline

### Observações internas

**Painel**: `components/operacoes/lovable/components/operacoes/ObservacoesPanel.tsx`
- `addObservacao(os.id, texto, interna)` → `api/os.addObservacao()` → `updateOSPayload(...)`
- Também registra evento em `timeline`.
- **Persistência**: real (payload JsonB).

### Timeline / histórico auditável

**Render**: `components/operacoes/lovable/components/operacoes/Timeline.tsx` (consome `os.timeline`)
- Todos os eventos são armazenados no **payload JsonB**, não em tabela própria.
- Eventos são criados por:
  - mudança de status (`moveStatus`)
  - orçamento (criar/enviar/editar/aprovar/recusar)
  - observação
  - anexo adicionado
  - checklist atualizado
  - faturamento pendente/cancelado (no payload)

---

## 7) Checklist técnico / Modo Bancada

**Modal**: `components/operacoes/lovable/components/operacoes/ModoBancadaModal.tsx`

### O que funciona (persistindo)

- “Finalizar”:
  - chama `moveStatus(os.id, "pronta")` → persiste (Prisma status + payload timeline)
  - registra observação interna com tempo (`addObservacao`) → persiste (payload)

### O que é mock/toast

- “Foto rápida” → toast “em breve”
- “Adicionar peça” → toast “em breve”
- Cronômetro: estado local (não persiste como métrica estruturada; apenas pode virar observação textual quando finaliza).

---

## 8) IA / Assistente operacional

**Modal**: `components/operacoes/lovable/components/operacoes/IASugestaoModal.tsx`

- Implementa **heurística local** baseada em palavras-chave do defeito.
- Não chama `services/ai`, API, nem grava no payload/timeline.
- **Status**: 100% mock/local (geração determinística no client).

---

## 9) Impressão / Etiqueta / Comprovantes

**Impressão**: `components/operacoes/lovable/components/operacoes/ImpressaoModal.tsx`  
**Etiqueta térmica**: `components/operacoes/lovable/components/operacoes/EtiquetaModal.tsx`

- Ambos fazem preview HTML e usam `window.print()` para imprimir.
- **Não geram PDF/arquivo real**, não salvam “comprovante emitido” no banco, nem criam evento na timeline.
- **Status**: UI funcional (print), sem trilha/auditoria persistida.

---

## 10) Integrações (Financeiro, WhatsApp, Event Bus, Automations, Estoque, Vendas, Cadastros)

### Cadastros (real: leitura)

- Clientes/técnicos/serviços/produtos/modelos entram via Server Actions de cadastros (usado no `OSProvider.refresh()` e em `api/os.ts`).

### Estoque (mock)

- Reserva/baixa em `components/operacoes/lovable/api/estoque.ts` usando `db` em memória.
- “Adicionar peça do estoque à OS” existe como função no provider (`addPecaFromEstoque`) e **grava peça no payload** + **movimento em memória**.
- Não há baixa em Prisma/estoque real (tabela `Produto.stock`) neste caminho.

### Vendas (mock)

- `components/operacoes/lovable/api/vendas.ts` cria venda em `db.vendas` (memória).
- `faturarOS` muda status da OS para `entregue` via `updateOSStatus` (Prisma), mas a venda em si é **mock**.

### WhatsApp / Automations / Event Bus (mock/placeholder)

Pontos observados:
- Botões “WhatsApp” em `OSDetalhe.tsx` e `PortalClienteModal.tsx` são **toast/placeholder**.
- Notificações automáticas (`pages/Notificacoes.tsx`) são **estado local** e explicitamente “mockadas”.
- Não foi identificado neste módulo um publish consistente para “event bus” real (além do que já fica gravado na `timeline` do payload).

### Financeiro (parcial via payload)

- Aprovação de orçamento grava campos `faturamento*` no payload (Server Action via `updateOSPayload`).
- **Não** cria título financeiro (Prisma de contas a receber/pagar) automaticamente.

---

## 11) Stores / hooks / providers

### `OSProvider` e `useOS()`

**Arquivo**: `components/operacoes/lovable/store/osStore.tsx`
- Estado em memória do módulo:
  - `ordens`, `tecnicos`, `clientes`, `equipamentosModelos`, `pecasEstoque`, `vendas`, `servicosCatalogo`, `produtosCatalogo`, `atendimentos`
- Mutações:
  - **Persistem no Prisma/payload**: criar OS, mover status, atribuir técnico, observações, anexos (metadados), orçamento, checklist, eventos.
  - **Mock**: estoque/peças, vendas, atendimentos, lojas.

### Observação: busca global do header do hub

Em `OperacoesLayout.tsx` existe um `<Input placeholder="Buscar OS, cliente, técnico...">` sem estado/onChange e sem integração.
- Hoje é **apenas UI** (não funcional).

---

## 12) Status e tipos — comparação (Hub vs Prisma vs “OS clássica”)

### Hub (Lovable) — 7 estados

Em `components/operacoes/lovable/types/os.ts`:
- `aberta`, `diagnostico`, `aguardando_aprovacao`, `em_execucao`, `pronta`, `entregue`, `cancelada`

### Prisma — 4 estados

Em `prisma/schema.prisma`:
- `StatusOrdemServico`: `Aberto`, `EmAnalise`, `Pronto`, `Entregue`

### Mapeamento atual (perda de granularidade)

Em `app/actions/operacoes.ts`:
- `diagnostico`, `aguardando_aprovacao`, `em_execucao` → Prisma `EmAnalise`
- `aberta` → Prisma `Aberto`
- `pronta` → Prisma `Pronto`
- `entregue` → Prisma `Entregue`

**Risco**: a camada Prisma não distingue etapas internas do pipeline do hub (3 etapas diferentes colapsam em `EmAnalise`). Se outro sistema depender do enum Prisma, pode haver divergências.

### OS “clássica”

Existe OS clássica em `/dashboard/os` (fora do escopo de alteração aqui).
- O risco principal é de **duplicação conceitual** e divergência de payload/status entre fluxos.

---

## 13) Riscos (por categoria)

- **Perda de dados (Anexos)**: blob URL gravada no payload não sobrevive a reload/device.
- **Duplicação**: OS Hub V2 vs OS clássica; risco de duas fontes da verdade.
- **Inconsistência de status**: 7 estados do hub vs 4 estados Prisma (colapso em `EmAnalise`).
- **Vendas/Estoque**: fluxo de “faturar OS” gera venda **mock**; estoque do hub é **mock** → risco de stakeholders acharem que baixou estoque/gerou venda real.
- **Catálogo de serviços**: UI “salva” mas `upsertServico` não persiste (risco de UX enganosa).
- **Integrações**: vários botões são toast/placeholder (WhatsApp, notificações reais, portal aprovar/recusar).
- **Build/Lint**: há arquivo `NotFound.tsx` com `<a href="/">` e uso de `<img>` em anexos; podem gerar warnings de lint do Next (sem correção nesta etapa).

---

## 14) Recomendação técnica (ordem segura para “ficar real premium”)

### Painéis que já podem evoluir com segurança (alta alavancagem)

- **Orçamento**: já persiste no payload; próximo passo seguro é padronizar contratos e garantir validação/auditoria (sem mudar UX).
- **Timeline/Observações/Checklist**: já persistem; próximo passo é estabilizar esquema do payload e/ou extrair eventos para tabela de eventos (quando fizer sentido).
- **Kanban (status)**: já persiste; próximo passo é resolver compatibilidade de status (ver abaixo).

### Painéis que precisam ser preservados (não quebrar)

- **Criação de OS (`NovaOSModal`)**: já cria OS real; preservar fluxo e garantir compatibilidade com cadastros.
- **Garantias**: derivam do evento de entrega; preservar a lógica de snapshot de garantia e sua escrita no payload.

### Painéis que devem continuar mock (por enquanto, até ter decisões de domínio)

- **Notificações** (canais/engine), **WhatsApp**, **Portal do Cliente**: dependem de estratégia de mensageria, autenticação e templates.
- **IA diagnóstico**: hoje é heurística; só virar real quando houver provider/modelo, custos e trilha de auditoria.

### Próxima implementação segura (sugestão)

1) **Resolver “status canônico”**: definir se o enum Prisma será expandido (ou se o pipeline detalhado fica apenas no payload).  
2) **Anexos reais**: substituir blob URL por upload real (Supabase Storage/S3) + persistir URL permanente + remoção.  
3) **Faturamento real**: ao aprovar orçamento, criar entidade real (Venda Prisma e/ou Conta a Receber) — mantendo o payload como referência.  
4) **Estoque real**: integrar baixa/reserva com `Produto.stock` (Prisma) e trilha de movimentos (tabela).  
5) **Integrações**: ligar WhatsApp/automations a partir de eventos do domínio (não só toasts).

