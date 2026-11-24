# SaaS automático — regras comerciais

GOAL `OMNI-SAAS-AUTOMATICO-ARQUITETURA-ROADMAP-000` · 2026-11-23 · base `d613656`.

Este documento separa três coisas que não podem se misturar:

- **APROVADA** — definida pelo proprietário no GOAL-000 (2026-11-23). Pode ser implementada.
- **PROPOSTA** — desenho desta arquitetura. Só vira regra com aceite do proprietário.
- **PENDENTE** — decisão sem proposta suficiente; precisa de informação do proprietário.

Fonte única da oferta no código hoje: `lib/comercial/gestao-lojas-oferta.ts`
(`OFERTA_COMERCIAL_GESTAO_LOJAS`). No SAAS-001A ela passa a ser lida do catálogo de planos
`lib/saas/planos.ts`, sem mudar valores.

---

## 1. Oferta inicial

| Regra | Valor | Estado |
|---|---|---|
| Nome | OmniGestão Pro — Vendas e Estoque | APROVADA |
| Preço | R$ 69,90 por mês, **por loja** | APROVADA (o "por loja" é PROPOSTA — ver §6) |
| Usuários | até 2 por loja (inclui o administrador) | APROVADA; "inclui o administrador" é PROPOSTA |
| Teste gratuito | 7 dias | APROVADA |
| Cartão no cadastro | não exigido | APROVADA |
| Contratação | voluntária, durante ou após o teste | APROVADA |
| Cadastro e provisionamento | sem intervenção humana | APROVADA |
| Dados ao vencer | preservados | APROVADA |
| Renovação e reativação | possíveis a qualquer tempo | APROVADA |
| Ações manuais do administrador | liberar acesso, estender teste, condições especiais | APROVADA |
| Módulos incluídos | `BASIC_MODULE_ACCESS`: início, PDV, vendas, caixa, cadastros, estoque, relatórios, configurações | APROVADA (equivale ao pacote do piloto) |
| Módulos não incluídos | assistência técnica (OS), catálogo de aparelhos, IA, agente, marketing, marketplace, contador, WhatsApp, financeiro completo, fiscal, experimentos | APROVADA: o plano **não concede** esses módulos automaticamente |
| Emissão fiscal | não incluída; comprovante é não fiscal | APROVADA (já é a regra do piloto, `LANCAMENTO_PILOTO_PAGO_001.md` D1) |

## 2. Contagem de usuários (PROPOSTA)

- Conta quem tem `active = true`, `accessScope = STORE` e vínculo com a loja (`lojaId` ou
  `AdminUserStore`), **incluindo o ADMIN**. Contas da plataforma nunca contam.
- Usuário com acesso a 2 lojas da mesma organização conta 1 em cada loja.
- Baixar o limite **não desativa ninguém**: só impede criar, reativar ou mover usuário para a loja.
- Lojas legadas (sem organização: RAFACELL `loja-1`, `loja-2`, pilotos manuais) **não têm limite**.

## 3. Teste gratuito

| Regra | Estado |
|---|---|
| Começa no momento em que o email é verificado e a loja é criada (não no envio do formulário) | PROPOSTA |
| Dura exatamente 7 × 24 h a partir desse instante, gravado em `trialEndsAt` no servidor | PROPOSTA |
| Um teste por pessoa/empresa: email normalizado, WhatsApp e (quando houver) documento | PROPOSTA |
| Aviso no sistema a partir do 5º dia; emails no 5º e no 7º dia | PROPOSTA |
| O administrador pode estender o teste (motivo obrigatório, auditado); total máximo sugerido 30 dias sem aprovação extra | PROPOSTA (o teto é PENDENTE D-05) |
| Não há cobrança ao fim do teste se o cliente não contratou | APROVADA ("sem exigência de cartão") |

## 4. Contratação durante o teste (PROPOSTA)

**Política recomendada: os dias gratuitos não se perdem.**

- Contratou no dia 3 → a assinatura nasce `active` com `currentPeriodStart = trialEndsAt`; o
  primeiro vencimento é a data do fim do teste. O acesso continua pleno sem interrupção.
- Contratou depois do fim do teste → o ciclo começa na data do pagamento confirmado.
- Dia de vencimento mensal = dia do início do ciclo (dias 29–31 → último dia do mês).
- Pix avulso: cobrança emitida **5 dias antes** do vencimento (prazo PENDENTE D-06).
- Cartão / Pix Automático: débito no vencimento.

Alternativa rejeitada: cobrar no ato e iniciar o ciclo na hora — penaliza quem contrata cedo e
desestimula a conversão.

## 5. Vencimento, inadimplência e acesso limitado (PROPOSTA)

| Situação | Acesso | Prazo |
|---|---|---|
| Teste vencido sem contratação | **limitado** (consulta, exportação, contratação, fechamento de caixa aberto) | imediato |
| Mensalidade vencida (Pix/boleto não pago, cartão recusado) | pleno durante a **carência** | 3 dias (PENDENTE D-07) |
| Após a carência | limitado | até pagar |
| Cancelamento voluntário | pleno até o fim do período pago; depois limitado | fim do período |
| Suspensão administrativa | limitado (padrão) ou bloqueado (fraude/abuso, motivo obrigatório) | até reativação manual |
| Pagamento confirmado em qualquer estado acima | pleno em até 1 minuto (webhook) | — |

**Nunca** interromper uma venda, um recebimento ou um caixa aberto no momento do vencimento:
as regras exatas estão em `SAAS_AUTOMATICO_ARQUITETURA.md` §6.

## 6. Retenção de dados (PROPOSTA — depende de jurídico)

| Situação | Regra |
|---|---|
| Teste vencido, assinatura cancelada ou inadimplente | dados **preservados**; nada é apagado por vencimento |
| Pedido de exclusão da organização | exportação oferecida; exclusão após `[[30]]` dias, exceto registros com guarda legal (vendas, caixa — `[[5 anos]]`, validar com contador) |
| Conta abandonada (teste vencido, nenhum acesso) | após `[[12 meses]]`, aviso por email; exclusão só com nova decisão do proprietário — **nunca automática nesta fase** |
| Cadastro não verificado | apagar após 7 dias (dado pessoal sem finalidade) |

Prazos entre `[[ ]]` são PENDENTES (D-08). Coerente com `PRIVACIDADE_TERMOS_PROPOSTA_PILOTO.md` §3.

## 7. Condições especiais (APROVADAS como capacidade; valores PENDENTES)

O administrador autorizado da plataforma pode, sempre com motivo e trilha de auditoria:

1. liberar acesso pleno sem pagamento por prazo definido ("cortesia");
2. estender o teste;
3. aplicar desconto (percentual ou valor, com prazo ou permanente);
4. alterar preço contratado de uma organização (preço travado — "grandfathering");
5. liberar módulo extra por loja (já existe: "Liberação por loja"); fora do plano = condição especial registrada;
6. suspender e reativar.

Quem pode fazer cada ação: PENDENTE D-12 (hoje só existe autoridade de plataforma binária).

## 8. Preparação para ofertas futuras (desenho, não implementado)

O catálogo de planos (`lib/saas/planos.ts`) descreve cada plano com:
`id`, `nome`, `precoMensalCentavos`, `limiteUsuariosPorLoja`, `modulos[]`, `diasTeste`,
`ativoParaVenda`, `versao`. A assinatura guarda **cópia** do preço e do limite contratados
(`precoContratadoCentavos`, `limiteUsuariosPorLoja`), para que mudar o catálogo não altere
contratos em andamento. Módulos adicionais futuros entram como `SubscriptionAddon`
(não criado agora). Os planos Essencial / Comércio / Comércio Plus continuam só como registro
histórico (`PLANOS_GESTAO_LOJAS`), sem venda.

## 9. Separação obrigatória

A mensalidade do OmniGestão é **receita da plataforma**. Nunca é gravada em `ContaReceberTitulo`,
`MovimentacaoFinanceira`, `SessaoCaixa`, `Venda` ou qualquer tabela do Financeiro/Caixa/PDV
do lojista. As tabelas de assinatura não têm `storeId` de lojista como dono — têm `organizationId`.

## 10. Lista de decisões pendentes

Consolidada em `SAAS_AUTOMATICO_ROADMAP_MASTER.md` §6 (D-01 … D-17).
