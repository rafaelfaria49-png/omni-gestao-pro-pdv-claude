# OmniGestão Pro — Estado Atual do Projeto

> Última atualização: 17 Mai 2026 — Sessão: Importador Avançado + Fixes Operações HUB
> Referência rápida para retomar o projeto ou fazer onboarding.

**Memória viva consolidada:**
[`docs/memory/OMNIGESTAO_MASTER_MEMORY.md`](../memory/OMNIGESTAO_MASTER_MEMORY.md)

**Auditoria consolidada:**
[`docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`](../modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md)

---

## ✅ Concluído e Funcionando

### Importador Avançado — GestaoClick (concluído 17/05/2026)

**Commit 1** — `lib/importador-avancado/` (6 arquivos):
- `types.ts`, `detector.ts`, `merger.ts`, `parser.ts`, `persistidor.ts`, `index.ts`

**Commit 2** — `app/api/import/advanced/route.ts`:
- `GET /api/import/advanced` → capabilities (formatos, domínios, limites)
- `POST /api/import/advanced?modo=preview` → planilhasDetectadas, grupos, confiança
- `POST /api/import/advanced?modo=importar` → { batchId, totais, porDominio, errosDetalhados, duracaoMs }
- Auth via NextAuth v5 + fallback cookie legado
- Suporte a ZIP do GestaoClick (adm-zip + jszip instalados)

**Commit 3** — UI do Importador Avançado:
- `components/dashboard/configuracoes/importador-avancado/hooks/use-importador-avancado.ts` — engine completa (upload, preview, import, estado em máquina de fases)
- `UploadZone.tsx` — drag & drop multi-arquivo, aceita ZIP
- `PreviewCruzamento.tsx` — lista planilhas com barra de confiança, amostra colapsável, botão Importar tudo
- `LogAuditoria.tsx` — resultado pós-import agrupado por domínio, batchId copiável, erros detalhados
- `ImportadorAvancado.tsx` — orquestrador (UploadZone → PreviewCruzamento → BarraProgresso → LogAuditoria)

**Integração:**
- `components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx` substituído por switcher de 2 cards (padrão PdvSection):
  - "Importação Universal" → `<ImportadorDadosExternos />` (legado, default)
  - "Importação Avançada" → `<ImportadorAvancado />`
  - Modo persistido em `localStorage["@omnigestao:importacao-modo"]`

**Dependências instaladas:**
- `adm-zip@^0.5.17`, `jszip@^3.10.1` (runtime — ZIP do GestaoClick)
- `@types/adm-zip` (devDependencies)

**Resultado de importação real (ZIP GestaoClick, 17/05/2026):**
- 17/17 arquivos detectados com domínio correto e confiança ≥70%
- Log do import reportou: ~555 criados / 2 atualizados / 13 ignorados / 0 erros (~53s) — *não reconferido nesta sessão*
- Estado do banco verificado após o import: Clientes 40 ✅ | Fornecedores 15 (tabela própria) ✅ | Produtos 231 ✅ | OS 34 ✅ | Vendas 245 ✅
- servicos_catalogo: ignorado (modelo próprio pendente)
- contas_pagar/receber: detectadas mas não persistidas (Fix futuro)

---

### Fixes aplicados (detector, parser, persistidor, hydration)

| Fix | Arquivo | O que fez |
|---|---|---|
| Fix 1 | deps | `npm install adm-zip jszip` |
| Fix 2 | `detector.ts` | Dicionário calibrado com headers reais GestaoClick (`"n da os"→os.numero`, `"nome"→cliente.nome`, etc.) |
| Fix 3 | `parser.ts` | Removido branch ExcelJS (não instalado → derrubava compilação da rota) |
| Fix 4 | `detector.ts` | `"n do pedido"→venda.numero`; reordenação de assinaturas (sub-domínios de vendas e `fornecedores_enderecos` antes dos genéricos); `clientes` passa a exigir `tipoPessoa` |
| Fix 5 | — | Não houve um Fix 5 isolado nesta sessão — o ajuste de `clientes_enderecos` foi incorporado ao Fix 6 |
| Fix 6 | `detector.ts` | `nomeNorm.includes(norm(n))` — normaliza entradas de `nomesArquivo` antes de comparar (underscore virava espaço e nunca casava); `clientes_enderecos.nomesArquivo` restrito |
| Fix 7 | `persistidor.ts` | Clientes: grava `document`, `kind`, `city`, `active`; Produtos: grava `barcode`, `brand`, SKU sintético anti-colisão; OS: match 4 camadas (doc→mapa→doc banco→nome banco) |
| Fix 8 | `use-importador-avancado.ts` | Hook lê `planilhasDetectadas` do response (backend) e preenche também `planilhas` (compatibilidade componentes) |
| Fix 9 | `route.ts` | Lê `modo` do query string (`?modo=importar`) e não só do FormData — era a causa de NUNCA persistir |
| Fix 10 | `persistidor.ts` | Fornecedores persistem na tabela `Fornecedor` (não mais em `Cliente`); `servicos_catalogo` marcado como ignorado; OS ganha 5ª camada de match (contains da 1ª palavra) |
| Fix 11 | `app/api/ops/ordens/route.ts` | GET usa `hydrateOSRows` com `include: { cliente, garantiasOperacionais }` em vez de devolver `r.payload` cru |
| Fix 12 | `app/actions/ordens.ts` | `findMany` inclui `cliente`; `DbOrdemRow` tipado com `cliente?`; `mapRows` propaga `{ id, nome }` |
| Fix 13 | `lib/operacoes/services/hydration-service.ts` | `PrismaOSRow` aceita `cliente?` (nome opcional); `applyPrismaEnrichment` propaga nome real do cliente (FK) quando payload tem `"—"` |

---

### Operações HUB — dados reais via Prisma (concluído 17/05/2026)

- **Kanban** mostra nome do cliente, defeito e valor nos cards ✅
- **Detalhe da OS** mostra `CLIENTE: LARISSA SOARES` (FK real) ✅
- **Histórico de clientes** vincula OS corretamente ✅
- Pipeline de status funcional (Aberto → Diagnóstico → Aprovado → etc.)
- `osStore` → `osApi.listOrdens` → Server Action `listOrdens` → `hydrateOSRows` → Kanban

**Arquivos principais da cadeia:**
```
components/operacoes/lovable/store/osStore.tsx
components/operacoes/lovable/api/os.ts  → listOrdens → listOrdensPrisma
app/actions/ordens.ts                   → findMany + include cliente + hydrateOSRows
lib/operacoes/services/hydration-service.ts  → applyPrismaEnrichment (propaga cliente real)
components/operacoes/lovable/components/operacoes/OSCard.tsx
```

---

### Hubs Visuais (mantidos da versão anterior)

- **WhatsApp HUB** — dados reais via Prisma, Meta Cloud API real, webhook HMAC, automações
- **PDV** — Assistência, Rápido, Completo; busca por SKU/EAN/nome; layout fixo sem scroll global
- **Cadastros HUB** — Clientes, Produtos, Fornecedores com dados reais
- **Financeiro** — contas a pagar/receber com service Prisma (sem plug na UI visual ainda)

### Sistema de Temas
- 4 temas: Light, Soft Ice, Midnight, Black Edition
- Sincronização bidirecional Hub ↔ Global
- Tokens semânticos globais (bg-background, bg-card, text-foreground, etc.)

---

## 🔄 Em Andamento

| Item | Situação |
|---|---|
| Equipamento no card Kanban | `os.equipamento` chega como string `"MOTOROLA MOTO EDGE 30"` — card exibe `—` na linha de marca/modelo. Fix pendente: `hydration-service` ler `payload.aparelho.{tipo,marca,modelo}` |
| servicos_catalogo (12 serviços) | Detectados mas ignorados — aguarda model `Servico` próprio no Prisma |
| contas_pagar (38) / contas_receber (307) | Detectados pelo importador mas não persistidos — service Prisma existe (`lib/financeiro/services/`) mas sem plug no importador |
| Fornecedores endereços | `fornecedores_enderecos.xlsx` (1 linha) importado mas sem modelo de endereço de fornecedor |
| Editar cliente/técnico na OS via UI | Botão "Vincular cliente" não existe ainda na tela de detalhe da OS |
| Relatórios de vendas a prazo | Vendas importadas existem no banco mas Relatórios HUB não as exibe ainda |

---

## 🔜 Próximos Passos (Backlog Priorizado)

### P0 — Crítico (bloqueia uso em produção)

- [ ] **Fix equipamento no card Kanban** — `hydration-service.ts`: ler `payload.aparelho.{tipo,marca,modelo}` quando `os.equipamento` é string plana
- [ ] **Vincular cliente na OS via UI** — botão inline na tela de detalhe para buscar e selecionar cliente
- [ ] **Atribuir técnico na OS via UI** — select de técnicos na tela de detalhe

### P1 — Importante

- [ ] **Persistir contas_pagar/contas_receber no importador** — plugar `lib/financeiro/services/` no `persistidor.ts` (Fix futuro)
- [ ] **Persistir servicos_catalogo** — criar model `Servico` ou reutilizar `Produto` com `type="servico"`
- [ ] **Relatórios de vendas** — exibir vendas importadas (245 no banco) no Relatórios HUB
- [ ] **Vendas a prazo** — listar no módulo Financeiro HUB (contas a receber vinculadas)

### P2 — Qualidade

- [ ] **Label de domínio no PreviewCruzamento** — planilhas sem domínio mostrado (ex: `clientes_enderecos`, sub-domínios OS) ficam sem label no card
- [ ] **Dedup de clientes** — homônimos (SOLANGE × SOLANGE SOL COXINHA, MICHEL × MICHEL DOUGLAS) não são mesclados; match só por doc exato
- [ ] **Normalização de telefone** — `149981153484` vs `(14)99...` inconsistente na importação
- [ ] **Histórico de clientes** — exibir vendas além das OS (hoje só OS aparecem)

### P3 — Expansão

- [ ] Marketplace HUB
- [ ] Sistema de mídia para OS (upload de fotos/anexos)
- [ ] Marketing IA com dados reais
- [ ] Financeiro HUB — fechamento de caixa, conciliação

---

## ⚠️ Atenção ao Retomar

1. **Sempre rodar `npx tsc --noEmit`** antes de commitar — zero tolerância
2. **Operações HUB usa dados REAIS via Prisma** (não mais mock) desde 17/05/2026
3. **Importador Avançado** — endpoint `POST /api/import/advanced` lê `modo` do **query string** (`?modo=preview` / `?modo=importar`), não do FormData
4. **GestaoClick ZIP** — todos os 17 arquivos detectam corretamente (Fix 6: `norm()` aplicado também nos `nomesArquivo`)
5. **Não tocar**: `auth.ts`, `proxy.ts`, `schema.prisma`
6. WhatsApp envio usa Meta Cloud API real (requer ENVs configuradas)
7. A rota `/dashboard/os` (legado) continua em paralelo ao `/dashboard/operacoes-v2`

---

## 📁 Arquivos-chave desta sessão

```
lib/importador-avancado/
├── types.ts
├── detector.ts          ← calibrado com headers reais GestaoClick
├── merger.ts
├── parser.ts            ← sem ExcelJS (Fix 3)
├── persistidor.ts       ← campos completos (Fix 7, 10)
└── index.ts

app/api/import/advanced/route.ts   ← lê modo do query string (Fix 9)
app/actions/ordens.ts              ← include cliente no findMany (Fix 12)
lib/operacoes/services/hydration-service.ts  ← propaga cliente FK (Fix 13)

components/dashboard/configuracoes/importador-avancado/
├── hooks/use-importador-avancado.ts   ← lê planilhasDetectadas (Fix 8)
├── UploadZone.tsx
├── PreviewCruzamento.tsx
├── LogAuditoria.tsx
└── ImportadorAvancado.tsx

components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx
```

---

## 📊 Estado do Banco (loja-1) após importação de 17/05/2026

| Modelo | Total | Observação |
|---|---|---|
| Cliente | 40 | Todos do `clientes.xlsx` GestaoClick |
| Produto | 231 | `produtos.xlsx` GestaoClick |
| OrdemServico | 34 | `ordens_servicos*.xlsx` GestaoClick |
| Venda | 245 | `vendas*.xlsx` GestaoClick |
| Fornecedor | 15 | `fornecedores.xlsx` (import 17/05) + eventuais legados — tabela `Fornecedor` não foi limpa antes do re-import |
| ContaReceberTitulo | 0 | Detectada, não persistida |
| ContaPagarTitulo | 0 | Detectada, não persistida |

> Contagens verificadas via Prisma em 17/05/2026 (`storeId: loja-1`).
