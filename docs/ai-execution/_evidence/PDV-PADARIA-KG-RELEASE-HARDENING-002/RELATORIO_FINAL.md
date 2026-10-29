# Relatório final — PDV-PADARIA-KG-RELEASE-HARDENING-002

Hardening concluído localmente. A implementação e a integração isolada passaram; a liberação produtiva continua impedida pelos limites operacionais e gates abaixo. Nenhum push, merge, deploy, Preview ou acesso a banco produtivo foi realizado. Os commits 26dbb19 e 606eaac permanecem na história.

```text
GOAL=PDV-PADARIA-KG-RELEASE-HARDENING-002
MIGRATION_COMPATIBILITY=PASS
OLD_PRISMA_CLIENT_RISK=CONTROLLED
KG_SALE=PASS
PARTIAL_RETURN=BLOCKED
ITEM_CORRECTION=PASS
HISTORICAL_RECOVERY=BLOCKED
KG_TAX_ESTIMATE=PASS
FULL_CANCELLATION=PASS
PR322_COMPATIBILITY=PASS
A01_STORE=PASS
E2E=PASS
INDEPENDENT_REVIEW=APPROVE
LOCAL_COMMITS=436b862f3c6c9b83aa23cfa795fc462028922bf6,9d5716d0dd559ec16fffed6495fa5b202d06a7cd
PRODUCTION_WRITES=0
PUSH=NO
MERGE=NO
DEPLOY=NO
RELEASE_READY=NO
REMAINING_BLOCKERS=devolução parcial/troca/vale KG; criação por recovery histórico KG; retirada dos leitores antigos nas lojas KG; gates próprios #315/A6 e autorização separada de publicação/habilitação
```

O commit adicional que versiona este relatório e suas evidências é informado no encerramento do chat. ITEM_CORRECTION=PASS cobre somente o caminho restrito descrito abaixo; não declara suporte geral de correções.

## Migration e clientes antigos

A prova com o cliente Prisma exato da #315 (104d768) reproduziu o risco do desenho Float: uma escrita Int de 13 armazenou 6.4e-323. A solução aditiva mantém o OID int4 de quantidade para UN e acrescenta quantidadeKg decimal. KG usa quantidade nula, inclusive para 1 kg. O CHECK exige representação exclusiva e precisão de três casas; não há cast/truncamento de históricos.

O cliente antigo continua lendo/escrevendo/incrementando UN, inclusive 2147483647, e falha com P2032 ao ler KG. As barreiras também impedem writers antigos de alterar Venda/itens/estoque/financeiro/títulos/crédito ou devolver KG sem referência válida. RLS e sombra de tabelas temporárias foram exercitadas. A migration recusa uma base com o Float piloto; essa base exigiria reconciliação própria.

CONTROLLED significa controle técnico demonstrado no ambiente descartável e procedimento de retirada obrigatório. Consultas antigas de payload/COUNT continuam possíveis, e SUM(quantidade) ignora KG nulo: leitores/agregadores antigos não podem permanecer ativos nas lojas habilitadas. A liberação não foi autorizada nem executada.

## Operações concluídas e bloqueios

- Venda KG/UN e carrinho misto: quantidades em gramas inteiros, preços/totais em centavos, writers V1/V2, saldo, depósito, ledger e idempotência preservados.
- Imposto estimado: configuração da loja lida no servidor e snapshot congelado, sem habilitação fiscal. O total do navegador precisa coincidir com o cálculo autoritativo.
- Correção: um item KG, somente peso, dinheiro, sem desconto, sem devolução/vale/título/documento fiscal, sessão e períodos abertos. Mantém linha/produto/preço/alíquota originais. Comando idempotente, revisão e locks protegem estoque e financeiro na mesma transação; falhas desfazem tudo.
- Cancelamento integral: sessão, período, permissão, step-up e recebíveis preservados. KG inclui títulos/estornos na mesma transação; crédito e estoque retornam uma vez. Cancelamento é terminal e incrementa revisão.
- Releitura/rede: snapshot autenticado atual antes de efeitos locais, revisão monotônica, isolamento entre lojas e escopo de dia/sessão. O reenvio original reconhece a venda mesmo após correção auditada. Foi corrigida a regressão de payload sem at, usando a data da coluna do banco.
- Devolução parcial/troca/vale de devolução KG: bloqueados no servidor, banco e interface. Dependem de identidade/quantidade da linha, teto concorrente por item e crédito/refund server-first atômico.
- Recovery histórico que criaria KG ausente: bloqueado antes do planejamento inteiro. Requer política própria para déficit, ajuste posterior absorvido e sessão/identidade históricas. Releitura e reconciliação de venda já confirmada continuam suportadas.
- Fiscal KG e correções fora da restrição: permanecem bloqueados; comprovante não fiscal disponível.

## Validação final

| Verificação | Resultado |
| --- | --- |
| PostgreSQL 17 descartável + contratos | 54 aprovados, 0 falhas |
| Migration + cliente exato #315 + RLS | 35 provas aprovadas |
| Suíte ampliada | 940 aprovados; 35 falhas idênticas à baseline; 50 testes condicionais não ativados nessa rodada |
| Comparação das falhas da baseline | Mesmos nomes; 0 regressões novas |
| E2E autenticado na worktree | 11 aprovados; 1 cenário exclusivo da #322 intencionalmente não executado |
| E2E autenticado na integração com #322 | 12 aprovados; 0 falhas; 0 retries |
| Contratos/visor/configuração/cache na integração | 113 aprovados |
| Typecheck separado | PASS na worktree e na integração |
| Lint dos 41 arquivos de código envolvidos | 0 erros; 5 avisos; delta final de testes sem erros |
| Lint global | 105 erros/108 avisos; os 105 erros são idênticos à baseline, nos mesmos cinco arquivos arquivados intocados |
| Build da worktree e da integração | PASS; MIGRATION_SKIPPED e PROXY_PRISMA_ARTIFACT_VERIFIED confirmados |
| Revisão independente | APPROVE; nenhum P0/P1 remanescente |

As falhas intermediárias não foram ocultadas: o E2E detectou e levou à correção da data ausente na leitura KG. Também foram corrigidos os fixtures de DTO de pagamento, reentrada de terminal, sincronização da busca antes do menu e encerramento do teste de visor após o comprovante. O runner não ganhou retries nem bypass de autorização/caixa. As falhas de mock da suíte financeira foram resolvidas ensinando os mocks a reconhecer a nova barreira transaction-local; UN manteve sua escrita original.

Os E2Es usam contas, PIN, dinheiro e produtos sintéticos e Web Serial simulado. Não validam balança física ou emissão fiscal. Service workers ficam bloqueados no Playwright; a dependência PWA não modificada registra erro de waiting nesse modo. O comportamento transacional testado passou; retirada/verificação de PWAs instalados integra o preflight de publicação.

## Main e visor #322

Referência fixada: 35a3971c31f62e6e802b7dd8763be81475334780. A árvore de integração calculada por merge-tree não teve conflitos. A exportação usada para os testes foi comparada com a árvore 1a7d0ce82e38c8af116bcfe23f7283dc756e288c: 4.864 arquivos fora de documentação/arquivos de ambiente, sem diferenças de conteúdo; 43 diferenças físicas eram somente CRLF/LF. Não houve merge na branch nem alteração da worktree #315/A6.

O teste integrado recebe 9,999 e 8,888 kg no visor e comprova campo manual inicialmente vazio, peso digitado 0,350 preservado e persistência de 0,350 kg/R$7,00. Nenhum peso recebido alimenta a transação.

## Publicação e rollback — somente plano

O [runbook específico](../../../padaria/pesagem/VENDA_MANUAL_KG_RELEASE_HARDENING.md) contém sequência e preflight completos. A ordem é: autorização separada e gates #315/A6; contenção/drenagem de todas as escritas relacionadas; migration de estoque #315 conforme sua autoridade; expansão aditiva de venda antes dos novos clientes Prisma; binário compatível com KG desligado; retirada dos leitores/writers antigos; validação de UN; nova autorização para allowlist de uma loja por vez.

Rollback preferido: desligar criação KG e conservar schema/binário ponte compatíveis. O teste com release OFF confirmou replay, ACK de correção já comprometida, leitura e UN, recusando KG novo sem efeitos. Após qualquer KG, até inteiro/cancelado, não remover a coluna decimal nem voltar ao cliente Int obrigatório. Nunca truncar/apagar histórico para permitir downgrade. O plano não foi executado em produção.

## Evidências

- [Validação estruturada](validation.json), [compatibilidade da migration](migration-compatibility.json) e [histórico UN preservado](migration-history.json).
- [Comparação com baseline](baseline-comparison.json), [integridade da integração](main-source-integrity.json) e [revisão independente](INDEPENDENT_REVIEW.md).
- [Correção e releitura](corrected-weight.png), [bloqueio de devolução](return-blocked.png), [modal mobile](mobile-weight.png), [Caixa Seguro](caixa-seguro-store.png) e [visor independente do peso manual](pr322-independent-weight.png).

O cluster descartável foi parado ao fim. Nenhuma credencial, papel ou recurso produtivo foi alterado. A01/STORE e o Caixa Seguro mantêm seus mecanismos existentes.
