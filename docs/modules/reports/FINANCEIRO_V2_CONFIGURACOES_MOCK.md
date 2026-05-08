# Financeiro HUB V2 — Aba “Configurações Financeiras” (mock/local state)

## Objetivo

Ativar a aba **“Configurações Financeiras”** no Financeiro HUB V2 com **estado local/mock**, mantendo a modularização segura em `components/financeiro/lovable/financeiro-v2/`, sem backend/Prisma/APIs e sem alterar tokens globais ou quebrar as abas já prontas.

## O que ficou funcional (mock)

### 1) Categorias financeiras

- Listas separadas de **receita** e **despesa**
- Ações: **criar**, **editar**, **excluir**, **ativar/desativar**
- Campos mock: **ícone** (`iconKey`) e **cor via token** (`colorVar`)
- Tudo em estado local, com feedback via toast e registro em auditoria

### 2) Formas de pagamento

- Seeds: dinheiro, pix, cartão débito/crédito, boleto, transferência, crediário
- Ações: **criar**, **editar**, **ativar/desativar**
- **Carteira padrão** por forma (mock)

### 3) Carteira padrão (por operação)

- Seleção local para:
  - vendas
  - recebimentos
  - pagamentos
  - transferências
- Atualiza estado local e adiciona item na auditoria

### 4) Juros e multa

- Regra mock:
  - multa padrão (%)
  - juros diário (%)
  - dias de tolerância
  - regra para vencidas
- Modal dedicado com **preview de cálculo** (mock)

### 5) Recibo financeiro

- Texto padrão
- Toggles mock:
  - incluir logo
  - incluir assinatura
  - incluir observações
- Preview visual do recibo dentro da aba

### 6) Integrações internas (mock)

Cards com switches funcionais (estado local):
- PDV gera entrada automática
- OS aprovada gera conta a receber
- OS entregue gera faturamento
- Estoque baixo gera alerta financeiro
- Marketplace gera contas/recebimentos

### 7) Permissões financeiras (mock)

Perfis:
- Admin, Gerente, Caixa, Vendedor

Permissões (switches funcionais):
- ver financeiro
- criar/editar/excluir lançamento
- estornar
- exportar relatório
- alterar configurações

### 8) Auditoria local

Cada ação relevante adiciona registro local com:
- tipo do evento
- detalhe
- data/hora
- usuário mock

### 9) Botões principais

- **Salvar configurações**: toast + auditoria
- **Restaurar padrão**: reseta todo o estado local + auditoria
- **Exportar configuração**: abre modal com JSON mock + opção de copiar

## Modularização segura

Esta etapa adicionou apenas módulos novos dentro de `financeiro-v2/` e integrou na aba via wrapper no `financeiro.tsx`.

## Arquivos criados

- `components/financeiro/lovable/financeiro-v2/tabs/ConfiguracoesFinanceirasTab.tsx`
- `components/financeiro/lovable/financeiro-v2/modals/CategoriaFinanceiraModal.tsx`
- `components/financeiro/lovable/financeiro-v2/modals/FormaPagamentoModal.tsx`
- `components/financeiro/lovable/financeiro-v2/modals/RegraJurosMultaModal.tsx`
- `components/financeiro/lovable/financeiro-v2/utils/configuracoes-utils.ts`
- `docs/FINANCEIRO_V2_CONFIGURACOES_MOCK.md` (este arquivo)

## Arquivos alterados

- `components/financeiro/lovable/routes/financeiro.tsx` (integração da aba para usar o módulo novo)

## O que continua mock (por design)

- Persistência real (banco/API)
- Aplicação automática de regras em títulos reais
- Exportação real de arquivo de configuração
- Integrações reais com PDV/OS/Estoque/Marketplace

