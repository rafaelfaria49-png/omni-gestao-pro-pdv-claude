# OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001 — auditoria e contrato de entrega

Base da publicação: `51265894a8a019fbd5e679003de0b08dd95feba9` (`origin/main`, fetch em 16/11/2026). Auditoria inicial em `cdce14a3d049e1977ecd295a4b0d15c501dc995e`; comparação atualizada antes do push.
Branch: `codex/omni-relatorios-hub-enterprise-real-001`.
Worktree de publicação: `.worktrees/omni-relatorios-publicacao-001`. Worktree e commits iniciais preservados localmente em `codex/relatorios-preservado-20261116`.
Nenhuma alteração das outras worktrees foi incorporada. AEP é opt-in; esta worktree não tem `.aep-active` e não existe trilha registrada para este GOAL. Não foram criados/liberados gates nem editados ledger, registry ou state.

Atualização de compatibilidade: a main atual contém as PRs #350 (revogação por sessão), #348 (Electron) e Vestuário P02. Seus arquivos e comportamentos permanecem intactos neste delta. A revogação global proposta na cadeia inicial não será publicada. A QA de logout usa o mecanismo da #350 com flag ligada apenas no banco sintético local. Artefatos gerados, bancos, credenciais e arquivos de ambiente ficam fora dos commits publicados.

## Inventário da base

| Superfície | Classificação | Evidência / consequência |
| --- | --- | --- |
| Central `app/dashboard/relatorios/RelatoriosHubGrid.tsx` | PARCIAL | Caixa, histórico de vendas e Financeiro são links funcionais. Outros sete relatórios são ROADMAP com modal; não são relatórios implementados. Preservar os três links. |
| Produtos mais vendidos na main | ROADMAP | A rota e o serviço da PR #318 ainda não estão integrados. |
| Histórico de vendas, devoluções e caixa | REAL | `Venda`, `ItemVenda`, `DevolucaoVenda`, `ItemDevolucaoVenda`, sessões de caixa e APIs existentes. Não modificar escritores do PDV/F8. |
| Fluxo financeiro existente | PARCIAL | `fluxo-caixa-service.ts` lê ledger e títulos; recorte fixo e saldos previstos exigem revisão de pagamentos parciais. Não somar Venda.total como recebimento. |
| DRE existente | PARCIAL | `dre-service.ts` classifica compras/estoque como custo e deriva lucro/margem sobre movimentos de caixa. Não fornece CMV histórico nem DRE contábil por competência. Nova central deve declarar essa insuficiência. |
| Clientes / Cadastros HUB | REAL / PARCIAL | Cadastro Prisma real. `totalSpent` e `lastPurchaseAt` são auxiliares e não substituem agregação das vendas. Identidade por FK, sem unir nomes/telefones. |
| Custos e categorias | REAL / BLOQUEADO_POR_FONTE | Cadastro e categorias existem; custo atual de Produto não prova custo histórico de ItemVenda. Margem, CMV e lucro dependentes ficam indisponíveis. |
| Operações V3/V4 | REAL / PARCIAL | Ambas usam `ordens_servico` e payload canônico; contar cada ID uma vez. Enum Prisma colapsa estados: usar payload.status reconhecido. Não hidratar SLA a partir de updatedAt. Datas operacionais têm precisão explícita. |
| Técnicos | REAL / PARCIAL | Cadastro `tecnicos`; atribuição no payload da OS. Sem vínculo confiável, agrupar como não atribuído. Sem metas/satisfação/comissões inventadas. |
| WhatsApp HUB | PARCIAL / MOCK | Mensagens Meta possuem externalMessageId; seed/demo e gravação local sem envio também coexistem. Logs `automation_simulation*` são simulação e não execução. Não contar como tráfego externo confirmado. Sem eventos de encerramento histórico e entrega/falha completos. |
| Permissões enterprise | REAL | Sessão, `canAccessStore`, `canUseModule`, `getPermissionsFromSession` e guards existentes. Exportação exige mesmas ACLs do relatório e permissão financeira específica quando aplicável. |
| Service Worker | REAL / PARCIAL | main já inclui NetworkOnly para `/api/dashboard/`, `/api/vendas/`, financeiro e caixa, além de expurgo na ativação. Revalidar worker gerado; respostas privadas da central não devem entrar no cache nem no navegador. |

## PR #318 — reaproveitamento seletivo

PR: https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/318
Head: `cc67ad785324f189a1ac72cbcec3288b8e71b0dd`. Aberta, não merged e com conflitos informados pelo GitHub.
Checks Vercel consultados: success nos dois projetos. Reviews e threads formais: vazios. A revisão independente mencionada no corpo é evidência declarada pelo autor, não uma aprovação formal do GitHub.

Reutilizar o cálculo puro e testes de produtos (identidade ID → SKU → barcode, cancelamentos excluídos, devolução limitada por venda/produto, diferença de desconto não rateado explícita). Revisar consulta: a PR carrega devoluções posteriores sem teto temporal, mesmo fora da coorte. Restringir por JOIN com vendas da loja/coorte, sem copiar esse padrão. A proteção PWA da main é posterior e mais abrangente: preservar, sem sobrescrever `next.config.mjs` com a versão da PR. Não duplicar telas de produtos.

## Contratos de precisão

- Produtos: coorte por data da venda; devoluções vinculadas independentemente da data. Quantidades e valores limitados ao vendido, canceladas separadas. Desconto geral sem rateio não vira receita líquida efetiva por item. Catálogo excluído permanece histórico; SKU antigo sem identidade persistida fica sem associação, sem adivinhação.
- Caixa: realizados exclusivamente em `movimentacoes_financeiras`; títulos só como previsão do saldo restante comprovado pelo histórico. Transferências internas neutras no consolidado, visíveis por carteira. Sangria/suprimento são movimentos de tesouraria, sem receita/despesa fictícia. Saldo significa saldo do ledger coberto, não saldo bancário conciliado.
- DRE: demonstração gerencial parcial, regime de caixa identificado. Recebimentos, reversões e pagamentos classificados são fatos de caixa. CMV, competência, impostos, depreciação, EBITDA e lucros sem cobertura integral: indisponíveis. Compra de estoque nunca é rotulada CMV.
- Clientes: vendas por FK da mesma loja. Sem identificação e vínculos inconsistentes separados. Cadastro ativo é `Cliente.active`; recorrente ≥2 compras não canceladas no recorte; sem compra recente tem janela explícita. Dados pessoais de contato/documento não são exportados.
- OS: coorte de cadastro, estados do payload quando reconhecidos, datas efetivas somente quando válidas e com precisão suficiente. Orçamento não aprovado não é faturamento. Recebimento só com vínculo financeiro comprovado. Contagem única por ID, independente de V3/V4.
- WhatsApp: separar registros locais de mensagens com ID externo. Simulações de automação não contam como execução. Sem API externa, campanha ou envio neste GOAL. Métricas sem telemetria consistente ficam indisponíveis com motivo.

## Entrega e validação

Separar PRs por contratos/API e módulos/interface; sem merge automático e sem publicação Production. Todas ficam em revisão até testes reais, revisão independente e CI verde.
QA: PostgreSQL local descartável, schema inalterado, massa exclusivamente sintética, URLs loopback validadas antes de qualquer escrita. Confrontar agregados com SQL independente. Testes mockados provam guards/estados, não integração PostgreSQL.
Validar permissões, duas lojas, cancelamentos, devoluções parciais, pagamentos parciais, vencidos, transferências, sangria/suprimento, OS, falta de identidade, catálogo excluído/SKU, corrida de troca/logout, exportações, volume, temas, mobile e SW real. Resultado e lacunas serão registrados em `REPORT.md`.

PRODUCTION_WRITES=0
PRODUCTION_MIGRATIONS=0
MERGE_EXECUTED=NO
