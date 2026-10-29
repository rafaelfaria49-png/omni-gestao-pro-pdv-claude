# Venda manual em KG — MVP local, liberação produtiva pendente

Missão: PDV-PADARIA-VENDA-MANUAL-KG-MVP-001. Base isolada: PR #315, 104d768d7b7497fe34e2872f4253c4fd97feb5bb. Sem merge de main, push, Preview, deploy ou conexão produtiva. Este documento é independente do runbook A5 da frente de estoque.

## Contrato e arquitetura

O Clássico normal e rápido usam o mesmo modal manual, catálogo e finalização existentes. A interface conserva identidade, componentes e permissões A01/STORE. Peso em quilogramas aceita vírgula e no máximo três casas; o total do item fica visível antes de adicionar. O controle Alterar quantidade (F4) identifica KG e valida o peso. UN continua inteiro. A leitura de dispositivo e o visor da PR #322 não participam da venda.

A indicação de capacidade do catálogo é somente apresentação. O servidor lê a declaração comercial e o preço real de Produto sob lock. Não autoriza KG pelo booleano do navegador. G, declaração inválida, KG apresentado como UN/avulso e outros PDVs continuam bloqueados. Para KG, preço cadastrado precisa ser positivo e expresso em centavos.

O protocolo aditivo manualKgSale=classic-manual-kg-v1 acompanha a tentativa persistida e o reenvio. Ausente, permanecem os guards inteiros legados. Os writers V1/V2 compartilham upsertVendaInTransaction; V2 conserva clientSaleId e alocação transacional. A fingerprint distingue milésimos de quantidade e valida centavos antes do replay. Uma venda confirmada pode ser relida/reconciliada sem novo efeito mesmo quando a capacidade foi desligada.

Quantidades são calculadas em milésimos inteiros (gramas); dinheiro em centavos. Multiplicação usa BigInt e arredondamento half-up uma vez por item. Agregação de duas linhas 0,100 + 0,200 baixa 0,300 sem somar doubles. Saldo, depósito e livro usam o boundary da #315 com FOR UPDATE e idempotência. Preço, total do item, total da venda, descontos e pagamentos precisam ser coerentes; erro desfaz a transação inteira. O estado PENDING conserva identidade e não antecipa efeitos econômicos locais.

## Schema

Nova migration separada: prisma/migrations/20261029120000_manual_kg_sale_quantity/migration.sql. Apenas venda_itens.quantidade passa de integer para double precision, alinhada ao contrato numérico de estoque da #315. Históricos UN, inclusive 2147483647, são preservados sem backfill. Itens de devolução permanecem Int e não são usados para KG.

Aplicação e prova realizadas exclusivamente em PostgreSQL 17 descartável, 127.0.0.1:55479, database manual_kg_sale_isolated, role manual_kg. O runner verifica URL exata, identidade de catálogo, ausência de arquivos .env e banco fresco. Ele monta schema anterior com as seis colunas Int, semeia histórico UN, aplica a migration original #315 sem alterá-la e a migration desta venda separadamente, e compara valores antes/depois.

## Capacidade e limites

Desativada por padrão. São necessários CUMULATIVAMENTE:

1. PDV_MANUAL_KG_RELEASE com o identificador exato desta missão.
2. PDV_MANUAL_KG_STORES com allowlist explícita de lojas (sem curinga).
3. As seis colunas de estoque e item de venda no schema ativo devem ser double precision.
4. Request do protocolo manual Clássico e declaração real KG válida no servidor.

Não há flag pública NEXT_PUBLIC nem opção de configuração no navegador que habilite a venda. Este trabalho não configurou essas variáveis fora dos processos locais sintéticos.

O MVP admite desconto percentual/em reais existente; soma o desconto em centavos. Acréscimo de imposto estimado no carrinho KG não foi adaptado e é recusado explicitamente. Nenhuma integração fiscal ou de balança física foi implementada.

## Pós-venda e recuperação

Cancelamento integral autorizado usa os guards normais de sessão, loja, permissão, step-up por venda, período e recebíveis. Repõe exatamente os milésimos persistidos pelo boundary de estoque e mantém idempotência. Quantidade histórica zero é ignorada e o domínio Int histórico continua válido.

Devoluções parciais, troca/vale por devolução de venda KG e correção posterior de itens permanecem BLOQUEADAS no servidor e na devolução local, inclusive para pesos inteiros. ItemDevolucaoVenda e as rotinas de crédito/devolução ainda têm contratos inteiros; liberá-las exige evolução transacional própria, limites por item original e prova financeira/concorrente. Não arredondar nem reapresentar KG como UN.

Recuperação histórica/quarentena que criaria uma venda KG ausente também é bloqueada. Seu planejamento ainda arredonda quantidades; não pode baixar estoque com esse plano. Reenvio da mesma tentativa e releitura de venda já confirmada usam os writers normais e continuam idempotentes. Estes bloqueios são impeditivos de liberação comercial ampla até haver decisão operacional expressa e/ou implementação correspondente.

## Plano próprio de rollout — somente planejamento

Nada abaixo foi executado em produção. Exige autorização específica e aprovação desta migration e do release após E2E/revisão.

1. Confirmar publicação/schema compatível da #315, estado real das migrations e conclusão do rollout da outra frente. Não inferir isolamento de Preview por herança do override da branch #315.
2. Resolver/aceitar formalmente os limites de pós-venda, recuperação e imposto estimado. Aprovar a matriz A01/STORE e o resultado dos testes deste head.
3. Manter a capacidade KG desligada. Bloquear TODAS as escritas de venda e pós-venda durante a troca de clientes e schema, inclusive avulsos/serviços que não passam pela baixa de estoque. STOCK_WRITES_FROZEN sozinho não protege ItemVenda nesses caminhos.
4. Drenar transações, filas e tentativas offline; remover/impedir acesso a URLs/deployments/clientes antigos que usam Prisma Int em ItemVenda. Não basta atualizar o domínio principal. Verificar PWA e sessões antes de reabrir tráfego.
5. Publicar servidores/PDVs compatíveis enquanto o tráfego de escrita permanece bloqueado. Aplicar a migration própria aprovada com lock, retrato e comparação dos valores históricos na mesma transação; abortar diante de qualquer diferença. Registrar hashes e autoridade da migration.
6. Conferir os seis tipos, dados UN históricos, vínculo produto/depósito/livro, reenvios e caixa. Não usar uma venda comercial real como teste automático.
7. Reabrir UN com todos os clientes compatíveis. Só habilitar a allowlist KG mediante autorização específica e acompanhamento operacional aprovado. Nenhuma habilitação automática no deploy.
8. Se houver incidente, desligar imediatamente a capacidade e conter escritas. Não voltar a binários Prisma Int sobre schema double. Recuo de schema só pode ser estudado se não existir nenhuma quantidade fracionada nem cliente incompatível; não truncar históricos.

## Reprodução local

Use Node 24 do projeto e PostgreSQL descartável próprio. Nunca carregar .env da worktree principal ou credenciais Neon.

- DATABASE_URL e DIRECT_URL: postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated
- MIGRATION_AUTHORITY_ENABLED=false
- node scripts/pdv/run-manual-kg-tests.mjs (banco fresco obrigatório)
- npm run build (confirmar MIGRATION_SKIPPED e PROXY_PRISMA_ARTIFACT_VERIFIED)
- node scripts/pdv/run-manual-kg-e2e.mjs (contas, senhas e PIN sintéticos em memória; localhost:31479)

Relatórios brutos ficam em test-results/manual-kg (gitignored); o relatório resumido desta missão fica em docs/ai-execution/_evidence/PDV-PADARIA-VENDA-MANUAL-KG-MVP-001. Não publicar senhas, cookies, tokens ou logs de sessão.
