---
title: Mocks Tracking — onde ainda há mock no projeto
status: vivo
owner: produto + Sonnet
last_update: 2026-07-18
---

# 🎭 Mocks Tracking

> **Por que este arquivo existe:** um dos inegociáveis da governança é "**nunca criar mocks enganosos que pareçam persistência real**".
> Quando mock for inevitável (UI Lovable, demo, hub novo greenfield), **registrar aqui** para virar dívida controlada.

> **Atualização:** ao criar mock (registrar) ou ao removê-lo (mover para §3).

---

## 1. Convenção

### 1.1 Tipos
- **UI-mock** — componente renderiza dado fake, sem persistência
- **API-mock** — endpoint devolve dado fake (ex: durante desenvolvimento)
- **Seed-mock** — dados de exemplo para demo/onboarding
- **Hub-mock** — HUB inteiro ainda em mock (greenfield ou Lovable)

### 1.2 Risco
- 🔴 alto — usuário confunde com real, decisão errada possível
- 🟡 médio — claramente identificado como demo mas em rota produtiva
- 🟢 baixo — escopo isolado (storybook, dev-only)

### 1.3 Estados
- ⏳ ativo · 🔄 em substituição (sprint ativa) · ✅ removido

---

## 2. Mocks ativos

| # | Local | Tipo | Risco | Estado | HUB | Notas |
|---|---|---|---|---|---|---|
| MOCK-02 | `/dashboard/whatsapp` inbox parcial | UI-mock | 🟡 | ⏳ | WhatsApp | Mensagens reais chegam ao banco, mas inbox UI ainda exibe mock parcial |
| MOCK-03 | Painel inicial — alguns KPI cards | UI-mock | 🔴 | ⏳ | BI | Mocks misturados com dados reais; sem banner identificando |
| MOCK-04 | `/dashboard/operacoes-v2` mock data inicial dos cards | UI-mock | 🟡 | ⏳ | OS | Hidratação real cobre, mas seed inicial vem de mocks Lovable |
| MOCK-05 | `lib/utils.ts` (componentes Lovable) | API-mock | 🟢 | 🚫 | Lovable | **Aceito** — excluído do tsc por design (CLAUDE.md) |
| MOCK-06 | `/dashboard/cadastros-v2` dados de demo | Seed-mock | 🟢 | ⏳ | CRM | Substituídos quando há dados reais |
| MOCK-07 | Marketplace (HUB inteiro) | Hub-mock | 🟢 | ⏳ | Marketplace | Greenfield — não há código, nem mock |
| MOCK-08 | Marketing IA (campanha, atribuição, ROI) | Hub-mock | 🟡 | ⏳ | Marketing IA | Existe gerador de imagens real, mas orquestrador inexistente |
| MOCK-09 | `/dashboard/contador` — seções preview (Documentos, Obrigações, Dossiês, Folha, Portal, Permissões, Timeline, Config) + cartões ilustrativos da Visão Geral | UI-mock | 🟡 | 🔄 | Contador | GOAL 006 realificou **blocos identificados** da Visão Geral e dos Relatórios básicos (read-only por competência). **GOAL 007** substituiu o checklist fictício da seção **Fechamento** por sinais derivados do DTO real (estados ok/atenção/pendente/não disponível; sem percentual inventado; CTA «Fechar competência» desabilitado até GOAL 012). **GOAL 007B** alinhou a semântica: checklist derivado read-only dos dados do GOAL 006 (carga única) — vendas sem movimento ficam **pendentes**; sessões respeitam competência **passada/atual/futura** (via `agora`); **vencimento de títulos permanece não disponível** sem prova agregada; **Fiscal, Documentos e Conferência** permanecem não disponíveis; fechamento oficial permanece **pendente** até o GOAL 012. Não é fechamento real. O card «3 de 9 / 35%» da Visão Geral e o badge do header foram **rotulados como Preview ilustrativo** (não representam o checklist real). O array `FECHAMENTO_CHECKLIST` em `contador-preview-data.ts` está **sem uso runtime** (código morto P3). **GOAL 008** tornou o **Pacote do Contador** real: gerado sob demanda (ZIP com CSVs reais derivados do DTO do GOAL 006 + resumo + índice + avisos/pendências do checklist do GOAL 007 + `manifest.json` com sha256/tamanho de cada arquivo) via endpoint interno autenticado `GET /api/contador/pacote` — **sem storage, sem persistência, sem snapshot**; XML fiscal e documentos anexos seguem como **placeholders honestos** dentro do pacote. O antigo `PacoteCard`/`PACOTE_ITEMS_*` (lista ilustrativa + botão desabilitado) foi **removido** em favor do download real (`contador-pacote-download.tsx`). **GOAL 008B** reconciliou o contrato do pacote: estrutura fixa de 14 arquivos (00-LEIA-ME/01-VENDAS/02-FINANCEIRO/03-CAIXA/04-DOCUMENTOS/05-XML + manifest.json), **CSVs detalhados por fonte** (linha a linha, RFC 4180 vírgula, PII minimizada) via adapter `carregar-fontes.ts` (carga única read-only, 8 queries), manifesto canônico `omni.contador.pacote.manifest/v1` (storeId só em `competencia.storeId`, período UTC, geradoPor pseudônimo), estados/contagens por fonte, limites + 413, endpoint com validação estrita (rejeita storeId/lojaId na query, `c` inválida → 400) e download **GET direto sem blob**. **GOAL 008C/008D** fecharam a integridade da carga do pacote: paginação real por cursor (páginas de 500), timeout lógico (503), títulos recortados por competência, **limite por fonte aplicado às linhas CRUAS antes da filtragem** (MAX+1 lança `PacoteLimiteExcedidoError` → 413; linha filtrável não burla o teto), **contagem de queries dinâmica** (cada página e cada lote de Produto contam, sem número fixo), **lookup de Produto em lotes de 500** (nenhum `id: { in: [...] }` recebe todos os ids; falha de lote é parcial e explícita, sem contaminar vendas), e **vendas canceladas fora de `vendas.csv`/`itens.csv`** (permanecem apenas no agregado informativo `canceladasTotal`/`canceladasQuantidade` do GOAL 006). Demais seções seguem preview honesto com banner. |

---

## 3. Mocks removidos (histórico)

| # | Local | Removido em | Sprint que removeu |
|---|---|---|---|
| MOCK-01 | `/dashboard/financeiro-v2` (views Lovable) | ~2026-05 (pré-baseline) | migração FinanceiroRealProvider (real-data); confirmado no R0-L5 |

> **Obs. MOCK-01 (R0-L5):** UI plugada a dados reais (sem dataset fake; sem fallback). **DRE / Fluxo de caixa**: dados conectados, mas **evolução visual/funcional pendente** (`ROADMAP_FINANCEIRO`) — maturidade de UI, não mock.

---

## 4. Regras para criar mock (quando inevitável)

1. **Sempre** banner visual no componente: `[DADOS DEMO — não refletem realidade]`.
2. **Sempre** registrar aqui com tipo + risco + sprint para substituição.
3. **Nunca** mock que cria registros no banco "que parecem reais" — ou é real, ou não vai pro banco.
4. **Nunca** mock em fluxo que envolve dinheiro, fiscal ou multi-loja.
5. Se mock vai durar > 1 sprint, vira **dívida técnica** em `DIVIDA_TECNICA.md`.

---

## 5. Verificação periódica

- A cada encerramento de sprint, revisar §2 — algum mock pode ser removido?
- A cada release pública, garantir 0 MOCKs com risco 🔴 ativos.
- Auditoria trimestral varre o código por strings `mock`, `fake`, `dummy`, `seed`, `lorem`.

---

## 6. Fonte da verdade

- **Tracking de mocks:** este arquivo.
- **Dívida (mock que vira dívida):** `DIVIDA_TECNICA.md`.
- **Regra inegociável:** `docs/governance/GOVERNANCA.md` ("nunca criar mocks enganosos").
