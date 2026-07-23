# FISCAL_NUMBERING_SERIES_REPORT_001

## Identificação

- GOAL: `FISCAL-NUMBERING-SERIES-HARDENING-010`
- Branch autorizada: `fiscal/goal-010-numbering-series`
- Base verificada: `origin/main` em `974554923a6906672626ed675264fef8b879e828`
- PR fiscal #25: confirmado como merged; o merge commit acima está na base da worktree.
- Escopo piloto preservado: Matriz RafaCell Assistec, Taguaí/SP, NFC-e modelo 65,
  homologação (`tpAmb=2`) e `storeId` real resolvido em runtime.

## Auditoria do estado anterior

O allocator já usava `SerieFiscal.proximoNumero`, e o schema já possuía as duas restrições
necessárias:

- `SerieFiscal @@unique([storeId, modelo, serie, ambiente])`;
- `NotaFiscal @@unique([storeId, modelo, serie, numero, ambiente])`.

Por isso, a atomicidade e o isolamento puderam ser endurecidos sem schema ou migration. O ponto
frágil era a validação incompleta do contexto na reserva e no vínculo, além da convergência
insuficiente quando duas chamadas tentavam numerar a mesma nota.

## Solução aplicada

### Atomicidade e isolamento

`reserveNextNumber` executa um único `UPDATE` atômico na linha de `SerieFiscal`, condicionado a:

`serieFiscalId + storeId + modelo + serie + ambiente + ativo + faixa de proximoNumero`.

O banco incrementa `proximoNumero`; a aplicação usa o valor posterior menos um como número
reservado. Não há leitura seguida de escrita do contador na aplicação, portanto não há lost
update. Lojas, modelos, séries e ambientes distintos usam linhas e contadores distintos.

### Idempotência e concorrência

- Nota já numerada retorna exatamente o número persistido e preserva `serieFiscalId`, série,
  modelo, ambiente e `localKey`; a reserva não é chamada.
- O vínculo na nota é um compare-and-swap com `numero IS NULL` e contexto completo.
- Se outra chamada vencer o compare-and-swap, a nota é relida e todas as chamadas convergem para
  o número persistido. Uma reserva excedente permanece consumida e é registrada como lacuna.
- Conflitos de reserva transientes e colisões de unicidade usam retry limitado: padrão 3,
  configurável até o teto 10. O esgotamento retorna erro explícito.

### Limites e lacunas

A faixa válida é `1..999.999.999`. Zero, negativos e estado esgotado falham sem incremento; o
contador nunca reinicia silenciosamente. Falha posterior à reserva não devolve número ao contador
e não permite reutilização automática.

O contrato de lacuna registra `storeId`, `notaFiscalId`, `localKey`, `serieFiscalId`, modelo,
ambiente, série, número, motivo e `requerInutilizacao=true`. Isso prepara reconciliação e futura
inutilização, sem implementar ou chamar a SEFAZ neste GOAL.

### Pipeline e dry-run

A integração real é opt-in e ocorre antes da geração do XML/chave definitiva e antes do provider.
Ela bloqueia modelo diferente de NFC-e e bloqueia `PRODUCAO`/`tpAmb=1` antes de tocar as portas de
numeração. Sem a porta opt-in, o dry-run continua determinístico, com fixtures em memória e sem
dependência de banco.

## Evidências de teste

Os testes cobrem primeira alocação, sequência, idempotência, série ausente/inativa/de outra loja,
modelo e ambiente incompatíveis, isolamento entre lojas e ambientes, múltiplas chamadas paralelas,
compare-and-swap da mesma nota, retry de conflito, retry de reserva transitória, limites, overflow,
falha após reserva e não reutilização.

Resultados finais registrados após a validação completa:

- testes focados de numbering/pipeline: `36/36`;
- suíte `lib/fiscal` em modo CI: `383 passed`, `16 skipped`, zero falha;
- gate fiscal: `12/12` testes, incluindo a evidência positiva `11/11`;
- `npx tsc --noEmit`: aprovado;
- ESLint dos arquivos alterados: aprovado;
- `npm run build`: aprovado, 103 páginas estáticas geradas;
- `git diff --check`: aprovado.

## Limites do GOAL

- zero transmissão SEFAZ;
- zero provider real;
- zero certificado, CSC ou credencial real;
- zero produção e zero `tpAmb=1`;
- zero alteração de KMS, UI ou `fiscalEnabled`;
- zero implementação de inutilização;
- zero schema ou migration.

Não foi criada ADR: o trabalho endurece a decisão e o modelo documental existentes, sem introduzir
uma nova alternativa arquitetural.
