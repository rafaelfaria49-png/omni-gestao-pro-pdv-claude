# Acesso de clientes piloto e provisionamento controlado

Base: `2c0e996f3fefb09e991bc579013720c8d1e8112d` (main consultada em 22/10/2026). Missão descritiva de Plataforma, sem vínculo com CAD-R2/QR/PDV/pesagem. AEP opt-in ausente na worktree de execução.

## Contrato único

O motor continua sendo `enterprise-permissions`. A decisão efetiva é a interseção entre papel operacional, memberships do usuário e módulos persistidos na loja. Preferências em StoreSettings e ramo apenas configuram recursos dentro dessa liberação. Os gates técnicos existentes continuam obrigatórios; liberação não homologa peso, grade, balança, Fiscal ou emissão.

`AdminUser.accessScope` distingue `PLATFORM` e `STORE`. NULL é exclusivamente compatibilidade de registros anteriores à migration: ADMIN/SUPER_ADMIN já globais conservam sua autoridade; os demais continuam limitados às memberships/loja principal. Nenhuma conta real é reclassificada, editada ou desativada. A migration acrescenta a coluna sem valor nos registros antigos e só depois define STORE como default para novos registros. A criação administrativa sempre grava STORE explicitamente. Conceder PLATFORM exige ator da plataforma e operação explícita. Email, nome, loja, navegador e plano nunca identificam autoridade.

`Store.moduleAccess` é JSON versionado, alterável somente pela plataforma. NULL preserva a liberação legada das lojas já existentes; o default de novas lojas e o provisionamento usam o pacote básico. O pacote piloto não representa assinatura paga. A API operacional não pode escrever esse campo. O provisionamento atômico liga loja, ramo canônico, módulos, administrador local e membership.

O pacote básico contém início, PDV Clássico, caixa/histórico, vendas, Cadastros, estoque, relatórios operacionais e configurações. Assistência e catálogo de aparelhos dependem de liberação explícita além das preferências. IA, Omni Agent, Marketing, Marketplace, Contador, WhatsApp, administração da rede, experimentos, Fiscal e Financeiro completo ficam fora. Serviços de pagamento e estoque compartilhados são preservados.

## Sessão e senha

NextAuth Credentials continua como identidade. Cada resolução no servidor relê usuário ativo, papel, escopo, memberships, versão de sessão e liberação das lojas. Payload de atualização da sessão não concede claims. Mudança de senha, desativação e mudanças de identidade/escopo/memberships incrementam sessionVersion. JWT anterior é recusado; a troca de senha exige novo login. Permissões comerciais são relidas por operação e a interface revalida em intervalo limitado e no foco.

Novas contas recebem senha temporária individual aleatória, nunca compartilhada, com troca obrigatória. Apenas o hash bcrypt persiste. O segredo é entregue na resposta administrativa uma única vez, sem log/auditoria/artifact. A própria troca exige senha atual e senha nova forte, deriva o usuário da sessão e não aceita identificador arbitrário. Antes dela só autenticação, logout e segurança da própria conta são permitidos. Não se promete recuperação por email.

## Isolamento e superfícies

Papel ADMIN de loja não implica plataforma. O gestor pode administrar somente subordinados cujo conjunto inteiro de lojas esteja contido no seu próprio conjunto; alvos globais e contas da plataforma são protegidos. O filtro storeId é apenas um refinamento do escopo derivado no servidor. Sem loja autorizada, falha fechado.

A mesma decisão alimenta sidebar, menu móvel, busca, atalhos, cards, configurações, layouts server-side, APIs e Server Actions. Endpoints compartilhados têm autorização de loja/papel própria; não se bloqueia o prefixo financeiro/pagamento/estoque em bloco. Inventário acompanha a implementação e testes negativos reais.

A seleção salva por outra identidade é descartada quando não pertence à sessão atual. Sondagens de troca de loja não podem restaurar cookie/storage após outra troca, mudança de membership ou saída da página. A revalidação de uma sessão existente preserva rascunhos até receber a nova decisão; revogação confirmada desmonta o conteúdo. A aba de equipamentos exige assistência operacional e liberação de catálogo de aparelhos; compatibilidade de acessórios não abre cadastros de assistência.

O inventário cobre 371 handlers (incluindo NextAuth e aliases) e 112 actions de `app/actions`. Actions das bibliotecas V3/V4 continuam nos seus guards/delegações antes de efeitos; os leitores de caixa/pagamento de assistência ganharam guard próprio e o auto-close interno usa `server-only`. A importação de clientes fora de `app/actions` usa o mesmo guard de Cadastros. Os testes exercitam uma action publicada pelo próprio build, em página de PDV permitida, com loja do argumento adulterada.

O enriquecimento de venda respeita a seleção reduzida do cliente para CAIXA. Correção de cliente, criação de OS e faturamento de OS recusam FK externa à loja antes dos writers. Analytics e conciliação financeira usam a unidade validada também nas consultas/mutações internas. As APIs globais de Finance legado, supervisão global, lifecycle global do contador e ponte TCP de impressão permanecem internas; o PDV básico usa os serviços compartilhados e impressão pelo navegador. O webhook WhatsApp legado exige segredo configurado; o caminho Meta conserva HMAC. Cobrança existente continua acessível somente com vínculo Stripe persistido, sem liberar checkout/selo ao novo piloto.

## Banco, publicação e rollback

Nenhuma escrita em produção está autorizada nesta execução. `MIGRATION_AUTHORITY_ENABLED=false` permanece. A migration é proposta/testada apenas em PostgreSQL descartável, com vacuidade/identidade verificadas. Aplicar em produção exige autorização específica, inventário somente leitura dos administrativos legados e plano de rollout conjunto schema + aplicação. Não publicar aplicação antes do schema; não remover colunas com o novo código ativo. Rollback de aplicação deve suspender provisionamento e acesso externo, pois o código antigo interpreta ADMIN como global. Não retornar ao código antigo mantendo clientes ativos sem contenção.

Builds e E2E autenticados usam CI devido à memória local limitada. Dados, senhas e lojas são sintéticos. A entrega depende de testes, PR, CI e revisão independente do head final; sem exceções herdadas de outras PRs, merge/deploy ou bypass implícitos.
