# Experiência do cliente básico: Configurações, Estoque e navegação

Missão descritiva sobre `9dd6311d480b20c9362ebbdac95607ed399e323f` (main efetiva no
preflight de 24/10/2026). Branch/worktree própria `codex/cliente-basico-configuracoes-estoque`.
AEP opt-in ausente; sem GOAL, número CAD-R2, state, ledger ou registry. #300, #303, #306
e #307 não foram reabertas; PRs/WIPs de PDV N5-C, pesagem, Pessoas, Operações e Fiscal
foram preservados (nenhum arquivo reservado por eles foi editado).

## Apresentação não é autoridade

`lib/navigation/client-experience.ts` (`usesClientExperience`) só escolhe qual tela já
existente mostrar. Plataforma e lojas com liberação legada (todos os 19 módulos,
`moduleAccess` NULL) continuam com as telas históricas; lojas com pacote explícito
recebem a experiência do cliente. Ramo, nome, email, loja, storage e payload não
participam. Nenhum acesso é concedido ou negado ali: `canAccessPage`,
`canAccessSettingsSection`, `requireModuleApi` e as Server Actions seguem decidindo.
Sessão ainda não resolvida (`null`) não renderiza nenhuma das telas, evitando flash de
controles internos e leituras iniciadas para depois esconder. Não há flag "sou dono",
lista paralela de permissões nem persistência nova.

Consequências: A01 (plataforma) mantém exatamente a visão administrativa, inclusive
com uma padaria ativa. Contas internas legadas (CAIXA/VENDEDOR/OPERADOR com escopo
NULL em loja legada) mantêm papéis e restrições; nenhuma é reclassificada. Uma
assistência STORE com `service`/`deviceCatalog` liberados recebe a experiência do
cliente com os recursos de assistência visíveis.

## Configurações

Mesma página e rotas (`?sec=`). Para o cliente, nomes mais claros: Dados da loja,
Aparência, PDV e impressão, Vendas e pagamentos, Equipe, Segurança da conta. O título
acompanha a seção efetivamente exibida (seção negada cai em Geral).

- Geral: reutiliza o editor/salvamento da #306. "Preferências regionais" (bloco futuro,
  sem persistência) aparece só na visão interna. Ramos de assistência/acessórios só são
  oferecidos com a liberação correspondente; o ramo salvo nunca some da lista.
- Aparência: mesmo provider e controles; textos sem menção à RafaCell ou a `printerConfig`.
- Vendas: formas de pagamento sempre. Garantia/validade de orçamento só com Operações;
  imposto estimado só com Fiscal (visão interna mantém); quando um imposto gravado
  altera o total, o cliente vê o aviso sem o controle. "Mesas e consumo" só aparece
  quando `canAccessPage` permite `/dashboard/vendas/mesas` (inclusive para gestores
  internos sem plataforma, para quem a rota já era negada).
- PDV e impressão: o cartão técnico (host/porta, vias, gaveta, OS, crediário, "Testar
  impressão" via `/api/print/raw`) continua só na plataforma. O cliente vê "Impressão do
  cupom" com o que a impressão pelo navegador consome (bobina, modo, logo, rodapé) e
  "Prévia no navegador", que reutiliza `printPdvSaleReceipt`
  com `forceBrowserFallback`: nenhuma venda, pagamento, gravação ou ponte TCP. A API
  `/api/print/raw` e seus guards não mudaram.

### Patches parciais

Vendas e PDV enviavam o `printerConfig` carregado na montagem inteiro (e todo o
`pdvParams`); com o merge do servidor por chave de topo, isso desfazia em silêncio o
que outra aba/seção gravasse depois. Agora cada seção envia só as chaves alteradas
(`settings-patch.ts`), pelo mesmo `PUT /api/stores/:id/settings` e
`mergePrinterConfigServerSide` (sem writer novo). O merge canônico passou a fundir
`impressao` por chave, como já fazia com `pdvParams`, dentro da transação com lock da
loja: um patch de rodapé não apaga host, vias, gaveta, chaves desconhecidas nem um
ajuste concorrente da plataforma. Só os campos editados são normalizados e enviados
(valor oculto gravado fora da faixa da tela, como garantia de 730 dias, não é
reescrito). `false`/`0` legítimos são enviados quando mudam. Revalidação do provider
não substitui rascunho em andamento. Falha de gravação mostra erro e não confirma sucesso.

## Estoque

`/dashboard/estoque` mostra a tela histórica `GestaoProdutos` para plataforma/contas
internas (sem alteração). Para o cliente, `EstoqueCliente` monta o painel canônico de
Produtos do Cadastros (`ProdutosPanel`, exportado sem cópia): reader
`listProdutosPaginado`, ficha `ProductAIModal` da #307 para Novo/Editar, movimentação
`MovimentacaoEstoqueModal` existente, busca e filtros. A variante de estoque exibe a
unidade do contrato comercial (UN/KG/G) ao lado do saldo, sem converter quantidade;
peso aparece como "venda por peso em preparação"; declaração inválida, como "unidade a
revisar". Sem segundo formulário, parser ou writer. Saldo continua protegido.

No painel compartilhado, "Prontos p/ Marketplace" e os botões "Anúncio/Publicar" só
aparecem com o módulo Marketplace; os filtros de importação, só na visão interna.
No Inventário Assistido, o atalho "Abrir cadastro completo" (prefill consumido apenas
pela tela histórica) só é oferecido na visão interna; o cliente usa o cadastro rápido
in-place, que fecha a pendência.

## Navegação e relatórios

- Sidebar/menu móvel/cards: entrada "Estoque" apenas na experiência do cliente.
- Topbar: "Novo Cliente/Produto" abrem `cadastros-v2?aba=…&novo=1` (o HUB abre a aba e
  a ficha; recarregar não reabre). Atalhos e busca (Ctrl+K) exigem destino permitido e
  a visibilidade do item.
- Relatórios: cartão disponível só aparece se o destino também for permitido; roadmap
  continua apenas na plataforma. Nada de DRE, ranking ou indicadores novos.

## Provas

- Unitário/componente: projeção por identidade sintética no motor real, navegação,
  patches e merge do servidor, Vendas/Impressão (controles ocultos sem request, só a
  chave alterada, rascunho preservado, falha sem sucesso falso, prévia sem gravação),
  menu de Configurações por perfil.
- E2E `e2e/platform-pilot/client-experience.spec.ts` (build de produção, `next start`,
  NextAuth real, PostgreSQL descartável da suíte; fixtures sintéticas criadas no próprio
  spec): proprietário × contas legadas × ADMIN STORE padaria A × funcionário STORE ×
  ADMIN STORE B × assistência liberada; cadastro/edição pela ficha canônica a partir do
  Estoque com conferência no banco; duas abas gravando seções diferentes; injeção
  identificada de falha no PUT; prévia sem venda; preparação da loja pelo proprietário
  sem consumir a troca obrigatória da cliente; negativas por URL/payload/loja B;
  1440/1024/390/320 px, menu móvel e teclado; nenhuma request às superfícies negadas.

Resultados, head revisado, CI, revisão independente e publicação ficam na PR desta
missão e no relatório final; nada aqui antecipa esses resultados.

## Fronteiras e handoffs

Sem mudança de auth/política/revogação, schema/migrations, motores de PDV/caixa/
pagamentos/devoluções, StockLedger, pesagem, protocolos de impressão, Fiscal,
Financeiro, Marketplace, voz/QR/vCard.

- PDV/Vendas: o filtro por forma de pagamento de `/api/vendas/historico` segue com a
  frente Vendas/PDV (registrado, arquivo não disputado).
- PDV/impressão: loja STORE com `impressao.impressoraHost` preenchido (por exemplo,
  configurado pela plataforma) tenta a ponte interna, recebe 403 e não cai no navegador
  (`printWithFallback` retorna erro honesto quando há host). A impressão automática após
  a venda (`PdvAutoPrintFeedback`) usa `allowBrowserFallback: false`, então para STORE
  não imprime; por isso não é oferecida ao cliente (o valor gravado é preservado).
  Integração de impressora homologada e impressão automática do cliente são da frente PDV.
- Preferência salva, prévia disponível e equipamento homologado são provas distintas:
  esta missão cobre as duas primeiras; nenhum equipamento foi homologado.

`PRODUCTION_APPLICATION_WRITES=0` · `SCHEMA_MIGRATIONS=UNCHANGED` ·
`REAL_CLIENT_PROVISIONED=NO` · `MIGRATION_AUTHORITY_ENABLED=false`.
