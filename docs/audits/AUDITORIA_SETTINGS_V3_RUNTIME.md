# Auditoria Configurações V3 — Settings vs Runtime

> **Data:** 26 Mai 2026  
> **Escopo:** somente leitura · sem alterações de código  
> **Rotas:** `/dashboard/configuracoes` (`ConfiguracoesV3Page`) + embeds (`LojasSection` → `GestaoUnidadesSaas`)  
> **Fora do escopo:** `components/pdv-github-original/**`, auth/proxy, Prisma/schema  

---

## 1. Resumo executivo

A Config V3 tem **12 seções** no menu, mas o estado real do produto está repartido entre **4 camadas** que nem sempre convergem:

| Camada | Exemplos | Risco |
|--------|----------|-------|
| **API Prisma** (`Store`, `StoreSettings`) | `name`, `contactEmail`, `printerConfig`, `cardFees` | Fonte correta multi-loja |
| **`StoreSettingsProvider`** | `pdvParams`, `termosGarantia`, `aiMestreModel` (leitura) | Hidrata runtime quando dentro de `AppOpsProviders` |
| **localStorage (browser)** | `@omnigestao:pdv-layout`, `centro-financeiro-v3::{storeId}`, `assistec-pro-config-v2`, `assistec-pro-financeiro-v2-{loja}` | **Drift** entre dispositivos / abas |
| **`config-empresa` legado** (`assistec-pro-config-v2`) | `config.pdv.*`, `config.empresa.*`, `termosGarantia` | **Duplicata** com `printerConfig`; ainda consumido por alguns módulos |

**Contagem por categoria (settings com UI ou persistência identificável):**

| Categoria | Qtd | Significado |
|-----------|-----|-------------|
| **OK — conectado** | 22 | Salva (ou reflete API) e consumer runtime confirmado |
| **Parcial** | 14 | Persiste mas consumer incompleto, dual-write ou só checklist |
| **Drift** | 9 | Mesma intenção em 2+ camadas com precedência implícita |
| **Órfão / mock** | 8 | UI sem efeito ou campo API sem writer na V3 |
| **Legado (fora V3)** | 11 | Ainda no código (`configuracoes-sistema.tsx`, `config-empresa`) sem rota ativa |
| **Em breve (honesto)** | 6 | Badge/disabled explícito na V3 |

**Impacto operacional principal:** operador configura na V3 acreditando efeito global; em PDV/financeiro/IA parte das preferências só vale **no navegador atual** ou fica **só espelho** em `printerConfig` sem consumer.

---

## 2. Metodologia

1. Leitura das 12 seções em `components/configuracoes-v3/features/settings/sections/*.tsx`.
2. Rastreamento de persistência: `PUT /api/stores`, `PUT /api/stores/[id]/settings`, `localStorage`, `config-empresa`.
3. Grep de consumers em `components/dashboard/**`, `lib/**`, `app/api/**` (excl. `pdv-github-original`).
4. Cruzamento com auditoria anterior [`AUDITORIA_CONFIGS_MASTER.md`](./AUDITORIA_CONFIGS_MASTER.md) e estado pós-fix imposto/mesas (26/05).

---

## 3. Mapa de fontes de verdade (duplicação)

```mermaid
flowchart TB
  subgraph v3 [Config V3 UI]
    Geral[GeralSection]
    Pdv[PdvSection]
    Vendas[VendasSection]
    Fin[FinanceiroSection]
    Lojas[LojasSection]
  end

  subgraph api [API / Prisma]
    Store[Store]
    SS[StoreSettings]
  end

  subgraph ls [localStorage]
    PDV_LAYOUT["@omnigestao:pdv-layout"]
    PDV_CLASSIC["omni-pdv-classic-layout"]
    PDV_MODO["omnigestao-pdv-modo"]
    CFV3["centro-financeiro-v3::{storeId}"]
    FINV2["assistec-pro-financeiro-v2-{loja}"]
    CFGEMP["assistec-pro-config-v2"]
    IMP["@omnigestao:importacao-modo"]
  end

  subgraph runtime [Runtime consumers]
    VendasPDV[vendas-pdv / PDVs]
    PayModal[payment-modal]
    Orc[orcamentos]
    OS[ordens-servico]
    IA[/api/ai/orchestrate]
  end

  Geral --> Store
  Geral --> SS
  Pdv --> SS
  Pdv --> PDV_LAYOUT
  Pdv --> PDV_CLASSIC
  Pdv --> PDV_MODO
  Vendas --> SS
  Fin --> SS
  Fin --> CFV3
  Lojas --> Store
  Lojas --> SS

  SS --> VendasPDV
  PDV_LAYOUT --> VendasPDV
  PDV_CLASSIC --> VendasPDV
  PDV_MODO --> VendasPDV
  CFV3 --> PayModal
  SS --> Orc
  SS --> OS
  SS --> IA
  CFGEMP --> PayModal
  FINV2 --> Fin
```

---

## 4. Tabela completa de settings

Legenda **Status:** `OK` · `PARCIAL` · `DRIFT` · `ORFAO` · `MOCK` · `LEGADO` · `EM_BREVE`  
Legenda **Risco:** `P0` operação enganosa · `P1` inconsistência multi-dispositivo · `P2` UX/técnico

### 4.1 Geral (`GeralSection`)

| Setting (UI) | Persistência | Consumer runtime | Status | Risco |
|--------------|--------------|----------------|--------|-------|
| Nome da empresa | `PUT /api/stores/[id]` → `Store.name` | Cupom PDV (`pdv-classic` fetch store), documentos, checklist | OK | — |
| CNPJ, telefone, endereço | `Store.*` | Cupom, relatórios, OS (indireto) | OK | P2 se PUT falhar por role (save parcial já documentado na UI) |
| Email | `StoreSettings.contactEmail` | Integrações V3 (status), orçamentos/recibos (indireto) | OK | — |
| WhatsApp loja / responsável | `contactWhatsapp`, `contactWhatsappDono` | Integrações V3; **`daily-close-scheduler` lê `config-empresa` legado**, não API | **DRIFT** | **P1** |
| Moeda | — (Select disabled) | Nenhum | **EM_BREVE** | P2 |
| Fuso horário | — (Select disabled) | Nenhum | **EM_BREVE** | P2 |
| Go Live Checklist | — (somente leitura) | Navegação / validação visual | OK (informativo) | — |

### 4.2 Lojas (`LojasSection` → `GestaoUnidadesSaas`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Unidade ativa | `LojaAtivaProvider` + cookie/header | Todo dashboard (`x-assistec-loja-id`) | OK | — |
| CRUD lojas | `/api/stores` | Multiloja, MC, checklist | OK | — |
| Perfil loja (Assistência / Variedades / Supermercado) | `Store.profile` + `/api/settings/perfil-loja` | `PerfilLojaProvider`, layout PDV inferido, OS menus | OK | P2 drift com `@omnigestao:ramo-atuacao:{storeId}` legado |
| Rodapé cupom (`receiptFooter`) | `StoreSettings.receiptFooter` | `pdv-classic` → ESC/POS | OK | **P1** duplicado: não exposto na aba Geral V3, só em Lojas |
| Plano exibido na unidade | `Store.subscriptionPlan` | PlanoSection / billing | OK (display) | — |

### 4.3 PDV (`PdvSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Fluxo PDV (clássico / assistência / supermercado / next) | `printerConfig.v3PdvSectionCard` + **`@omnigestao:pdv-layout`** + `pdvParams.pdvClassicLayout` | `vendas-pdv.tsx`, `PdvClassic`, `PdvSupermercado`, assistência enterprise | **DRIFT** | **P1** |
| Modo inicial clássico (normal / rápido) | `printerConfig.v3PdvClassicModoInicial` + **`omnigestao-pdv-modo`** + URL `?modo=rapido` | `vendas-page-client`, PDV classic | **DRIFT** | **P1** |
| PDV Next | localStorage `next` + flag experimental | Redireciona ou auto-heal para classic | **PARCIAL** | P2 (experimental; card oculto sem env) |
| Preview temas nos cards Next/Assistência | — (estado React local) | Só modal preview | **MOCK** | P2 |
| Pré-visualização global (botão) | disabled + Em breve | Nenhum | **EM_BREVE** | — |

**Nota:** `pdvClassicLayout: "venda-completa"` existe em `omni-pdv-classic-layout` e botão no `pdv-classic`, mas **PdvSection não grava** esse valor em `printerConfig` — só `lovable` | `services`.

### 4.4 Vendas (`VendasSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Garantia padrão (dias) | `printerConfig.pdvParams.garantiaPadraoDias` | Orçamentos, venda completa enterprise, WhatsApp orçamento | OK | — |
| Validade orçamento (dias) | `pdvParams.validadeOrcamentoDias` | `orcamentos.tsx` | OK | — |
| Imposto estimado PDV + alíquota | `pdvParams.incluirImpostoEstimadoNoPdv`, `aliquotaImpostoEstimadoPdv` | `lib/pdv-cart-totals.ts` → PDVs + PaymentModal | OK *(fix 26/05)* | — |
| Módulo mesas/consumo | `pdvParams.moduloControleConsumo` | `/dashboard/vendas/mesas`, botão Mesas no PDV | OK *(fix 26/05)* | P2 mesas usam LS próprio (`assistec-controle-consumo-mesas-v1`) |
| Formas de pagamento (toggles) | **Nenhuma** | Nenhum (PDV usa fluxo fixo) | **MOCK** | P2 (badge Em breve) |
| Duplicata `config.pdv.*` imposto/mesas | `assistec-pro-config-v2` | **Nenhum** (runtime usa `useStoreSettings`) | **LEGADO** | P2 |

### 4.5 Financeiro (`FinanceiroSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Meta faturamento | `cardFees` API + `centro-financeiro-v3` LS | **Só Go Live checklist** | **PARCIAL** | **P1** salva mas não alimenta dashboard/KPIs |
| Anotações meta | idem | Checklist / centro financeiro legado | **PARCIAL** | P2 |
| Maquininhas ativas (contador) | `cardFees.maquininhas[].ativo` | **`getMaquininhasParaPdvForStore` lê só LS**, não API | **DRIFT** | **P0** taxas PDV podem divergir em browser novo |
| KPI entradas / a pagar | `assistec-pro-financeiro-v2-{lojaId}` | Painéis legado; **rótulo honesto na V3** | **PARCIAL** | P1 (não é financeiro V2 Prisma) |
| Relatório mensal email | disabled | Nenhum | **EM_BREVE** | — |
| Edição taxas maquininha | **Não na V3** — link implícito para `centro-personalizacao-financeira-rafacell.tsx` | PDV payment-modal | **PARCIAL** | P1 |

### 4.6 IA e Créditos (`IaSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Saldo créditos | `GET /api/user/credits` | Topbar, IA Mestre | OK | — |
| Histórico créditos | `GET /api/credits/history` | IaSection (display) | OK | — |
| Modelo IA Mestre (unidade) | `printerConfig.aiMestreModel` | **`/api/ai/orchestrate` lê** | **ORFAO** | **P1** **nenhum writer** no repo — IaSection diz “salvo na tela IA Mestre” mas `ia-mestre/page.tsx` só envia `model` no body |
| Limite mensal IA | — | UI diz que não existe | OK (honesto) | — |

### 4.7 Integrações (`IntegracoesSection`)

| Card | Persistência refletida | Consumer | Status | Risco |
|------|------------------------|----------|--------|-------|
| WhatsApp | `contactWhatsapp` | HUB WhatsApp (env), orçamentos | **PARCIAL** | P2 status V3 ≠ conexão Meta |
| E-mail | `contactEmail` | Geral / cadastros | OK | — |
| IA modelos | `aiMestreModel` | Ver acima | **ORFAO** | P1 |
| OpenRouter | env servidor | IA Mestre | OK (informativo) | — |
| Marketplace | — | HUB mock | **MOCK** | P2 (documentado) |
| Pagamentos/taxas | `cardFees` | Ver Financeiro | **DRIFT** | P1 |

### 4.8 Importação (`ImportacaoSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Modo universal vs avançada | `@omnigestao:importacao-modo` (LS) | Troca componente importador na mesma aba | **PARCIAL** | P2 por browser; copy honesta |
| Importadores em si | APIs reais | `/api/import/*`, produtos lote | OK | — |

### 4.9 Aparência (`AparenciaSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Tema (10 variantes) | `omni-studio-dual-theme` (global `ThemeProvider`) | Shell dashboard, hubs sync `data-studio-theme` | OK | P2 Config V3 `ThemeContext` espelha global, não LS próprio |
| Pré-visualização global | disabled | Nenhum | **EM_BREVE** | — |

### 4.10 Usuários (`UsuariosSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| CRUD AdminUser | `/api/admin/users` | Login NextAuth, permissões enterprise | OK | — |
| Matriz papéis (texto) | — | Informativo | OK | — |
| Permissões granulares por módulo | — | Não implementado | **EM_BREVE** (implícito) | P2 |

### 4.11 Segurança (`SegurancaSection`)

| Setting | Persistência | Consumer | Status | Risco |
|---------|--------------|----------|--------|-------|
| Encerrar sessão | NextAuth signOut | `proxy.ts` gate | OK | — |
| Alterar senha / 2FA / sessões | — | Documentado “em breve” | **EM_BREVE** | P2 |

### 4.12 Plano (`PlanoSection`)

| Item | Persistência | Consumer | Status | Risco |
|------|--------------|----------|--------|-------|
| Toda a seção | — | Sidebar usa **`href: /dashboard/billing`** — componente `PlanoSection` **não montado** pelo menu | **ORFAO** | P2 código morto salvo `?sec=plano` manual |

---

## 5. Settings persistidas mas SEM UI na V3 (lacunas)

Estas existem em `printerConfig` / API e têm consumer, mas **não há seção V3** para editar:

| Campo | Onde salva hoje | Consumer | Status |
|-------|-----------------|----------|--------|
| `termosGarantia` | Legado `configuracoes-sistema.tsx` → API | `ordens-servico`, `useStoreSettings` | **LEGADO** / lacuna V3 |
| `atalhosRapidos` | PDV supermercado (modal) + legado | `pdv-classic`, `pdv-supermercado` | **PARCIAL** |
| `ocultarCategoriasNoPdv` + lista | Legado only | `pdv-classic` grade | **LEGADO** / lacuna V3 |
| `certificadoA1` | Legado only | Metadado; **sem emissor NF-e real** | **ORFAO** |
| `receiptFooter` | Lojas (`GestaoUnidadesSaas`) | Cupom PDV | OK (fora Geral) |
| `cardFees.maquininhas` (taxas) | Centro financeiro legado + Financeiro V3 meta | PDV payment-modal via LS | **DRIFT** |

---

## 6. Consumers com fallback legado

| Consumer | Lê preferencial | Fallback legado | Risco |
|----------|-----------------|-----------------|-------|
| `payment-modal` | `getMaquininhasParaPdvForStore` (LS) | Defaults centro financeiro | **P0** não hidrata API |
| `payment-modal` | — | `useConfigEmpresa().config.empresa` (nome) | **P1** vs Geral API |
| `daily-close-scheduler` | — | `config-empresa` contato WhatsApp | **P1** vs `StoreSettings` |
| `orcamentos` | `useStoreSettings().pdvParams` | `useConfigEmpresa` + `configPadrao` em edge cases | **DRIFT** |
| `vendas-pdv` layout | LS + `pdvParams` | `perfilLoja`, `@omnigestao:ramo-atuacao:*` | **DRIFT** |
| `useStoreSettings()` sem provider | defaults `configPadrao` | `storeId: ""`, `hydrated: false` *(fix 26/05)* | P2 mitigado |

---

## 7. Providers duplicados (fetch redundante)

Cada seção V3 re-monta `ConfigEmpresaProvider` + `LojaAtivaProvider` + `StoreSettingsProvider` (6–8 fetches `/settings` ao trocar abas). **Não quebra runtime**, mas causa:

- Estado isolado entre abas até refresh
- Checklist Geral pode desincronizar momentaneamente

**Risco:** P2 performance / confusão em save parcial.

---

## 8. Priorização P0 / P1 / P2

### P0 — Engana operação ou afeta caixa

| # | Item | Impacto operacional |
|---|------|---------------------|
| P0-1 | **Maquininhas PDV leem só `localStorage`** (`getMaquininhasParaPdvForStore`), enquanto V3/centro gravam `cardFees` na API | Caixa novo / outro PC: taxas e maquininhas ativas **erradas ou vazias** apesar de “salvo” na Config |
| P0-2 | **Dual-write PDV layout** (4 chaves) sem precedência documentada para o operador | Unidade A configura assistência; browser B abre PDV clássico por LS antigo |

### P1 — Inconsistência multi-dispositivo / expectativa quebrada

| # | Item | Impacto |
|---|------|---------|
| P1-1 | **`aiMestreModel` sem writer** — UI promete persistência por unidade | Plano Ouro: modelo “salvo” nunca grava; orchestrate usa default |
| P1-2 | **`metaFaturamento` / `metaObservacao`** persistem mas **não aparecem** em dashboard/PDV | Meta configurada não guia operação |
| P1-3 | **WhatsApp fechamento diário** (`daily-close-scheduler`) usa `config-empresa`, não Geral API | Configurar WhatsApp em Geral **não** afeta fechamento automático |
| P1-4 | **`receiptFooter` só em Lojas**, não em Geral | Operador não encontra rodapé onde espera |
| P1-5 | **KPI Financeiro V3** = localStorage legado | Números na Config **≠** Financeiro V2 / Prisma |
| P1-6 | **Termos garantia / categorias PDV / certificado A1** — só legado desroutado | OS/PDV usam defaults ou API antiga; V3 não expõe |
| P1-7 | **`payment-modal` empresa** via `config-empresa` | Nome fantasia no pagamento pode divergir da unidade API |

### P2 — UX, código morto, dívida técnica

| # | Item |
|---|------|
| P2-1 | Formas pagamento mock (Em breve) — OK se mantido |
| P2-2 | Moeda/fuso, relatório email, preview global — Em breve |
| P2-3 | `PlanoSection` órfã vs sidebar billing |
| P2-4 | `configuracoes-sistema.tsx` no repo sem rota — confunde IAs |
| P2-5 | Providers aninhados por seção |
| P2-6 | Mesas/consumo LS local (comandas) |
| P2-7 | `@omnigestao:ramo-atuacao` vs `Store.profile` |
| P2-8 | Toggles preview tema PDV (cosmético) |

---

## 9. Sugestões incrementais seguras (sem refactor grande)

Ordem sugerida — **cada passo independente**, alinhado à arquitetura atual:

1. **P0-1 — Hidratar maquininhas PDV da API**  
   Em `payment-modal` (ou `getMaquininhasParaPdvForStore`): se LS vazio/stale, `fetch /api/stores/{id}/settings` → merge `cardFees` → persist LS espelho. *Não remover LS ainda.*

2. **P1-1 — Persistir `aiMestreModel`**  
   No save de modelo em `ia-mestre/page.tsx`: `PUT settings` com merge `printerConfig.aiMestreModel` (mesmo padrão Vendas). IaSection passa a refletir realidade.

3. **P1-3 — Unificar contato WhatsApp**  
   `daily-close-scheduler` ler `StoreSettings` via fetch ou hook existente; manter fallback `config-empresa` só migração.

4. **P1-6 — Expor lacunas V3 ou redirecionar**  
   Opção mínima: card “Termos de garantia” em Vendas com link para OS/config legado **ou** migrar bloco de `configuracoes-sistema` (termos + categorias PDV) para `VendasSection` save em `printerConfig`.

5. **P0-2 / P1 PDV layout — Documentar + single write path**  
   Sem novo sistema: ao salvar `PdvSection`, já escreve LS; adicionar banner “Preferência deste navegador sincronizada ao salvar”. Opcional: on mount PDV, se API `v3PdvSectionCard` ≠ LS, preferir API once.

6. **P1-2 Meta faturamento**  
   Consumir `metaFaturamento` no painel inicial elite (já tem API vendas) — 1 widget, sem novo módulo.

7. **P2-4 Deprecar legado visível**  
   Comentário no topo de `configuracoes-sistema.tsx`: “não roteado; usar Config V3”. Não deletar ainda.

8. **P2-5 Providers**  
   Mover providers para wrapper único em `ConfiguracoesV3Page` (1 PR, sem mudar APIs).

---

## 10. Lista rápida — conectadas vs removidas vs futuras

### Conectadas (runtime real confirmado)

- Dados empresa + contatos API (Geral/Lojas)
- Perfil loja → PDV/OS
- Fluxo PDV + modo rápido (multi-camada, efeito real)
- Garantia/validade orçamento, imposto PDV, mesas/consumo
- `receiptFooter` → cupom
- `cardFees` → centro financeiro (parcial PDV)
- Créditos IA API
- Usuários admin API
- Tema global
- Importação (modo LS + APIs import)
- NextAuth sessão (Segurança)

### Removidas / descontinuadas na V3

- Nenhuma setting removida do schema nesta auditoria
- **`PlanoSection` efetivamente bypassada** pelo menu (redirect billing)
- **`configuracoes-sistema`** descontinuada na rota (código permanece)

### Futuras / mock explícito

- Formas de pagamento (Vendas)
- Moeda, fuso (Geral)
- Relatório email (Financeiro)
- Preview global PDV (Aparência)
- Permissões granulares (Usuários)
- 2FA, troca senha, sessões (Segurança)
- Marketplace sync (Integrações)
- Certificado A1 emissor NF-e

---

## 11. Referências de código

| Tema | Arquivos |
|------|----------|
| V3 shell | `components/configuracoes-v3/ConfiguracoesV3Page.tsx` |
| Store settings | `lib/store-settings-provider.tsx`, `app/api/stores/[id]/settings/route.ts` |
| PDV layout drift | `PdvSection.tsx`, `vendas-pdv.tsx`, `lib/pdv-classic-layout.ts`, `lib/omnigestao-pdv-modo.ts` |
| Financeiro dual | `FinanceiroSection.tsx`, `lib/centro-financeiro.ts`, `lib/financeiro-store.tsx` |
| Legado config | `lib/config-empresa.tsx`, `components/dashboard/configuracoes/configuracoes-sistema.tsx` |
| IA modelo | `IaSection.tsx`, `app/api/ai/orchestrate/route.ts`, `app/dashboard/ia-mestre/page.tsx` |

---

## 12. Validação desta auditoria

- **Somente leitura** — nenhum arquivo de produto alterado (exceto este relatório).
- **Não executado:** `tsc` / `build` (sem mudança de código).
- **Excluído:** `pdv-github-original/**`, auth, proxy, schema Prisma.

---

*Próximo passo recomendado pelo usuário: implementar P0-1 e P1-1 em PRs pequenos separados.*
