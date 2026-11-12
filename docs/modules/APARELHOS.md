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
Cadastros; técnico cadastra/avalia sem vender. IMEI completo só para gerente/proprietário na lista
(documentos impressos trazem o IMEI completo, que identifica o bem do cliente).

## Bloqueios conhecidos (não fingidos)

- **Pagamento da compra de cliente**: o protocolo registra forma/situação, mas NÃO lança saída no
  caixa nem conta a pagar — não há contrato canônico para isso neste escopo. Integração em PR
  separada (`lib/financeiro`).
- **Consulta oficial de restrição de IMEI**: sem integração autorizada. Só conferência manual
  registrada (fonte, data, operador). O sistema nunca afirma "limpo" sem registro.
- **Devolução (F8)**: não integrada; o F8 em andamento poderá recuperar a unidade exata por
  `AparelhoVenda.aparelhoId` (transição `vendido → devolvido` já prevista).
- **Impressora física 80 mm**: preview validado no navegador; papel/térmica não testados.

## Testes

- Unitários: `lib/aparelhos/aparelhos-domain.test.ts`.
- PG real: `scripts/aparelhos/prepare-pg.mjs` + `test/aparelhos/aparelhos.pg.test.ts`.
- E2E navegador: `scripts/aparelhos/run-aparelhos-e2e.mjs` (build de produção + PG descartável).
- CI: `.github/workflows/aparelhos.yml`.

## Continuidade

Commits pequenos na branch; cada etapa acima tem teste próprio. Para retomar: `git log
--oneline origin/main..claude/aparelhos-endtoend-001`, rodar `prepare-pg` + testes PG, depois o E2E.
