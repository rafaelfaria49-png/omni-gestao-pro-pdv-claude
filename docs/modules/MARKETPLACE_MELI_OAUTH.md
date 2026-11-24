# Mercado Livre · OAuth e consulta de anúncios

`GOAL=OMNI-MARKETPLACE-MELI-M01-TECHNICAL-CLOSURE-003` · PR #399 em draft

O HUB permite autorizar uma conta de vendedor do Brasil por unidade e consultar seus anúncios. A configuração inicial é desligada. A primeira homologação depende de uma aplicação ativa no DevCenter e de um usuário oficial de teste autorizado.

## Base recuperada

O OAuth reutiliza a base local (`1eb744b`, `4e01827`, `847b230`), o gate por loja e módulo (`ee9f4a5`) e os contratos auditados em `OMNI-VESTUARIO-VARIACOES-MARKETPLACE-001`. A rodada FINAL-002 reconciliou a PR #399 com `origin/main` em `252f057c8bc7d631609e08a10ff3b271da82495e` (#397), preservando a política PWA da #393 e o typecheck canônico de 6144 MB. A rodada TECHNICAL-CLOSURE-003 incorporou a main em 231bb402eafc26089dea98af39154106a23e6589 (#400).

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
- A confirmação exige igualdade entre `user_id` do grant e o ID de `GET /users/me`, site `MLB` e os dois escopos `read` e `offline_access`. Em Preview e quando o ambiente não estiver identificado, a API também exige a marca `test_user` antes de persistir o grant ou consultar a conta. IDs numéricos externos são preservados como texto, inclusive Int64. A projeção guarda ID, apelido, status público, indicador de teste e escopos.
- A identidade do vendedor fica reservada à loja que a validou primeiro. Um evento de auditoria permanente contém o ID e a data de criação da loja e o ID público do vendedor. O evento é gravado no mesmo commit das credenciais, sob lock transacional por vendedor. O registro sobrevive à desconexão e à exclusão da loja. Recriar a unidade com o mesmo ID gera uma identidade diferente. As novas autorizações verificam também vínculos oficiais anteriores ao registro permanente.
- Quando o vendedor já está vinculado na unidade ou o operador informa o ID na primeira conexão, o backend verifica a reserva antes de entregar a URL de consentimento. O lock por vendedor impede duas intenções ativas com o mesmo ID declarado em lojas diferentes. O ID fica vinculado ao state e é rechecado imediatamente antes da troca. Após consumir o state, uma janela de 30 segundos protege a troca em andamento. Ao receber o grant, o backend confere a identidade esperada e exige a confirmação do provedor para persistir o vínculo.
- Tokens em repouso usam AES-256-GCM com nonce aleatório e autenticação vinculada a aplicação, loja, vendedor, concessão e finalidade. O backend publica somente a projeção segura. A troca de chave exige nova autorização das contas. Mantenha a chave estável e compartilhada entre as instâncias do mesmo ambiente.
- O backend usa a expiração retornada pelo provedor e renova sob demanda, com 60 segundos de margem. Uma transação curta grava a intenção de renovar; o token rotacionado substitui o anterior em outra transação. Cada chamada ao canal tem timeout de cinco segundos. Diante de revogação, erro incerto de renovação ou perda do worker depois de iniciar a troca, exige nova autorização. Se chegar `429`, respeita `Retry-After` e usa pausa de 30 segundos quando o cabeçalho não é válido. O limite depende do provedor e do recurso.
- A consulta faz `GET /users/{seller_id}/items/search` com `search_type=scan` e até 20 IDs por página. Depois lê os itens em um único `GET /items?ids=...` com campos selecionados. Cada item precisa pertencer ao vendedor e à página solicitada. O cursor interno é autenticado, restrito à loja e à concessão, e expira em quatro minutos. Em caso de perda da página ou falha no lote, recomece na primeira página.
- A leitura apresenta o ID, título, estado, preço, moeda, disponibilidade informada, categoria e imagens HTTPS de `*.mlstatic.com`. A projeção mantém `SELLER_SKU` e o código `seller_custom_field` em campos distintos. Em anúncios clássicos lê as combinações e os atributos das variações. Em User Products lê os atributos do anúncio e os identificadores de User Product e família quando retornados. A visualização é por anúncio. Agrupar famílias, carregar variantes sem anúncios e compor estoque por origem ficam para etapas futuras.
- O HTTP interno mantém POST para consultar estado e anúncios em navegadores com versões antigas do service worker. A correção PWA da #393 também manda GETs privados, incluindo o callback, diretamente à rede. As respostas privadas usam `no-store`. As chamadas de anúncios ao Mercado Livre são GET. As escritas da integração se limitam à conta e à auditoria.
- O adapter envia credenciais no corpo ou no cabeçalho da chamada à API oficial, recusa redirects do provedor e devolve erros sanitizados. O proxy não replica a query do callback no cabeçalho interno `x-omni-search`. O callback consome o código no servidor e usa um `303` com resultado fixo, `Cache-Control: private, no-store` e `Referrer-Policy: no-referrer`.

Fontes oficiais consultadas em 24/11/2026. [OAuth e PKCE](https://developers.mercadolivre.com.br/pt_br/gerenciamento-perguntas-respostas/autenticacao-e-autorizacao) · [Identidade e Int64](https://developers.mercadolivre.com.br/pt_br/publicacao-de-produtos/consulta-de-usuarios) · [Busca e multiget](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas) · [Variações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/variacoes) · [User Products](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/user-products).

## Logs do Preview

| Superfície | Evidência sintética e limite |
|---|---|
| Resposta e redirecionamento | A sonda no alias enviou query, código, state, Authorization, cookie e Referer fictícios. A rota respondeu `403 not_configured` sem redirecionar nem ecoar os valores. No fluxo controlado, a autorização e o erro do provedor passam pelo `303` restrito ao HUB. O teste no navegador verifica o Referer do retorno ao HUB. |
| Aplicação, proxy e erros | O teste do proxy verifica a remoção da cópia interna da query. O runner de QA busca marcadores de credenciais, cookies, query e erros do provedor no log da aplicação. |
| Runtime Logs | A Vercel documenta os parâmetros da query nos detalhes de requisição. O conector não retornou a sonda por ID ou marcador e o CLI também não a exibiu. A retenção ou redação de query, cabeçalhos, cookies, Referer e logs de erro na infraestrutura segue sem comprovação. [Runtime Logs](https://vercel.com/docs/logs/runtime). |
| Log Drains | A consulta do projeto `omni-gestao-pro` retornou zero Drains configurados. O formato documentado inclui `proxy.path` com a query e `proxy.referer`. Revalide os destinos se forem configurados antes do aceite. [Log Drains](https://vercel.com/docs/drains/reference/logs). |

Valide o descarte de query e cabeçalhos sensíveis antes da coleta e retenção nas camadas de ingresso, erros e exportação. Use marcadores fictícios por campo e correlacione com o ID de requisição. A flag fica desligada até haver evidência desse controle.

Se a infraestrutura da Vercel não puder demonstrar o descarte, a alternativa para decisão do arquiteto é um ingresso HTTPS dedicado que receba o callback antes da Vercel. Esse ingresso precisa descartar query, Authorization, cookies e Referer dos logs e rastreamento antes de persistir dados. A troca do código ocorre no backend e a Vercel recebe apenas um resultado autenticado por canal privado. O desenho precisa preservar o vínculo da sessão, da loja e do state, com início e retorno compatíveis com o cookie `__Host-`. O retorno ao HUB usa uma URL limpa, sem credenciais. Essa alternativa exige novo Redirect URI e validação sintética ponta a ponta.

## Configuração pelo proprietário

Use o alias estável de branch do projeto Vercel `omni-gestao-pro`, vinculado a `feat/omni-marketplace-meli-oauth-001`. Abra o HUB e registre o callback no mesmo domínio. A sondagem HTTP anônima chegou à aplicação e retornou `403 not_configured`, a guarda esperada com OAuth desligado. O consentimento com um vendedor oficial continua pendente. Se a proteção do Preview pedir sessão Vercel, autentique-se antes do fluxo e use o mesmo navegador até o retorno. [Alias do HUB de homologação](https://omni-gestao-pro-git-feat-om-7215e6-rafaelfaria49-4373s-projects.vercel.app/dashboard/marketplace) · [URLs de branch da Vercel](https://vercel.com/docs/deployments/generated-urls) · [Proteção do Preview](https://vercel.com/docs/deployment-protection).

**Redirect URI exato**

`https://omni-gestao-pro-git-feat-om-7215e6-rafaelfaria49-4373s-projects.vercel.app/api/marketplace/mercado-livre/callback`

1. Confirme no projeto `omni-gestao-pro` a configuração da branch de Preview, o banco e a sessão próprios de homologação e a guarda de logs descrita acima. Use uma loja sintética e uma aplicação dedicada à unidade. Mantenha a flag desligada durante a preparação.
2. Entre no DevCenter com a conta corporativa responsável, conclua as verificações do portal e crie uma aplicação dedicada à homologação na unidade de negócio **Mercado Livre**. Cadastre o Redirect URI acima, exatamente como escrito. Habilite PKCE S256, as permissões funcionais de leitura de conta e anúncios, **Read** e **Offline Access**. Deixe **Write**, pedidos, logística e pagamentos desmarcados. [Criação da aplicação](https://developers.mercadolivre.com.br/crie-uma-aplicacao-no-mercado-livre) · [Permissões e configuração](https://developers.mercadolivre.com.br/devcenter/desenvolvimento-in-house) · [Autorização oficial](https://developers.mercadolivre.com.br/pt_br/realizacao-de-testes/autenticacao-e-autorizacao).
3. Insira as seis variáveis no gerenciador autorizado da Vercel em **Preview**, com escopo da branch `feat/omni-marketplace-meli-oauth-001`. Gere uma chave aleatória de 32 bytes e entregue o valor diretamente ao gerenciador em base64url sem padding. Use apenas o ID da loja sintética na allowlist e habilite a flag depois de confirmar a configuração. Recrie somente o Preview dessa branch para aplicar as variáveis e verifique o mesmo alias. Para rollback, desligue a flag ou retire a unidade da allowlist e recrie o Preview. [Variáveis por ambiente da Vercel](https://vercel.com/docs/environment-variables).

   | Variável server-side | Valor |
   |---|---|
   | `MELI_OAUTH_CLIENT_ID` | App ID do DevCenter |
   | `MELI_OAUTH_CLIENT_SECRET` | Client Secret da mesma aplicação |
   | `MELI_OAUTH_REDIRECT_URI` | Redirect URI exato acima |
   | `MELI_OAUTH_ENCRYPTION_KEY` | Chave AES de 32 bytes, base64url sem padding |
   | `MELI_OAUTH_STORE_ALLOWLIST` | IDs exatos de lojas autorizadas, separados por vírgula |
   | `MELI_OAUTH_ENABLED` | `1` para ativar a configuração acima. O padrão é desligado. |

4. Após a habilitação legítima no DevCenter, o proprietário usa um vendedor oficial de teste `MLB` ou o provisiona pelo fluxo oficial `POST https://api.mercadolibre.com/users/test_user` a partir de uma conta autorizada, com `{"site_id":"MLB"}`. Se a conta estiver restrita para vendas ou o portal não autorizar o vendedor de teste, aguarde a habilitação pelos canais do Mercado Livre. Guarde as credenciais no gerenciador de segredos. Faça o aceite com anúncios de teste já existentes. Solicite a habilitação de User Products pelo formulário oficial, se for aplicável. [Usuários de teste](https://developers.mercadolivre.com.br/pt_br/realizacao-de-testes/realizacao-de-testes) · [Habilitação de User Products](https://developers.mercadolivre.com.br/pt_br/preco-variacao).
5. No alias de homologação, entre no OmniGestão com acesso ao módulo e à loja sintética. Informe o ID conhecido do vendedor no HUB, autorize com a conta oficial de teste e confira o ID, o apelido, o selo de teste e os escopos retornados. Compare páginas com os anúncios existentes em título, status, preço, disponibilidade, SKU, cor, tamanho e variações clássicas ou User Products presentes. Registre lacunas da massa de teste. Publicação exige autorização separada.
6. Após a expiração informada, consulte para testar a renovação. Retire o grant pela conta de teste ou pelo fluxo oficial do DevCenter e confirme a necessidade de reconexão na próxima consulta. Use **Desconectar** para validar a limpeza das credenciais locais e a preservação do vínculo e da auditoria. Registre IDs de teste, estados e horários. Confira as obrigações do portal para distribuição a terceiros antes da ativação comercial. [Revogação](https://developers.mercadolivre.com.br/devcenter/gerencie-seu-aplicativo) · [Termos do programa](https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes).

## Transferência futura de vendedor

Em M01, a reserva é permanente e a desconexão não autoriza reconectar o vendedor em outra loja. Uma futura transferência precisa de autorização formal do titular da conta e dos responsáveis pelas duas lojas, registro do motivo e conferência da identidade de origem e destino. Suspenda a integração da origem, revogue o grant no Mercado Livre e confirme a indisponibilidade das credenciais anteriores. O mecanismo futuro deve usar um lock por vendedor e transação auditável que mantenha os eventos da origem e do destino. O destino então faz um novo consentimento próprio. A reserva e o histórico devem sobreviver à exclusão ou recriação de qualquer loja. Uma falha mantém a referência anterior e exige decisão explícita. A PR #399 não oferece operação de transferência.

## Risco operacional de nova autorização

O Mercado Livre aceita o último refresh token emitido, de uso único e associado ao `client_id`. O protocolo documentado devolve a identidade autenticada na troca do código. Um ID informado no HUB restringe o aceite local, e a sessão escolhida no provedor pode pertencer a outra conta. Se a identidade real só for conhecida depois da troca, o provedor já pode ter invalidado o refresh token da origem. [OAuth e refresh token](https://developers.mercadolivre.com.br/pt_br/realizacao-de-testes/autenticacao-e-autorizacao) · [Obtenção do token e user_id](https://developers.mercadolivre.com.br/pt_br/obtencao-do-access-token).

O fixture modela um único refresh válido por aplicação e vendedor. A recusa da segunda loja preserva a conexão e a auditoria da origem. Quando o refresh da origem falha com `invalid_grant`, o HUB limpa as credenciais vencidas e solicita reconexão na mesma unidade, sem repetir a tentativa de refresh. A recusa não dispara revogação remota, pois a autorização pode ser compartilhada no provedor. Use uma aplicação e um vendedor dedicados a uma loja de homologação. A ativação em várias lojas depende de decisão sobre esse risco.

## Provas reproduzíveis

- Contrato, escopos, AEAD, erros, paginação e isolamento do gate em `npm test -- lib/marketplace`. O check integral do TypeScript usa `npm run typecheck -- --incremental false` e o heap de 6144 MB integrado na main.
- O workflow **Marketplace Mercado Livre QA** executa lint, build e Playwright com Next.js, sessão NextAuth e PostgreSQL 17 descartável. O fixture cobre duas lojas, consentimentos concorrentes, verificação antes da troca, recusa do grant, preservação da origem, reconexão, revogação, refresh rotativo e exclusão e recriação de loja. Também cobre anúncios, paginação, limite e erros de rede.
- Para execução local use Node 24, `npm ci`, `npm run build` e `npx playwright install chromium`. Execute `node scripts/marketplace/run-meli-e2e.mjs` com `MELI_E2E_DATABASE_URL` apontando para um banco vazio `omni_meli_e2e` no IP `127.0.0.1` e usuário `meli_qa`. O runner prepara uma cópia descartável do schema, usa TLS de teste no loopback e bloqueia chamadas oficiais em toda a superfície testada. Capturas e contadores saem em `test-results/marketplace-meli/`.
- A execução sintética valida a aplicação e os contratos de rede. O aceite oficial continua condicionado à configuração do proprietário e aos passos 5 e 6. A identificação comercial é recusada nesse Preview.
