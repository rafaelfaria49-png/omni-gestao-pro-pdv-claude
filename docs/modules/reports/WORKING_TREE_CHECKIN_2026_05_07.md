# Working tree check-in — 2026-05-07

**Objetivo:** analisar e organizar o estado atual do working tree após:
- reorganização de `docs/`
- normalização de status (Operações HUB V2)
- anexos persistentes (IndexedDB)
- check-ins de faturamento
- adapter OS → `ContaReceberTitulo` (Prisma)

**Regras desta etapa:** sem commit, sem descartar, sem apagar, sem refatorar.

---

## 1) `git status --short` (snapshot)

### 1.1 Modificados (tracked)

- `app/actions/operacoes.ts`
- `components/operacoes/lovable/api/os.ts`
- `components/operacoes/lovable/components/operacoes/AnexosPanel.tsx`
- `components/operacoes/lovable/components/operacoes/Timeline.tsx`
- `components/operacoes/lovable/store/osStore.tsx`
- `components/operacoes/lovable/types/os.ts`
- `docs/ai/CURRENT_STATUS.md`
- `tsconfig.tsbuildinfo` (**suspeito**: artefato de build; geralmente não deve ir para commit)

### 1.2 Deletados (tracked)

- `docs/FINANCEIRO_ANALISE_MASTER.md`
- `docs/FINANCEIRO_V2_NORMALIZACAO_VISUAL.md`
- `docs/MEMORIA_PROJETO_OMNIGESTAO.md`
- `docs/Untitled`
- `docs/sidebar-page-routes.md`

### 1.3 Untracked (novos)

- `components/operacoes/lovable/services/` (pasta)
- `components/operacoes/lovable/utils/` (pasta)
- `lib/financeiro/` (pasta)
- `docs/START_HERE.md`
- `docs/PROJECT_MASTER.md`
- `docs/OPERACOES_HUB_V2_PAINEL_CHECKIN.md`
- `docs/ai/AGENT_HUB.md`
- `docs/ai/AI_BUSINESS_RULES.md`
- `docs/ai/AI_SYSTEM.md`
- `docs/ai/INBOX_NOTES.md`
- `docs/ai/WHATSAPP_AI.md`
- `docs/architecture/` (pasta)
- `docs/changelog/` (pasta)
- `docs/future-ideas/` (pasta)
- `docs/modules/` (pasta)
- `docs/roadmap/` (pasta)
- `docs/themes/` (pasta)

---

## 2) Agrupamento por categoria (interpretação)

### 2.1 Docs / memória (reorganização)

**Untracked / novos na árvore `docs/`:**
- `docs/START_HERE.md`, `docs/PROJECT_MASTER.md`
- `docs/ai/*` (AGENT_HUB, AI_SYSTEM, INBOX_NOTES, WHATSAPP_AI, etc.)
- `docs/architecture/*`, `docs/themes/*`, `docs/roadmap/*`, `docs/future-ideas/*`
- `docs/modules/*` e `docs/modules/reports/*`

**Deletados no root `docs/` (provável “movido para módulos/reports”):**
- `docs/FINANCEIRO_ANALISE_MASTER.md` → existe substituto em `docs/modules/reports/FINANCEIRO_ANALISE_MASTER.md`
- `docs/FINANCEIRO_V2_NORMALIZACAO_VISUAL.md` → existe substituto em `docs/modules/reports/FINANCEIRO_V2_NORMALIZACAO_VISUAL.md`
- `docs/sidebar-page-routes.md` → existe substituto em `docs/architecture/SIDEBAR_PAGE_ROUTES.md`
- `docs/Untitled` → conteúdo foi importado para `docs/ai/INBOX_NOTES.md` (referência explícita no arquivo)

**Atenção:** `docs/MEMORIA_PROJETO_OMNIGESTAO.md` aparece como deletado; ainda precisa confirmar se foi substituído por `START_HERE`/`PROJECT_MASTER` ou se era conteúdo único.

### 2.2 Operações HUB V2 — status normalization

**Prováveis arquivos do bloco:**
- `app/actions/operacoes.ts` (ajustes de payload/operacaoStatus)
- `components/operacoes/lovable/utils/` (untracked — contém `utils/os-status.ts` e afins)
- `docs/modules/reports/OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`

### 2.3 Operações HUB V2 — anexos persistentes

**Prováveis arquivos do bloco:**
- `components/operacoes/lovable/components/operacoes/AnexosPanel.tsx`
- `components/operacoes/lovable/api/os.ts`
- `components/operacoes/lovable/store/osStore.tsx`
- `components/operacoes/lovable/types/os.ts` (tipos de anexo/eventos)
- `components/operacoes/lovable/services/` (untracked — serviços de anexos + IndexedDB)
- `docs/modules/reports/OPERACOES_HUB_V2_ANEXOS_REAL.md`

### 2.4 Operações HUB V2 — faturamento check-in + adapter OS → contas a receber

**Check-in (docs):**
- `docs/modules/reports/OPERACOES_HUB_V2_FATURAMENTO_CHECKIN.md`

**Adapter (código):**
- `lib/financeiro/adapters/os-faturamento.ts` (untracked)
- `app/actions/operacoes.ts` (integração `updateOSPayload` → upsert/cancel idempotente)
- `components/operacoes/lovable/types/os.ts` (novos `EventoTipo` financeiros)
- `components/operacoes/lovable/components/operacoes/Timeline.tsx` (render/ícones)
- `docs/modules/reports/OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md`

### 2.5 Financeiro V2 (Lovable mock)

Não há mudanças diretas listadas no status para `components/financeiro/lovable/*` nesta snapshot.

### 2.6 Arquivos deletados/movidos (conclusão)

Os deletados em `docs/` **têm substitutos visíveis** no novo layout, com exceção de `docs/MEMORIA_PROJETO_OMNIGESTAO.md` que precisa de checagem manual de conteúdo para confirmar substituição total.

### 2.7 Untracked (conclusão)

Há muita coisa untracked, principalmente a nova árvore `docs/` e as pastas `components/operacoes/lovable/services|utils` e `lib/financeiro`.
Isso sugere que a reorganização de docs + novos módulos foram adicionados mas ainda não foram stageados/committed.

### 2.8 Mudanças suspeitas

- `tsconfig.tsbuildinfo`: artefato gerado pelo TypeScript incremental build; em geral não é desejável versionar.
  - Recomendação: confirmar se está em `.gitignore`; se não estiver, considerar ignorar (mas **não** alterar agora, só anotar).

---

## 3) Arquivo importante deletado sem substituição?

**Substituições confirmadas por presença no novo layout:**
- `docs/FINANCEIRO_ANALISE_MASTER.md` → `docs/modules/reports/FINANCEIRO_ANALISE_MASTER.md` (existe)
- `docs/FINANCEIRO_V2_NORMALIZACAO_VISUAL.md` → `docs/modules/reports/FINANCEIRO_V2_NORMALIZACAO_VISUAL.md` (existe)
- `docs/sidebar-page-routes.md` → `docs/architecture/SIDEBAR_PAGE_ROUTES.md` (existe)
- `docs/Untitled` → conteúdo incorporado em `docs/ai/INBOX_NOTES.md` (referenciado)

**Pendência de verificação de conteúdo:**
- `docs/MEMORIA_PROJETO_OMNIGESTAO.md` (deletado). Existe `docs/START_HERE.md` + `docs/PROJECT_MASTER.md`, mas é preciso confirmar se o conteúdo antigo foi absorvido.

---

## 4) Estrutura atual de `docs/` (sanidade)

Estrutura presente (alto nível):
- `docs/START_HERE.md`
- `docs/PROJECT_MASTER.md`
- `docs/ai/`
- `docs/architecture/`
- `docs/themes/`
- `docs/roadmap/`
- `docs/future-ideas/`
- `docs/modules/`
  - `docs/modules/reports/`

Isso está coerente com a proposta de “memória técnica central” e com a indexação do `START_HERE`.

---

## 5) Relatórios técnicos em `docs/modules/reports/`

Confirmados na pasta:
- Financeiro: `FINANCEIRO_ANALISE_MASTER.md`, `FINANCEIRO_V2_*`
- Operações: `OPERACOES_HUB_V2_CHECKIN.md`, `OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`, `OPERACOES_HUB_V2_ANEXOS_REAL.md`
- Faturamento/adapter: `OPERACOES_HUB_V2_FATURAMENTO_CHECKIN.md`, `OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md`
- (este) `WORKING_TREE_CHECKIN_2026_05_07.md`

Observação: existe um arquivo `docs/OPERACOES_HUB_V2_PAINEL_CHECKIN.md` no root (untracked) que parece ser relatório técnico antigo/nome anterior; ideal é ficar também em `docs/modules/reports/` (mas não mover nesta etapa).

---

## 6) Recomendações de commits lógicos (sem commitar)

> Objetivo: reduzir risco e facilitar review. A ordem abaixo assume commits pequenos e temáticos.

### Commit 1 — “Docs: reorganização da memória”

Incluir:
- criação da árvore `docs/` (START_HERE, PROJECT_MASTER, ai/, architecture/, themes/, roadmap/, modules/)
- moves equivalentes (deletar root antigos e adicionar novos paths sob `docs/modules/reports/`)
- `docs/changelog/CHANGELOG.md`

Revisão importante:
- confirmar substituição de `docs/MEMORIA_PROJETO_OMNIGESTAO.md` antes de incluir o delete

### Commit 2 — “Operações HUB V2: normalização segura de status”

Incluir:
- `components/operacoes/lovable/utils/os-status.ts` (e demais `components/operacoes/lovable/utils/*`)
- alterações em `app/actions/operacoes.ts` relacionadas a `payload.operacaoStatus`
- docs do relatório: `docs/modules/reports/OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`

### Commit 3 — “Operações HUB V2: anexos persistentes (IndexedDB)”

Incluir:
- `components/operacoes/lovable/services/anexos/*`
- alterações em `AnexosPanel.tsx`, `api/os.ts`, `osStore.tsx`, `types/os.ts`, `Timeline.tsx` (somente o que for de anexos)
- doc: `docs/modules/reports/OPERACOES_HUB_V2_ANEXOS_REAL.md`

### Commit 4 — “Operações HUB V2: faturamento payload check-in”

Incluir:
- doc: `docs/modules/reports/OPERACOES_HUB_V2_FATURAMENTO_CHECKIN.md`

### Commit 5 — “Operações HUB V2: adapter OS → Contas a Receber (Prisma)”

Incluir:
- `lib/financeiro/adapters/os-faturamento.ts`
- alterações em `app/actions/operacoes.ts` (sync idempotente no `updateOSPayload`)
- eventos de timeline financeiros (`components/operacoes/lovable/types/os.ts` + `Timeline.tsx`)
- doc: `docs/modules/reports/OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md`

### Commit 6 — “Docs vivos: atualização de estado”

Incluir:
- `docs/modules/OPERACOES.md`, `docs/modules/FINANCEIRO.md`, `docs/ai/CURRENT_STATUS.md`, `docs/changelog/CHANGELOG.md`

### Commit X — “Higiene: artefatos locais”

Separar:
- `tsconfig.tsbuildinfo` (idealmente fora do git; revisar `.gitignore`)

---

## 7) Validações (executadas)

- `npm run lint`: **OK** (0 errors; warnings existentes no repo)
- `npx tsc --noEmit`: **OK**
- `npx next build --webpack`: **OK**

---

## 8) Riscos encontrados

- **Docs deletados vs substituição**: `docs/MEMORIA_PROJETO_OMNIGESTAO.md` está deletado; precisa confirmar se não havia conteúdo único que não migrou.
- **Arquivo gerado**: `tsconfig.tsbuildinfo` modificado pode poluir futuros commits.
- **Untracked grande**: muitos arquivos/pastas novas; o risco principal é misturar temas (docs + código) em um commit único e dificultar review.

