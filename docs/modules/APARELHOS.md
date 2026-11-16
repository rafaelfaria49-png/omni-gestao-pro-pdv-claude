# Aparelhos por IMEI — cadastro, compra, venda e garantia

GOAL `OMNI-APARELHOS-CADASTRO-COMPRAS-VENDAS-GARANTIAS-ENDTOEND-001` · branch `claude/aparelhos-endtoend-001`.

## O que existe

| Superfície | Onde | Estado |
|---|---|---|
| Cadastros HUB → Aparelhos (Visão geral, Aparelhos, Compras de cliente, Garantias, Histórico) | `components/aparelhos/AparelhosPanel.tsx` | Real (API + PG) |
| Cadastro novo/usado com IMEI 1/2, série, checklist 4 estados, bateria com origem, acessórios, fotos | `AparelhoFormDialog.tsx` | Real |
| Compra de cliente (assistente em 4 etapas) com protocolo e aprovação segregada | `CompraClienteDialog.tsx` | Real (sem lançamento financeiro — ver bloqueios) |
| Venda Completa → "Adicionar aparelho" | `venda-completa-enterprise.tsx` + `VendaAparelhoDialog.tsx` | Real |
| PDV Clássico → modelo do catálogo ou IMEI bipado | `pdv-classic.tsx` + `VendaAparelhoDialog.tsx` | Real |
| PDV Supermercado / Assistência / Black / PDV da Venda Completa antiga | `components/aparelhos/bloqueio-layout.ts` | Bloqueio explícito (cliente) + servidor recusa |
| Documentos A4/80 mm: termo de garantia, comprovante, termo de entrega, protocolo de aquisição | `lib/aparelhos/documents.ts` | Real, gerados do snapshot |

O recurso fica **desligado por padrão**: liga por loja em Configurações → Ramo e recursos →
"Aparelhos por IMEI (compra, venda e garantia)" (`catalog.serializedDevices`, override explícito;
nenhum ramo ou loja legada recebe por sugestão). A loja também precisa do módulo `deviceCatalog`.

## Modelo de dados (migration `20261110120000_aparelhos_fisicos_serializados`, aditiva)

- **Modelo comercial** = `Produto` canônico (marcado com `metadata.serializedDevice.version = 1`,
  criado/achado por marca+modelo+armazenamento+novo/usado). O saldo agregado continua no ledger.
- **Unidade física** = `AparelhoFisico` (id estável + `codigoInterno` APA-NNNNNN + IMEI/serial).
- **Aparelho de cliente em assistência** continua na OS; nunca vira estoque. A ficha só mostra as OS
  em que o IMEI apareceu (referência).
- `AparelhoIdentificador` — IMEI 1, IMEI 2 e série no MESMO espaço único por loja.
- `AparelhoEvento` — linha do tempo append-only.
- `AparelhoAquisicao` — protocolo AQ-AAAA-NNNN, documento do vendedor só mascarado + hash.
- `AparelhoVenda` — vínculo venda↔unidade + snapshot imutável do termo; índice parcial único
  `(storeId, aparelhoId) WHERE status = 'ativa'` (duas vendas ativas da mesma unidade = impossível).
- `AparelhoPoliticaLoja` (versionada), `AparelhoDocumento` (emissões/reimpressões), `AparelhoSequencia`.
- CHECKs: `legalDias >= 90`, contratual ≥ 0, estados/condições válidos, unidade vendável só com
  `propriedade = 'loja'`.

Reversão: `down.sql` na pasta da migration (só sem dados reais). **Não aplicada em Production.**
Atenção: o build de Production da Vercel roda `prisma migrate deploy` quando o guard de autoridade
libera — o merge na `main` aplicaria esta migration. O merge é decisão humana.

## Invariantes

- `Produto.stock` do modelo = unidades `disponivel` + `reservado` (entrada/saída sempre por
  `applyStockMutationTx`, chave `aparelho:entrada|saida:{id}:{versão}`).
- Venda: o motor canônico (`upsertVendaInTransaction`) baixa o estoque do produto; o gancho
  `lib/aparelhos/sale-hook.ts` roda na MESMA transação, trava a unidade (`FOR UPDATE`), exige
  cliente, valida loja/produto/estado/reserva, grava `AparelhoVenda` + evento. Qualquer erro
  reverte venda, estoque, caixa e financeiro.
- Modelo serializado sem `deviceSale` no PDV ao vivo → `APARELHO_IMEI_OBRIGATORIO` (fail-closed).
- Venda comum sem cliente continua igual (o gancho nem carrega sem linha de aparelho).
- Venda de aparelho exige conexão (reserva no servidor); offline o diálogo bloqueia.

## Garantia — decisões que REQUEREM VALIDAÇÃO JURÍDICA

1. Legal de **90 dias** (CDC art. 26, II) para todo aparelho, novo ou usado, vendido pela loja.
   Contada da **entrega efetiva** (art. 26, §1º); vício oculto, do momento em que aparece (§3º).
2. Contratual (CDC art. 50) é **adicional**. Adotamos a leitura mais favorável ao consumidor
   (entendimento do STJ): os prazos **somam** — contratual da entrega, legal após o fim da
   contratual. `coberturaFim = entrega + contratual + 90`. **Validar com jurídico.**
3. Contagem por dias corridos (CC art. 132: exclui o dia do começo). "6 meses" = 180 dias e
   "1 ano" = 365 dias, impressos também em dias no termo. **Validar com jurídico.**
4. Garantia do fabricante: informativa, nunca presumida a partir da revenda.
5. Texto-base do termo é fixo (não retira direitos); a loja só acrescenta linhas.
6. Documentos são comerciais — **não** substituem NF-e/NFC-e nem nota de entrada.

## Permissões (servidor)

`lib/aparelhos/permissions.ts`: proprietário (admin) tudo + política; gerente aprova compras de
OUTROS e vê custo; vendedor cadastra/compra/vende sem custo; caixa vende/reimprime sem custo e sem
Cadastros; técnico cadastra/avalia sem vender. **Segregação**: só gerente/proprietário libera
aparelho para venda (quem cadastra ou registra a compra não libera sozinho); gerente não aprova a
própria compra quando a política exige aprovação (desligar essa opção remove a segregação — decisão
do proprietário). IMEI completo só para gerente/proprietário na lista
(documentos impressos trazem o IMEI completo, que identifica o bem do cliente).

## Bloqueios conhecidos (não fingidos)

- **Pagamento da compra de cliente** (`lib/aparelhos/financeiro.ts`): a APROVAÇÃO cria, na mesma
  transação, um título PENDENTE em Contas a Pagar (chave `pagar:manual:{loja}:aparelho-aquisicao-{id}`,
  categoria "Compra de aparelhos (estoque)", vencimento = dia da aprovação → aparece como vencido no
  mesmo dia). O pagamento efetivo só acontece no Financeiro (Contas a Pagar → pagar), que exige permissão
  financeira e gera a saída de caixa/carteira pelo fluxo existente. Pagamento em dinheiro no balcão NÃO
  passa pela sessão de caixa do PDV (não há sangria automática): quem paga dá baixa no Financeiro.
  A situação exibida (a pagar/parcial/pago) vem sempre do título. "Crédito na loja" e "Abatimento em
  venda" são recusados (`PAGAMENTO_NAO_INTEGRADO`) — sem contrato canônico de liquidação. Teto de
  R$ 200.000,00 por protocolo. Atenção DRE: o título pago entra como despesa da categoria acima; avaliar
  com o contador se deve ser tratado como estoque (CMV) para não contar duas vezes.
- **Consulta oficial de restrição de IMEI**: sem integração autorizada. Só conferência manual
  registrada (fonte, data, operador). O sistema nunca afirma "limpo" sem registro.
- **Cancelamento de venda**: integrado. Na mesma transação do cancelamento, a garantia vira
  `cancelada` e a unidade volta a `disponivel` (casa com o estorno de +1 do produto). Se o aparelho
  precisar de avaliação, mude para "Em revisão" (retira do saldo pelo ledger).
- **Devolução (F8) e correção de itens**: NÃO integradas → fail-closed para vendas com aparelho
  (`APARELHO_DEVOLUCAO_NAO_INTEGRADA`, nada é gravado). O bloqueio vale no servidor E no terminal:
  `registrarDevolucao` (troca e devolução, `lib/operations-store.tsx`) recusa a linha com `deviceSale`
  antes de gravar estoque/crédito local — sem devolução parcial "pendente para sempre". PR #331 (F8)
  segue draft; integrar depois pela unidade exata (`AparelhoVenda.aparelhoId`). O F8 poderá recuperar a unidade exata por
  `AparelhoVenda.aparelhoId` (transição `vendido → devolvido` já prevista).
- **Recompra** de aparelho vendido pela própria loja: reaproveita a mesma unidade; na aprovação a
  garantia anterior vira `recomprada`; se a compra for recusada, a unidade volta como estava.
- **Cancelamento bloqueado** (`APARELHO_CANCELAMENTO_BLOQUEADO`, 409) quando a unidade já mudou depois
  da venda (recompra em andamento/aprovada, revisão, etc.) — evita +1 de estoque sem unidade.
- **Venda pendente de aparelho**: reenvio até 36 h depois é aceito (entrega de "ontem" vira "hoje",
  nunca pior ao cliente); depois disso é recusada (`APARELHO_DATA_VENDA`) e precisa ser refeita online.
- **Gerente** pode cadastrar diretamente um usado e liberá-lo (é aprovador). Segregação estrita para
  o gerente só existe no fluxo "Comprar de cliente". Decisão de produto; revisar com o proprietário.
- **Cancelamento devolve a unidade a `disponivel`**; se o cliente já levou o aparelho, mova para
  "Em revisão" antes de revender. Alternativa (ir direto para revisão) é decisão de produto.
- **Ajuste manual, inventário e OS** ainda podem mexer no saldo de um modelo serializado fora deste
  módulo; a invariante de estoque só é garantida pelos fluxos de aparelhos.
- **Impressora física 80 mm**: preview validado no navegador; papel/térmica não testados.

## Publicação e rollback

- O build de Production (`scripts/vercel-build.mjs`) hoje emite `MIGRATION_SKIPPED`: o merge publica o
  código SEM criar as tabelas. É seguro: tabelas novas, nenhuma coluna nova em tabela existente; vendas,
  cancelamento, devolução e estoque comuns não consultam as tabelas novas; a API de aparelhos responde
  503 `APARELHOS_NAO_INSTALADO` (nunca 500) se alguém ligar o recurso antes do apply.
- Aplicar a migration em Production é um passo SEPARADO e autorizado pelo proprietário (flag
  `MIGRATION_AUTHORITY_ENABLED` no projeto canônico ou apply assistido), com backup/PITR do Neon antes.
- Rollback de código: promover o deployment anterior na Vercel (sem dados novos envolvidos enquanto o
  recurso estiver desligado). `down.sql` só vale sem dados reais — não é rollback produtivo garantido.
- Modelo serializado nunca sai sem unidade em nenhum escritor (inclusive sync legado):
  `APARELHO_IMEI_OBRIGATORIO`.

## Testes

- Unitários: `lib/aparelhos/aparelhos-domain.test.ts`.
- PG real: `scripts/aparelhos/prepare-pg.mjs` + `test/aparelhos/aparelhos.pg.test.ts`.
- E2E navegador: `scripts/aparelhos/run-aparelhos-e2e.mjs` (build de produção + PG descartável).
- CI: `.github/workflows/aparelhos.yml`.

## Continuidade

Commits pequenos na branch; cada etapa acima tem teste próprio. Para retomar: `git log
--oneline origin/main..claude/aparelhos-endtoend-001`, rodar `prepare-pg` + testes PG, depois o E2E.
