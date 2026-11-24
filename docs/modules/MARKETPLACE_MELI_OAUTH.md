# Mercado Livre · OAuth e consulta de anúncios

`GOAL=OMNI-MARKETPLACE-MERCADO-LIVRE-OAUTH-READONLY-001` · 24/11/2026

O HUB permite autorizar uma conta de vendedor do Brasil por unidade e consultar seus anúncios. A configuração inicial é desligada. A primeira homologação depende de uma aplicação ativa no DevCenter e de um usuário oficial de teste autorizado.

## Base recuperada

O pré-voo partiu de `origin/main` em `c2e93194a90b92e91b87f1ffd3f52f2064ab5318` (PR #394). Branches, worktrees, commits e PRs pesquisados forneceram a base simulada (`1eb744b`, `4e01827`, `847b230`), o gate por loja e módulo (`ee9f4a5`) e a auditoria local `OMNI-VESTUARIO-VARIACOES-MARKETPLACE-001`. O levantamento recuperou decisões e contratos. A implementação OAuth partiu da base existente.

| Superfície | Uso neste recorte |
|---|---|
| `app/dashboard/marketplace/page.tsx` e `components/marketplace/` | Mesmo HUB, painel de conexão oficial, consulta de anúncios, estados por loja e ações futuras identificadas. |
| `MarketplaceConnection` | A conta oficial tem uma linha canônica por loja. Reutiliza `accessToken`, `refreshToken` e `metadata`. Registros simulados e seus históricos são preservados. |
| `MarketplaceListing`, `MarketplaceProductLink` e `MarketplaceSyncLog` | Anúncio interno, vínculo de catálogo e histórico local. A leitura oficial não grava nessas tabelas. As operações legadas de simulação recusam a linha oficial. |
| `requireModuleApi` e `requireMarketplaceApi` | Sessão, assinatura, módulo e acesso explícito à unidade. O callback verifica novamente o usuário que iniciou a autorização. |
| Vestuário P01/P02 (#357, #358, #360), #394 e P03 (draft #367) | Produtos, variantes e códigos internos mantêm seus contratos. IDs do anúncio, variante e User Product ficam na projeção externa. SKU do canal não identifica automaticamente um produto ou variante OmniGestão. |

## Contrato e segurança

- `MarketplaceReadOnlyAdapter` delimita autorização, identidade e consulta. O Mercado Livre é a implementação desta etapa. Shopee, Amazon e Magalu aparecem em preparação.
- A autorização abre o domínio brasileiro oficial. O retorno HTTPS usa um cookie `__Host-` com `Secure`, `HttpOnly` e `SameSite=Lax`. O backend valida o usuário, a loja, o hash de `state`, o prazo de dez minutos e o PKCE S256. A tentativa é consumida no PostgreSQL antes da troca do código. Um novo início invalida a tentativa anterior.
- A confirmação exige igualdade entre `user_id` do grant e o ID de `GET /users/me`, site `MLB` e escopos `read` e `offline_access`. O fluxo rejeita escopos adicionais. IDs numéricos externos são preservados como texto, inclusive Int64. A projeção guarda só ID, apelido, status público, indicador de usuário de teste e escopos.
- A identidade de vendedor permanece reservada à unidade que a validou primeiro, inclusive depois de desconectar. Uma nova autorização só troca as credenciais da mesma conta. A exclusividade entre lojas usa lock transacional do PostgreSQL por vendedor e consulta restrita às linhas oficiais. Conexão e desconexão ficam no log de auditoria com ID do operador e da loja.
- Tokens em repouso usam AES-256-GCM com nonce aleatório e autenticação vinculada a aplicação, loja, vendedor, concessão e finalidade. O backend publica somente a projeção segura. A troca de chave exige nova autorização das contas. Mantenha a chave estável e compartilhada entre as instâncias do mesmo ambiente.
- O backend usa a expiração retornada pelo provedor e renova sob demanda, com 60 segundos de margem. Uma transação curta grava a intenção de renovar; o token rotacionado substitui o anterior em outra transação. Cada chamada ao canal tem timeout de cinco segundos. Diante de revogação, erro incerto de renovação ou perda do worker depois de iniciar a troca, exige nova autorização. Se chegar `429`, respeita `Retry-After` e usa pausa de 30 segundos quando o cabeçalho não é válido. O limite depende do provedor e do recurso.
- A consulta faz `GET /users/{seller_id}/items/search` com `search_type=scan` e até 20 IDs por página. Depois lê os itens em um único `GET /items?ids=...` com campos selecionados. Cada item precisa pertencer ao vendedor e à página solicitada. O cursor interno é autenticado, restrito à loja e à concessão, e expira em quatro minutos. Em caso de perda da página ou falha no lote, recomece na primeira página.
- A leitura apresenta o ID, título, estado, preço, moeda, disponibilidade informada, categoria e imagens HTTPS de `*.mlstatic.com`. A projeção mantém `SELLER_SKU` e o código `seller_custom_field` em campos distintos. Em anúncios clássicos lê as combinações e os atributos das variações. Em User Products lê os atributos do anúncio e os identificadores de User Product e família quando retornados. A visualização é por anúncio. Agrupar famílias, carregar variantes sem anúncios e compor estoque por origem ficam para etapas futuras.
- O HTTP interno usa POST para consultar estado e anúncios, porque o service worker existente pode guardar GETs pela URL na ausência de rede. O navegador recebe respostas privadas com `no-store`. As chamadas de anúncios ao Mercado Livre são GET e não causam mutações de catálogo, vendas, preços, estoque ou publicação. As escritas locais da integração se limitam aos dados operacionais da conta e à auditoria. Configure a coleta HTTP do ambiente para redigir a query do callback, que transporta o código OAuth e o state.

Fontes oficiais consultadas em 24/11/2026. [OAuth e PKCE](https://developers.mercadolivre.com.br/pt_br/gerenciamento-perguntas-respostas/autenticacao-e-autorizacao) · [Identidade e Int64](https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/consulta-de-usuarios) · [Busca e multiget](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas) · [Variações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/variacoes) · [User Products](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/user-products).

## Configuração pelo proprietário

1. Entre no DevCenter com a conta corporativa responsável, conclua as verificações que o portal exigir e crie uma aplicação para a unidade de negócio **Mercado Livre**. Use uma aplicação dedicada à homologação, com ID e secret preservados no ambiente de homologação. [DevCenter](https://developers.mercadolivre.com.br/devcenter) · [Cadastro da aplicação e permissões](https://developers.mercadolivre.com.br/desenvolvimento-in-house) · [Validação cadastral](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/validacao-de-dados-obrigatoria).
2. Cadastre exatamente `https://<dominio-estavel-de-homologacao>/api/marketplace/mercado-livre/callback` em **Redirect URI**. Use o mesmo domínio para acessar o HUB. Habilite PKCE e configure as permissões funcionais mínimas de leitura da conta e de anúncios. Habilite **Read** e **Offline Access**. Deixe **Write** e as permissões de pedidos, logística e Mercado Pago desmarcadas. O trecho de autorização segue a seleção de scopes da aplicação cadastrada. [Guia de configuração](https://developers.mercadolivre.com.br/devcenter/desenvolvimento-in-house) · [Autorização oficial](https://developers.mercadolivre.com.br/pt_br/realizacao-de-testes/autenticacao-e-autorizacao).
3. No gerenciador de segredos do ambiente, configure as variáveis abaixo. Gere uma chave de 32 bytes com `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. Transfira o resultado diretamente para o gerenciador de segredos. Aplique o opt-in na loja de homologação após validar os valores. O rollback operacional consiste em desligar `MELI_OAUTH_ENABLED` ou retirar aquela loja da allowlist.

   | Variável server-side | Valor |
   |---|---|
   | `MELI_OAUTH_CLIENT_ID` | App ID do DevCenter |
   | `MELI_OAUTH_CLIENT_SECRET` | Client Secret da mesma aplicação |
   | `MELI_OAUTH_REDIRECT_URI` | URL HTTPS estática cadastrada |
   | `MELI_OAUTH_ENCRYPTION_KEY` | Chave AES de 32 bytes, base64url sem padding |
   | `MELI_OAUTH_STORE_ALLOWLIST` | IDs exatos de lojas autorizadas, separados por vírgula |
   | `MELI_OAUTH_ENABLED` | `1` para ativar a configuração acima. O padrão é desligado. |

4. O proprietário usa um vendedor de teste `MLB` existente ou o cria pelo fluxo oficial `POST https://api.mercadolibre.com/users/test_user`, com um token autorizado para esse provisionamento e JSON `{"site_id":"MLB"}`. Guarde o ID, apelido e senha de teste no gerenciador de segredos. O Mercado Livre usa a mesma API para contas de teste e contas comerciais. Faça o aceite com anúncios de teste já existentes e mantenha a conta pessoal fora do fluxo. Quando User Products exigir habilitação no vendedor de teste, solicite-a pelo formulário oficial. [Usuários de teste](https://developers.mercadolivre.com.br/pt_br/realizacao-de-testes/realizacao-de-testes) · [Habilitação de User Products](https://developers.mercadolivre.com.br/pt_br/preco-variacao).
5. Entre no OmniGestão com acesso ao módulo e à loja piloto. Autorize no HUB com a conta de teste e confirme ID, apelido, selo de teste e escopos. Compare duas páginas com os anúncios de teste, incluindo variações ou User Products presentes. Verifique expiração e renovação, revogue o acesso no canal e confirme o estado de reconexão na próxima consulta. Guarde evidências com IDs de teste, estado e horário. Credenciais, códigos e tokens ficam fora das evidências.
6. O botão **Desconectar** remove as credenciais locais e conserva o vínculo de identidade e a auditoria. Para revogar o grant remoto, retire o aplicativo na conta Mercado Livre ou use o fluxo oficial de revogação do DevCenter. Os termos descrevem a certificação no Programa de Parceiros Certificados. Confira com o portal os requisitos cadastrais e de habilitação para distribuição a terceiros antes da ativação comercial. [Revogação](https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/gerencie-seu-aplicativo) · [Termos do programa](https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes).

## Provas reproduzíveis

- Contrato, escopos, AEAD, erros, paginação e isolamento do gate em `npm test -- lib/marketplace`. O check integral do TypeScript usa `node --max-old-space-size=6144 node_modules/typescript/lib/tsc.js --noEmit --incremental false`. O primeiro CI esgotou o heap de 4 GB do script padrão.
- O workflow **Marketplace Mercado Livre QA** executa lint, build e Playwright com Next.js, sessão NextAuth e PostgreSQL 17 descartável. O provedor é controlado por fixture, incluindo retorno OAuth, token de uso único, anúncios, variações, limite, rede e revogação.
- Para execução local use Node 24, `npm ci`, `npm run build` e `npx playwright install chromium`. Execute `node scripts/marketplace/run-meli-e2e.mjs` com `MELI_E2E_DATABASE_URL` apontando para um banco vazio `omni_meli_e2e` no IP `127.0.0.1` e usuário `meli_qa`. O runner prepara uma cópia descartável do schema, usa TLS de teste no loopback e bloqueia chamadas oficiais em toda a superfície testada. Capturas e contadores saem em `test-results/marketplace-meli/`.
- A execução sintética valida a aplicação e os contratos de rede. O aceite oficial continua condicionado à configuração do proprietário e à execução do passo 5. O teste com seller comercial é uma autorização separada.
