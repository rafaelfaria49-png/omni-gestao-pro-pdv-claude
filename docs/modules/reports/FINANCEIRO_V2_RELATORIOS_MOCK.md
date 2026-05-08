# Financeiro HUB V2 — Aba “Relatórios Financeiros” (mock/local state)

## Objetivo

Ativar a aba **“Relatórios Financeiros”** no Financeiro HUB V2 com **dados mock/local state**, visual premium SaaS, responsivo e compatível com todos os temas do OmniGestão Pro, **sem backend/Prisma/API** e sem alterar tokens globais.

## Modularização segura (continuação)

Para evitar crescer ainda mais o `components/financeiro/lovable/routes/financeiro.tsx`, esta etapa adicionou apenas módulos novos em:

`components/financeiro/lovable/financeiro-v2/`

Nada foi movido/refatorado das abas já prontas.

## O que ficou funcional

### 1) KPIs principais (cards reutilizáveis)

- Receita total
- Despesas totais
- Lucro líquido
- Contas vencidas (mock sobre “previstos” vencidos)
- Recebimentos previstos
- Pagamentos previstos
- Ticket médio (mock)
- Crescimento percentual (mock)

Cada KPI mostra:
- valor principal
- comparação percentual (mock)
- tendência (subiu/desceu/estável)
- ícone
- mini tendência (sparkline)

### 2) Gráficos (Recharts, sem libs novas)

- **Linha temporal**: entradas x saídas por período
- **Pizza**: distribuição por categoria (combustível, vendas, fornecedores, manutenção, serviços, outros)
- **Barras**: receita por carteira (distribuição mock preparada para conciliação futura)
- **Mini tendência**: dentro de cada KPI (sparkline)

Todos usando **tokens** (`var(--color-primary)`, `var(--color-chart-*)`, etc.), sem cores hardcoded.

### 3) Filtros (mock/estado local)

- Período: hoje, 7 dias, 30 dias, mês atual, personalizado (mock)
- Carteira
- Categoria
- Tipo (entrada/saída/recebimento/pagamento/transferência/estorno)
- Status (confirmado/previsto/estornado)

Ao alterar filtros, KPIs e gráficos se recalculam localmente.

### 4) Insights IA (mock)

Seção com insights mockados:
- cada insight tem prioridade
- botões **Gerar ação** (cria item em lista local) e **Ignorar** (remove insight)

### 5) Top categorias

Rankings mockados por período:
- categorias com maior receita
- categorias com maior despesa

### 6) Movimentações importantes

Listas mockadas:
- maiores entradas
- maiores saídas
- previsões/vencimentos próximos

Ações mock:
- duplicar (toast)
- exportar item (toast)

### 7) Exportação mock + histórico local

Botão **“Exportar relatório”** abre modal com:
- formato (PDF/Excel/CSV) mock
- incluir gráficos/movimentações/insights (mock)

Ao exportar:
- toast “relatório exportado (mock)”
- adiciona item no histórico local “Últimas exportações”

## Seeds / origem do mock

Os relatórios derivam de seeds **já existentes** em `financeiro.tsx`:
- `carteiras`
- `movimentacoes`
- `receber`
- `pagar`

Não há dependência de backend.

## Arquivos criados

- `components/financeiro/lovable/financeiro-v2/tabs/RelatoriosFinanceirosTab.tsx`
- `components/financeiro/lovable/financeiro-v2/charts/FinanceiroLinhaChart.tsx`
- `components/financeiro/lovable/financeiro-v2/charts/FinanceiroPizzaChart.tsx`
- `components/financeiro/lovable/financeiro-v2/charts/FinanceiroBarChart.tsx`
- `components/financeiro/lovable/financeiro-v2/cards/KPIFinanceiroCard.tsx`
- `components/financeiro/lovable/financeiro-v2/utils/relatorios-utils.ts`
- `components/financeiro/lovable/financeiro-v2/modals/ExportarRelatorioModal.tsx`
- `docs/FINANCEIRO_V2_RELATORIOS_MOCK.md` (este arquivo)

## Arquivos alterados

- `components/financeiro/lovable/routes/financeiro.tsx` (integração da nova aba via componente modular)

## O que continua mock (por design nesta etapa)

- Persistência real (banco/API)
- Exportação real (geração de arquivo)
- Cálculos contábeis completos (competência, conciliação por carteira real, custo por centro, etc.)
- IA real (insights são seeds mockados)

