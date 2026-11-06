# REVISAO_INDEPENDENTE — PDV-CADASTROS-SYNC-AUTOMATICO-001

Revisor: subagente Claude separado, com contexto próprio, somente leitura, sem banco nem rede.
Base da revisão: `git diff 0ddd5a7..HEAD`. Não é SELF_REVIEW.

## R1 — sobre `6786972` → **REQUEST_CHANGES**

| # | Sev. | Achado | Tratamento |
|---|---|---|---|
| F1 | P1 | E2E nunca passava do seletor de terminal (contexto novo sem terminal) nem tinha `guardOnboarding` no PDV | **Corrigido**: `abrirPdv` trata "Usar" / "Continuar sem terminal" |
| F2 | P1 | Segundo bipe criava segunda linha → duas divergências → *strict mode* e painel não zerava | **Corrigido**: sem segundo bipe; prova do SKU novo = a linha reapontada |
| F3 | P3 | "Carrinho intacto" casava com o texto do painel | **Corrigido**: asserções presas à linha do carrinho |
| F4 | P3 | Ramo FAILED só coberto por contrato textual | **Corrigido**: `finalizeFailureDisposition` puro, testado em execução |
| F5 | P3 | "Ciente, manter" saldo não levava a nada (PDV/servidor bloqueiam) | **Corrigido**: "Ajustar para N" ou "Remover" |
| F6 | P3 | Polling em toda tela do dashboard; cada catálogo novo disparava PUT de ordens | **Corrigido**: checks automáticos só com PDV montado; PUT só reage a ordens |
| F7 | P3 | NetworkFirst do SW podia reaplicar snapshot velho | **Corrigido**: `catalogSync=1` NetworkOnly; offline nem tenta |
| F8 | P3 | Linha legada sem `produtoId` adota pelo id (troca de SKU entre produtos) | **Documentado** como limite conhecido |

Verificado como seguro no R1: todos os códigos de `DEFINITIVE_REJECTION_CODES` saem de
`upsertVendaInTransaction` dentro do `$transaction` (V1 e V2), antes do commit. Nenhuma resposta
pré-transação usa esses códigos, e `SESSAO_INVALIDA` nunca é emitido pelo servidor. O fallback V2→V1 é
seguro. POSTs concorrentes da mesma identidade não geram REJECTED falso. Isolamento por loja e proteção
contra resposta velha conferidos. O efeito de reconciliação converge e não perde linhas. Peso, atributo,
acessório, avulso, complemento e espera não geram divergência falsa. Todas as escritas de `Produto`
atualizam a versão.

## R2 — sobre `411184e` → **APPROVE**

F1 a F8 corrigidos, sem P0 a P2 novo. 19 arquivos relacionados com 290 testes passando; typecheck limpo.

Premissas da E2E que o revisor não pôde confirmar sem rodar:
- o código exibido na linha é o SKU porque o produto de teste não tem código de barras; se o Cadastros
  passar a gerar EAN automático, as asserções de `title` quebram;
- a volta da rede pode cair dentro do intervalo mínimo de 3 s; nesse caso o check de 30 s cobre,
  dentro do timeout de 50 s.

Nota não bloqueante: os checks automáticos valem só com o PDV Clássico montado. Os outros PDVs recebem
os avisos de cadastro e o check ao montar, coerente com o escopo.
