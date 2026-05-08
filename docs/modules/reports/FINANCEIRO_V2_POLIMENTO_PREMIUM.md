# Financeiro HUB V2 — Polimento premium (mock)

## Objetivo

Elevar a experiência do Financeiro HUB V2 (ainda **100% mock/local state**) com acabamentos premium, **sem backend/Prisma/APIs**, sem alterar tokens globais e sem quebrar as abas existentes.

## Melhorias aplicadas nesta etapa

### 1) Estados vazios premium

Foram adicionados empty states reutilizáveis (`EmptyState`) em pontos críticos:

- **A pagar**: quando não há contas no filtro atual
- **A receber**: quando não há títulos no filtro atual
- **Relatórios**: quando não há exportações
- **Configurações**: quando não há categorias e/ou formas de pagamento

Cada empty state contém:
- ícone
- título
- descrição
- botão de ação (mock) quando aplicável

### 2) Busca global financeira (mock)

Foi adicionado campo de busca no topo do Financeiro HUB V2 para pesquisar, de forma mock, em **seeds globais**:
- contas a pagar (`pagar`)
- contas a receber (`receber`)
- carteiras (`carteiras`)
- movimentações (`movimentacoes`)

Resultado aparece em dropdown e, ao clicar, navega para a aba correspondente (Tabs controlados).

### 3) Modo compacto (persistido em localStorage)

Foi adicionado toggle para alternar:
- `comfortable`
- `compact`

Persistência:
- `omnigestao:financeiro-v2:view-mode`

Aplicação: reduz o espaçamento vertical das Tabs (`space-y-4` → `space-y-3`).

### 4) Onboarding contextual (persistido em localStorage)

Banner discreto para orientar configuração inicial do módulo, com:
- “Ir para configurações”
- “Ocultar”

Persistência:
- `omnigestao:financeiro-v2:onboarding-hidden` (1/0)

## Modularização adicional (segura)

Sem refatorar abas antigas, foram adicionados apenas utilitários/peças reutilizáveis em `financeiro-v2/`:

- `components/financeiro/lovable/financeiro-v2/components/EmptyState.tsx`
- `components/financeiro/lovable/financeiro-v2/utils/prefs.tsx`

O restante das abas não foi movido nesta etapa.

## Pontos que continuam mock

- Persistência real e sincronização entre abas (cada aba mantém seu state local)
- Skeleton/loading avançado e drawer rico de detalhes (planejado para próxima etapa)
- Tooltips ajuda contextual em todas as ações (planejado)
- Atalhos financeiros acionando modais cross-aba (planejado)

## Próximos passos ideais

- Introduzir um store local (context/zustand) do Financeiro V2 para compartilhar estados entre abas sem backend
- Expandir loading/skeleton com delays curtos por ação/filtro
- Adicionar tooltips/help e drawers ricos de detalhes para contas/movimentações/exportações
- Implementar atalhos “Nova conta a pagar/receber”, “Movimentação”, “Transferência”, “Exportar”

## Validação

- `npm run lint`: OK (warnings já existentes no repo)
- `npx tsc --noEmit`: OK
- `npx next build --webpack`: OK

