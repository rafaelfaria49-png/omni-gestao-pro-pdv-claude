# Checklist de lojas — antes da janela do estoque KG

**Modelo de preparação do J0, sem preenchimento ou execução neste A5.** A6–A8 e J0–J13 não estão
autorizados por `ESTOQUE-KG-PRODUCTION-A5-RUNBOOK-001`. Este documento não autoriza consulta produtiva,
fechamento de caixa, reenvio de venda, alteração de pagamento ou operação na Vercel.

| storeId comercial | Loja | Nome no cadastro histórico A1.1 |
| --- | --- | --- |
| `loja-1` | **RafaCell** | RAFACELL ASSISTEC |
| `loja-2` | **Rafa Brinquedos** | RAFA BRINQUEDOS E VARIEDADES |

Identificar lojas por **storeId**, não só por nome: o A1.1 registrou uma `loja-11` de teste com nome igual
ao da loja-2. A consulta de caixas deve abranger também lojas de teste e demais storeIds.
O último relato específico é o **A3, 2026-10-29 09:39Z: loja-1 aberta e loja-2 fechada**. A loja-2 aberta
no A1/A1.1 é retrato anterior. Nenhum desses registros substitui a conferência na janela autorizada.

Feito pelo operador de **cada terminal real**, com o responsável no
telefone, **antes** de ligar a trava. Ninguém de fora abre PDV/Vendas em outro navegador: abrir essas telas
reenvia vendas pendentes sozinho (a cada 30 s), então conferir é tarefa do próprio terminal.

Por que importa: a fila de vendas pendentes vive no navegador, **por endereço**. Uma aba aberta numa URL
de deployment antigo só reenvia para aquele deployment; depois do corte ele não alcança mais o banco e a
venda fica presa naquele navegador (não some, mas não chega). Tempo de espera não resolve isso; só a
conferência abaixo.

## Inventário físico e de origens (uma linha por terminal real e perfil/PWA)

As linhas vazias são modelo, não uma lista de terminais já conhecidos. Acrescentar todos os computadores,
celulares, perfis de navegador e PWAs usados pelas lojas, incluindo os offline, guardados e com URLs antigas.
Não limpar cache, dados do site ou fila para zerar pendências; isso pode apagar a única cópia da venda.

| storeId | Loja | Identificação física / terminalId | Navegador e perfil ou PWA | URLs/atalhos atuais e antigos | Operador / hora |
| --- | --- | --- | --- | --- | --- |
| loja-1 | RafaCell | | | | |
| loja-1 | RafaCell | | | | |
| loja-2 | Rafa Brinquedos | | | | |
| loja-2 | Rafa Brinquedos | | | | |

## Por terminal (preencher uma linha para cada origem inventariada)

| storeId | Terminal / perfil / origem | Caixa encerrado? | Pendências online/offline | Pagamento em andamento ou sem confirmação? | Devolução/vale pendente? | Abas/PWA fechados? | Responsável / hora |
| --- | --- | --- | --- | --- | --- | --- | --- |
| loja-1 | | | | | | | |
| loja-1 | | | | | | | |
| loja-2 | | | | | | | |
| loja-2 | | | | | | | |

1. **Endereço**: o certo é `https://omni-gestao-pro.vercel.app`. Qualquer outro — `omni-gestao-…-rafaelfaria49-4373s-projects.vercel.app`,
   `omni-gestao-pi.vercel.app`, `localhost` — anotar e tratar primeiro (passo 3), **antes** do corte.
   No app instalado (PWA), conferir em "Sobre/Abrir no navegador" qual endereço ele abre.
2. **Caixa**: fechamento normal pelo responsável e sob autorização operacional própria, feito e conferido;
   **nenhuma sessão ABERTA antes da abertura do J0**, em qualquer storeId. Não abrir caixa até a reabertura
   autorizada no J13. Este A5 não confere nem fecha caixa.
3. **Vendas pendentes**: tela de Vendas/Pendências mostra **0**. Se houver:
   - endereço certo e internet ok → deixar a tela aberta até zerar (o reenvio é automático) e conferir de novo;
   - venda com "ação necessária" → **não** clicar em reenviar; anotar pedido, itens, pagamentos e o
     identificador da venda/`clientSaleId` e encaminhar ao responsável pelo canal operacional aprovado;
   - endereço errado → tratar com o responsável **antes da janela**, sem mover a fila para outra origem;
     quando a sincronização for autorizada, fazê-la na própria origem ainda compatível com o banco `integer`;
     se não zerar, preservar como acima e bloquear o J0 até decisão expressa sobre o tratamento.
4. **Pagamento em andamento**: nenhum PIX aguardando, nenhuma maquininha/TEF com transação aberta, nenhuma
   tela de pagamento aberta. Venda paga sem confirmação → preservar comprovante, forma, horário e identidade
   da venda em registro operacional protegido; não cobrar novamente, cancelar ou reenviar por suposição.
   Resolver a confirmação ou registrar decisão expressa do responsável antes de liberar o J0.
5. **Devolução / vale-crédito** pendente de envio: 0.
6. **Terminal offline ou não localizado**: bloquear o J0 e a trava até voltar e ser conferido. Uma fila que
   não pôde ser inspecionada não vale como zero. Anotar responsáveis e preservar os dados locais.
7. **Fechar** todas as abas e o app do sistema. Não vender durante a janela.

## Todas as sessões de caixa — conferência autorizada antes do J0

Somente no preflight da janela expressamente autorizada, usar o alvo do runbook: projeto `dry-mouse-36002471`,
branch `br-muddy-meadow-ac7ah2wl`, endpoint `ep-summer-tooth-acltc6wi`, database `omnigestao_prod`.
Conferir identidade e READ ONLY na mesma sessão, abortando se qualquer identificador divergir.
Não filtrar apenas loja-1/loja-2: sessões antigas ou de teste também impedem o J0.

```sql
BEGIN READ ONLY;
SELECT 'KG_J0_IDENTIDADE_OK'
WHERE 1 / CASE WHEN current_setting('neon.project_id', true) = 'dry-mouse-36002471'
  AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
  AND current_setting('neon.endpoint_id', true) = 'ep-summer-tooth-acltc6wi'
  AND current_database() = 'omnigestao_prod'
  AND current_setting('transaction_read_only') = 'on' AND NOT pg_is_in_recovery()
  THEN 1 ELSE 0 END = 1;
SELECT "storeId", id AS "sessaoId", "abertaEm", status
FROM public.sessoes_caixa WHERE status = 'ABERTA' ORDER BY "storeId", "abertaEm", id;
SELECT count(*) AS total_abertas FROM public.sessoes_caixa WHERE status = 'ABERTA';
ROLLBACK;
```

Executar o trecho somente com `ON_ERROR_STOP=1` (psql `-X -v ON_ERROR_STOP=1`), sob a autorização futura.
Registrar cada sessão encontrada e repetir a leitura depois do tratamento autorizado; a leitura não fecha sessão.
O conjunto final de sessões ABERTA deve estar vazio e `total_abertas=0` **antes de declarar o J0**.

| storeId | sessaoId | Aberta desde | Tratamento pelo responsável / autorização | Última conferência / hora |
| --- | --- | --- | --- | --- |
| | | | | |

## Inventário de deployments no início da janela

Registrar horário, projeto e responsável pelo inventário integral autorizado da Vercel. Os números
14/15 Production e 56 previews dos documentos anteriores são **retratos históricos**, não o universo atual.
O recorte UI do A4 (18 metadados) também não é inventário integral de deployments.

| Projeto / alvo | Deployment ID | SHA / código Int ou Float | URL / origem usada por terminal | Papel / destino e fonte direta ou inferida | Criado / inventariado em |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Incluir Production, previews legados com credencial antiga e qualquer nova criação desde o inventário anterior.
Não registrar URLs com senhas, tokens ou parâmetros de autenticação. Comparar IDs/SHA com as origens dos
terminais. **Expiração, exclusão ou proteção HTTP não substituem o corte de CONNECT + encerramento de sessões.**
Repetir as verificações de novos deployments nos gates J4/J7; não acessar o app real apenas para inventariar URLs.

## Para o responsável — gate de abertura do J0

- [ ] loja-1 RafaCell e loja-2 Rafa Brinquedos devolveram as tabelas completas, com storeId e responsável/hora.
- [ ] Todos os terminais reais, navegadores/perfis, PWAs, URLs antigas e origens da fila foram localizados e conferidos.
- [ ] Nenhum terminal offline ou não localizado permanece sem conferência.
- [ ] Nenhum terminal fora de `omni-gestao-pro.vercel.app`, ou os que estavam já zeraram.
- [ ] Pendências zeradas em cada origem; eventuais exceções preservadas e aceitas por decisão expressa com plano
      e **mesma identidade** (`clientSaleId`), sem aprovação implícita por este checklist.
- [ ] Nenhum pagamento em andamento ou sem decisão documentada sobre confirmação; devoluções/vales tratados.
- [ ] Todas as sessões ABERTA identificadas por storeId/sessaoId, inclusive teste; leitura final = **0 antes do J0**.
- [ ] Inventário integral de deployments atualizado no início da janela, confrontado com as URLs dos terminais.
- [ ] Reconciliação da #315 com `aaab275`/main então atual concluída e CI/revisão verde do head final exato.
- [ ] Pendência `cron.job` no auxiliar `postgres` resolvida por leitura com autorização específica; escritores mapeados.
- [ ] A6 decidido, A7 confirmado e A8/congelamento do runbook autorizados; versão/SHA documental da janela registrados.
- [ ] Todas as abas/PWAs fechados; nenhuma venda ou abertura de caixa até a reabertura autorizada.
- [ ] `SALE_SERVER_NUMBERING_ENABLED` e o projeto canônico **não** serão alterados na janela (trocar o writer
      duplica venda confirmada cuja resposta se perdeu — `30-fila-pdv.txt`).

**GO/NO-GO do J0:** __________ · responsável: __________ · data/hora: __________ · autorização: __________

Nenhum campo está preenchido ou aprovado no A5. Qualquer item desconhecido ou gate falho impede a abertura.

## O que foi provado sobre a fila (isolado, handlers reais)

`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/30-fila-pdv.txt`:
trava ligada → 5xx e a fila classifica como reenvio automático, sem nenhum efeito parcial (venda, item,
financeiro, livro, saldo); trava desligada → grava uma vez; reenvio da mesma venda (resposta perdida),
reenvio em paralelo e reenvio sob nova trava → replay, sem duplicar; venda gravada antes da janela e
reenviada depois → replay. Na base daquele ensaio, o formato da fila era igual entre a main e a PR;
revalidar a compatibilidade no head final reconciliado, sem extrapolar a prova histórica para `aaab275`.
