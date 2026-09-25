# Autoridade oficial da semântica 588 — GOAL 023 (P1-followup da revisão independente)

Distingue FATO OFICIAL (fonte primária verificada) de CONSEQUÊNCIA DE PROJETO
(decisão da matriz). A matriz 588 NÃO foi alterada por este follow-up:
`CSTAT_588_MATRIX_CHANGED=false`. Nenhuma contradição oficial encontrada.

## A) FATO OFICIAL — rejeitada não é gravada; denegada é gravada e mata o número

Fonte primária verificada em 2026-09-22 (leitura pública, sem transmissão):
SEFAZ-SP, NF-e — Perguntas Frequentes, "V. Modelo Operacional", questão 2
("Quais são as validações realizadas pela Secretaria da Fazenda na
autorização de uma NF-e?"):
`https://www.fazenda.sp.gov.br/nfe/perguntas_frequentes/respostas_V.asp`

Verbatim (questão 2):

- "Caso na validação sejam detectados erros ou problemas com assinatura
  digital, formato de campos ou numeração, a NF-e será rejeitada, não sendo,
  neste caso, gravada no Banco de Dados da SEFAZ."
- "A SEFAZ poderá, ainda, denegar uma NF-e caso o emitente não esteja mais
  autorizado a emitir NF-e. Neste caso, aquela NF-e será gravada na SEFAZ com
  status 'Denegado o uso' e o contribuinte não poderá utilizá-la. Em outras
  palavras, o número da NF-e denegada não poderá mais ser utilizado, cancelado
  ou inutilizado."

Leitura para a matriz: rejeição (inclui falha de formato, família do 588) =
documento NÃO processado e NÃO gravado; denegação (110) = documento gravado
com número morto. Espécies distintas, consequências distintas — é exatamente
o que a matriz versiona por código (regra 3: sem herança de comportamento).

## B) FATO OFICIAL — rejeição de formato: mesmo número e série, corrigir e retransmitir

Mesma fonte primária, questões de contingência (procedimento padrão, não só
contingência): "Na hipótese de rejeição dos arquivos digitais transmitidos,
o contribuinte emitente deverá gerar novamente o arquivo digital da NF-e,
com o mesmo número e série, sanando a irregularidade, e transmiti-lo à
Secretaria da Fazenda, solicitando, com isso, nova Autorização de Uso da
NF-e".

Leitura para a matriz: a numeração rejeitada por formato NÃO foi consumida
(`numeroConsumido=false`); a remediação é nova transmissão corrigida pelo
operador — nunca retry automático (`terminal=true`, zero auto retry) e nunca
inutilização mandatória (`requiresInutilizacao=false`, pois o número será
reutilizado, não descartado).

Escopo do `requiresInutilizacao=false`: o parágrafo de contingência da mesma
fonte ("rejeição ou pendência de retorno em contingência → solicitar a
inutilização") rege o modo contingência com autorização pendente, fora do
piloto síncrono deste GOAL. A matriz apenas nunca EXIGE inutilização
automaticamente para 588; o procedimento manual de contingência segue
íntegro e intocado.

## C) Fonte secundária com atribuição — reuso da numeração rejeitada

Sentença "Nesse caso, a numeração da NF-e rejeitada ainda poderá ser
utilizada", com fonte declarada "Portal Nacional da NF-e", recuperada via
fonte secundária em 2026-09-22 (blog técnico que a cita com atribuição).
NÍVEL DE PROVENIÊNCIA: secundário — corrobora A+B, não os substitui.

## D) Corroboração observada — piloto 022E (evidência versionada)

`docs/ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E.md`:
transmissão real em homologação retornou 588; CONSULTA posterior classificou
217 / NOT_FOUND. Sequência consistente com "rejeitada não gravada" (A):
nada havia para constar na base.

## E) Lacuna explícita — MOC 7.0 Anexo I verbatim NÃO versionado

O mapeamento específico "regra D01e → cStat 588 → caracteres de edição no
início/fim ou entre tags" NÃO possui trecho verbatim do MOC 7.0 versionado
neste repositório (dossiê e plano 016D não citam 588/D01e). Ele repousa em:
(i) autorização humana ratificada do GOAL 023 (GOAL file §1/§4.5), e
(ii) observação do piloto 022E (D). Não inventar semântica D01e além disso.

## F) CONSEQUÊNCIA DE PROJETO — flags da matriz 588 (NFeAutorizacao4)

`outcome=REJECTED`, `reason=REJEICAO_FORMATO_D01E`, `terminal=true`,
`numeroConsumido=false`, `requiresInutilizacao=false`,
`requiresConsultation=false`, zero retry automático. Reconciliação com a
doutrina genérica da ADR-0017 ("REJECTED mantém número consumido; 0
reutilizações de número rejeitado"): aquela doutrina rege a máquina
automática do reconciliador e foi escrita para a espécie denegação (110,
gravada); 588 é rejeição em validação de forma (não gravada, fato A). A
matriz preserva 110 com `numeroConsumido=true` e isola 588 por código —
nenhuma herança, nenhum comportamento destrutivo automático (teste
"destrutivas" da matriz exige `requiresInutilizacao=false` em todas as
entradas). Nova transmissão após 588, se houver, é emissão nova corrigida
pelo operador (fato B), jamais retry da máquina.
