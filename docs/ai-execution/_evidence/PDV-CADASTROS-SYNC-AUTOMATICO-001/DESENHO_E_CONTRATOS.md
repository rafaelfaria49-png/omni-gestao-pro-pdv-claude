# DESENHO_E_CONTRATOS — PDV-CADASTROS-SYNC-AUTOMATICO-001

Sem mudança de schema, migration, auth ou proxy. Rota nova: nenhuma (só o parâmetro `versionOnly`).

## 1. Versão do catálogo por loja

- `lib/estoque/catalog-version.ts`: `v1:{count}:{max(updatedAt) ms}` via `produto.aggregate({ where: { storeId } })`.
- `GET /api/ops/inventory?lojaId=X&versionOnly=1` → `{ storeId, version }`, `Cache-Control: no-store`.
  Usa o mesmo gate da carga completa (módulo, sessão, acesso à loja, assinatura).
- A carga completa traz `version`, lida **antes** do `findMany`: uma escrita no meio deixa a versão
  velha e o próximo check refaz. Falha ao ler a versão **não** derruba a carga (`version: null`).

## 2. Controlador e gatilhos (`lib/estoque/catalog-sync.ts` + `operations-store`)

- Um voo por vez; checks não forçados a menos de 3 s um do outro são ignorados.
- Check forçado substitui o que estiver em voo; resposta de pedido anterior é descartada
  (`superseded`). Depois do `dispose` (troca de loja) nada é aplicado.
- Só aplica snapshot cujo `_lojaIdRecebido` é a loja do provider; a versão só vale se `storeId` bate.
- `apply` troca **apenas** `inventory`, com o mesmo ajuste de devolução pendente da carga inicial.
  Carrinho, pendências, sessão de caixa e fila nunca são tocados.
- Gatilhos: foco, `visibilitychange` (visível), `online` e intervalo de 30 s com a aba visível.
  Esses só valem **com um PDV montado** (`watchCatalogSync`), porque o provider envolve o dashboard
  inteiro. O aviso de cadastro salvo e a abertura do PDV valem sempre. Só passa a checar depois da
  carga inicial; ao habilitar, faz um check para fechar a janela de corrida com a carga.
- Service worker: as chamadas do controlador levam `catalogSync=1`, roteado como **NetworkOnly** em
  `next.config.mjs` (o NetworkFirst de `/api/*` devolveria catálogo velho em rede lenta). A carga
  inicial do PDV continua cacheável, para abrir offline. Com `navigator.onLine === false` nem tenta.
- Efeito colateral evitado: o PUT legado de `/api/ops/ordens` reagia a qualquer mudança de
  `inventory`; agora reage só a ordens (é só o que ele envia).
- Custo: `versionOnly` é um `count` + `max` indexado por `storeId` e devolve dezenas de bytes. O
  snapshot só é baixado quando a versão muda.

## 3. Carrinho por `Produto.id`

- Linha nasce com `produtoId` (cuid) e `catalogUnitPrice` (preço do catálogo naquele momento).
  Peso usa preço/kg; atributo e acessório usam o preço base.
- `reconcileCartWithCatalog` (puro) roda a cada mudança de catálogo ou de carrinho:
  - SKU ou código trocado: reaponta o `inventoryId` operacional, sem revisão;
  - preço de catálogo ≠ `catalogUnitPrice`: divergência de preço ("Usar R$ novo" ou "Manter R$ do carrinho");
  - saldo controlado < quantidade somada do produto: divergência de saldo ("Ajustar para N", quando
    cabe algo descontando as outras linhas do produto, ou "Remover"). Manter não adianta: o PDV e o
    servidor recusam a venda acima do saldo;
  - produto sumiu do catálogo da loja: divergência de exclusão ("Remover");
  - linha antiga sem `produtoId` (venda em espera, comanda): adota a identidade pelo id exato;
  - avulso, serviço, O.S., complemento e voz: nunca tocados. Catálogo vazio: nenhuma divergência.
- O efeito aplica o resultado sobre o estado **mais novo** (`setCart(prev => …)`): uma linha incluída
  no meio não se perde.
- Abrir pagamento e confirmar ficam bloqueados enquanto houver divergência.
- A finalização envia `produtoId` da linha; o store o prefere à busca no catálogo.
  O servidor (#324) resolve só por `{ storeId, id }`.
- Venda em espera guarda `produtoId` e `catalogUnitPrice` (campos aditivos e opcionais).

## 4. Desfecho da tentativa (`classifySaleAttemptOutcome`)

| Desfecho | Quando | Efeito no PDV |
|---|---|---|
| CONFIRMED | 2xx | conclui |
| REJECTED | 4xx com código em `DEFINITIVE_REJECTION_CODES` | venda **nova**: FAILED, carrinho mantido, tentativa local descartada, catálogo ou caixa recarregados, **não trava** a próxima venda |
| UNKNOWN | rede, timeout, 5xx | PENDING com a mesma identidade; o replay do servidor evita duplicar |
| ACTION_REQUIRED | demais 4xx (drift, caixa original fechado) | PENDING; Reenviar da mesma venda |
| QUARANTINED | conflito de identidade | quarentena (inalterado) |

`DEFINITIVE_REJECTION_CODES`: PRODUTO_NAO_RESOLVIDO, ESTOQUE_INSUFICIENTE,
PAGAMENTOS_TOTAL_DIVERGENTE, LINHAS_VENDA_INVALIDAS, FRACTIONAL_QUANTITY_UNSUPPORTED,
PRODUTO_POR_PESO_NAO_OPERACIONAL, PRODUTO_COMERCIAL_INVALIDO, CREDITO_VALE_INSUFICIENTE,
CAIXA_FECHADO, SESSAO_INVALIDA. Todos são lançados dentro da transação da venda, antes do commit.

Identidade reaproveitada (mapa compartilhado de tentativas, possível pendência em outra aba) nunca cai
em FAILED. Pendência existente nunca é apagada.

## Idempotência preservada

- Nenhuma mudança no writer, no replay ou nos fingerprints (`produtoId` fora deles: #324).
- Reconciliar o carrinho não cria identidade; só finalizar cria, como antes.
- O FAILED só descarta uma tentativa que o servidor provou não ter gravado.
