# Decisões do proprietário — Omni Print (impressão direta de cupom)

GOAL `OMNI-PRINT-004C-RELEASE-GATES-001` · PR #327 (rascunho, **não mergear**) · base `8edd892` (main `37acc3b` com #326 integrada).

Este documento reúne **tudo o que depende de você** para a impressão direta de cupom (PDV → agente no computador do caixa →
impressora térmica) sair do laboratório. **Nenhum gate foi aprovado por inferência:** cada um continua **fechado** até você
marcar a opção. Hoje o recurso está **desligado** e, por código, não pode ser ligado em produção
(`APPROVED_RELEASE = null` em `lib/printing/direct/activation.ts`).

**Como aprovar:** responda indicando, por gate, a letra escolhida (ex.: "D01=A, D02=A, D03=A, D04=A, D05=A, G-AUTH=A") e, onde
houver, os valores. A opção recomendada está sempre marcada como **(recomendada)**.

## Resumo

| Gate | Pergunta | Recomendação | Bloqueia o quê |
|---|---|---|---|
| D01 | Como o cupom direto convive com o navegador, A4 e reimpressões antigas? | **A** — o registro de impressões vira a única fonte do cupom de venda quando a loja liga o recurso; demais documentos inalterados | ativação em qualquer loja |
| D02 | Aplicar as tabelas de impressão no banco de produção? Como? | **A** — aplicação manual em janela, migration recortada com proteção própria contra travar vendas, backup e rollback ensaiados, registro no Prisma antes do merge | homologação e produção |
| D03 | Limites, retenção e chaves | **A** — valores da tabela D03 | produção |
| D04 | Liberar o agente Windows e como ele roda | **A** — tarefa agendada no logon do usuário do caixa, com laço de reinício, instalada por pessoa autorizada | homologação física |
| D05 | Homologar com impressora real | **A** — roteiro `ROTEIRO_HOMOLOGACAO_FISICA.md` na loja piloto, com registro de evidências | produção |
| G-AUTH | O que "sair" deve fazer com impressões em andamento? | **A** — sem mudar a autenticação; impressões já enviadas terminam e são registradas; "sair de todos os dispositivos" fica para uma mudança de autenticação separada | nada (não bloqueia, se aprovado A) |

Ordem sugerida: D01 → D02 + D03 (decididos juntos; D02 precisa dos números de D03 para o job de expurgo) → D04 → D05 →
liberação. G-AUTH pode ser decidido a qualquer momento.

---

## D01 — Convivência com navegador, A4 e reimpressão antiga

**Situação atual (verificada no código desta PR):**

- Só o **PDV Clássico** usa a impressão direta.
  - Quando ela está disponível para a venda, o PDV **não** abre o navegador nem o diálogo antigo.
  - Quando não está (recurso desligado, terminal sem vínculo, venda com item fracionado/KG ou acima do limite de itens),
    o fluxo antigo segue **idêntico**. O Playwright prova o recurso desligado (PW7) e a venda KG (PW10/PW11); o limite de
    itens usa o mesmo caminho de retorno.
  - Na hora da venda não há caminho que imprima pelos dois lados.
- Fora do registro de impressões continuam:
  1. os outros PDVs (Supermercado, Assistência, Venda Completa), que imprimem pelo navegador como hoje;
  2. a **reimpressão pelo Histórico de vendas** (`vendas-arquivo-geral.tsx`) e pela **Conferência do caixa**
     (`conferencia-caixa.tsx`), que abrem o cupom no navegador **sem registrar e sem a marca "SEGUNDA VIA"**;
  3. documentos A4 que **não são cupom de venda** (recibo de OS, recibo de contas a receber, relatórios), que são outros
     documentos e não duplicam o cupom;
  4. a ponte antiga `/api/print/raw`, que continua restrita à plataforma (lojista recebe 403).
- O cupom antigo aceita até 5 vias; o direto limita a 2 (D03).

**Risco de não resolver:** uma venda impressa pelo agente pode ser reimpressa pelo Histórico como se fosse a primeira via,
sem marca. A loja passa a ter dois "originais" do mesmo comprovante (confusão com cliente, troca/devolução apresentada duas
vezes). E uma loja que liga o recurso usando o PDV Supermercado acha que está ligado, mas não está.

**Alternativas:**

- **A (recomendada)** — com o recurso ligado na loja, o **registro de impressões é a única fonte do cupom de venda**:
  - A1 (antes de liberar qualquer loja): a reimpressão de uma venda que já tem registro, a partir do Histórico ou da
    Conferência, passa pelo mesmo caminho da "2ª via" do PDV (registrada, marcada "SEGUNDA VIA", com aviso quando a 1ª pode
    ter saído). O caminho "abrir no navegador" já existe e é registrado (S28/PW8/PW9); falta ligá-lo nessas duas telas.
  - A2: a opção "Usar impressão direta nesta loja" informa que vale **só para o PDV Clássico**; os outros PDVs seguem iguais
    até serem migrados, cada um em sua própria entrega.
  - Documentos A4 que não são cupom de venda: sem mudança.
- **B** — manter como está (só o PDV Clássico; reimpressão antiga sem marca). Mais simples; o risco acima fica aceito por
  escrito.
- **C** — migrar agora todos os PDVs e o A4 para o registro. Cobre tudo, mas é a mudança maior e mais arriscada no PDV.

**Consequência para o lojista:**

- **Recurso desligado (padrão):** nada muda em nenhuma opção.
- **Com A:** o caixa imprime sozinho, sem janela. Toda reimpressão sai com "SEGUNDA VIA", e o sistema avisa quando a
  primeira pode ter saído.
- **Com B:** igual a A no PDV Clássico, mas a reimpressão pelo Histórico sai sem marca.

**Depende de aprovação expressa:** a escolha A/B/C, e, com A, aceitar que a liberação fica condicionada à entrega A1
(tarefa de código própria, não incluída nesta PR).

> ☐ D01 = A (recomendada) · ☐ B · ☐ C

---

## D02 — Tabelas de impressão no banco de produção

**Situação atual:**

- **Migrations candidatas:** ficam em `tools/print-004c-e2e/candidate-migrations/`, fora de `prisma/migrations`, e
  **nenhuma foi aplicada fora do laboratório**.
- **O que elas criam:** 11 tabelas `print_*`, 7 funções `p004_*` e 2 índices únicos em tabelas existentes (`vendas` e
  `pdv_terminais`), além de chaves estrangeiras para `stores`, `vendas`, `admin_users` e `pdv_terminais`.
- **Impacto em dados existentes:** nenhuma coluna ou linha existente é alterada.
- **Integridade do registro:** as tabelas aceitam alteração **só no ciclo de vida previsto**, garantido por gatilhos.
  O expurgo de conteúdo já é suportado em um sentido só (colunas `*_purged_at`), e há DELETE apenas de requisição vencida.

**Auditoria desta etapa:**

- **Teste:** `tools/print-004c-e2e/d02-rehearsal.pg.test.ts`, em PostgreSQL 17 descartável: **5/5 PASS**, cada teste
  independente.
- **Evidência:** `evidence/release-gates/d02-rehearsal.log`.
- **Revisão independente:** rodada 5.

| # | Achado | Prova |
|---|---|---|
| 1 | Índice com `CONCURRENTLY` (passo 00) **não trava vendas**: com uma venda aberta, novas vendas gravam enquanto o índice espera; os índices terminam válidos | teste 1 (e `index-strategy.pg.test.ts`) |
| 2 | Os passos 01-futura e 02 **como estão** criam FKs para `vendas`/`stores`/`admin_users`/`pdv_terminais` sem `lock_timeout`. Com uma única venda aberta, a migration espera e **todas as vendas novas ficam presas atrás dela** | teste 2 (a venda nova estoura 1,5 s; a migration pede `ShareRowExclusiveLock` em `vendas`) |
| 3 | A migration **recortada** com a proteção dentro do próprio arquivo (logo após o `BEGIN`: `SET LOCAL lock_timeout = '2s'` e os locks das tabelas pai pegos no início, **`vendas` primeiro**) desiste inteira em cerca de 2 s, sem deixar nada. **Enquanto aguarda a venda aberta**, não segura nenhuma outra tabela: o **heartbeat do terminal** responde em < 500 ms, e a venda que chegou depois espera cerca de 2 s e grava. Depois de obter `vendas`, a execução em si é de fração de segundo, e nela heartbeat e login esperam. Ensaiado como **recorte (ii)**: 01-futura + 02 numa única transação, com a guarda "01" (que cobre todas as tabelas pai das duas). A nova tentativa num momento calmo aplica tudo. Não depende de lembrar de `PGOPTIONS` | teste 3 |
| 4 | Se uma venda ficar aberta mais que o limite do passo 00 (5 s), o índice fica **inválido** e rodar de novo falha com "already exists". Solução: `DROP INDEX CONCURRENTLY` e repetir | teste 5 |
| 5 | **Rollback** (`tools/print-004c-e2e/d02/rollback_print_candidate.sql`): remover as FKs exige **`AccessExclusiveLock`** em `vendas`/`stores`/`pdv_terminais`/`admin_users` (medido no PostgreSQL 17; não há modo mais fraco). Com venda aberta, o rollback desiste inteiro em ~2 s (registro intacto) e, enquanto espera, **até leituras de `vendas` aguardam**. Logins e heartbeat seguem normais **enquanto ele aguarda `vendas`**, porque os locks são pegos em ordem, `vendas` primeiro. Depois que obtém tudo, o lock de `admin_users` bloqueia por instantes **qualquer requisição autenticada** (a sessão relê `admin_users`), e é mais um motivo para rodar só com a loja fechada. Sem movimento, remove tudo sem tocar vendas, e o ciclo se repete | teste 4 |
| 6 | O build da Vercel de produção roda `prisma migrate deploy` quando a autoridade de migration está ligada (`scripts/vercel-build.mjs`). Uma migration de impressão que chegue à `main` antes de estar registrada como aplicada seria aplicada **pelo build**: o `CONCURRENTLY` falha dentro de transação, a migration fica marcada como falha (P3009) e **bloqueia os deploys seguintes** | leitura do código |
| 7 | Excluir uma loja que tenha registros de impressão vai falhar (FK sem cascata, para preservar a auditoria), mas com mensagem genérica: `countStoreOperationalLinks` não conta `print_*` | leitura de `app/api/stores/[id]/route.ts` |

**Risco de não resolver:** sem tabelas não há impressão direta. Aplicada do jeito errado (pelo build ou sem a proteção), o
caixa pode **parar de gravar vendas** durante a janela, ou os deploys seguintes ficam travados.

**Alternativas:**

- **A (recomendada)** — aplicação **manual e controlada**, fora do build, nesta ordem:
  1. **Preparo (código, PR própria, sem merge até o passo 6):**
     - recortar duas migrations numeradas a partir de `future/`:
       - **(i)** só o passo 00 (`CONCURRENTLY`, executado fora de transação);
       - **(ii)** 01-futura + 02 **numa única transação**: os dois corpos sem os `BEGIN`/`COMMIT` internos e, logo após o
         `BEGIN`, a guarda "01" de `CUT_GUARD` (`d02-rehearsal.pg.test.ts`, função `CUT_II`, exatamente o que o ensaio
         aplica);
     - ajustar a mensagem de exclusão de loja (achado 7);
     - **aviso para desenvolvimento:** a pasta (i) tem `CONCURRENTLY`, que `prisma migrate dev`/`reset` (banco sombra)
       não executa. Deixar um único `CREATE INDEX CONCURRENTLY` por pasta, ou registrar o aviso no README das
       migrations.
     - O job de expurgo de D03 **não precisa de mudança de schema**: as colunas e os gatilhos já existem (S33).
  2. **Conferir o alvo antes de qualquer comando:**
     - `SELECT current_database()` e o id do endpoint Neon. O `.env` local aponta para o *candidate*, não para produção.
     - Usar o **endpoint direto** do Neon, não o `-pooler`, porque o pooler quebra `CONCURRENTLY` e parâmetros de sessão.
     - Executar com o **mesmo papel que a aplicação usa** (dono das tabelas), já que o SQL faz `REVOKE ALL FROM PUBLIC`.
  3. **Ensaio em cópia:** criar um branch Neon a partir da produção (cópia, sem afetar a loja) e executar exatamente os passos
     4–5, medindo o tempo do passo 00 com o volume real de `vendas`.
  4. **Backup:** imediatamente antes, ponto de restauração Neon (branch de segurança ou registro do instante para PITR) e
     `pg_dump --schema-only`.
  5. **Janela de baixo movimento (sugestão: antes da abertura):**
     - **(i):** `psql` sem `-1` e conferir `pg_index.indisvalid` (achado 4, se ficar inválido).
     - **(ii):** até 3 tentativas espaçadas.
     - **Pior caso por tentativa:** quem grava em `vendas` espera cerca de 2 s enquanto a migration aguarda a venda aberta.
       Heartbeat e login só esperam a fração de segundo da execução.
     - **Se não passar:** a transação (ii) não deixa nada aplicado; os índices de (i) ficam, sem efeito com o recurso
       desligado. Repetir outro dia ou removê-los com o rollback.
  6. **Registrar no Prisma antes do merge:**
     - `prisma migrate resolve --applied <pasta (i)>` e `--applied <pasta (ii)>`, a partir do commit exato da PR;
     - conferir as duas linhas em `_prisma_migrations`;
     - **só então** mergear a PR. Assim o build nunca as executa (achado 6).
  7. **Validação:** `prisma migrate diff` banco → schema vazio; contagem 11 tabelas / 7 funções / 2 índices; uma venda de
     teste em loja de homologação grava normalmente. A impressão continua desligada.
  8. **Rollback:**
     - **Preferido:** só desligar o recurso (gate e variáveis), sem tocar no banco.
     - **Remover as tabelas, se necessário:** `rollback_print_candidate.sql` **com a loja fechada** (achado 5), exportando
       antes o registro se houver dados, porque ele é a prova de "não imprimir duas vezes". Depois,
       `prisma migrate resolve --rolled-back` para as duas pastas, ou a remoção do registro em `_prisma_migrations`.
- **B** — deixar o build aplicar (migration comum em `prisma/migrations`). **Não recomendada:** incompatível com
  `CONCURRENTLY` e trava deploys (achado 6).
- **C** — adiar o banco de produção e homologar só em banco separado (branch Neon). Válido para D05, mas não libera
  produção.

**Consequência para o lojista:**

- **Com A:** nenhuma parada perceptível; no pior caso, cerca de 2 s de espera numa venda por tentativa, na janela de baixo
  movimento.
- **Com B:** risco de deploy travado.
- **Com C:** a loja não tem o recurso em produção até a próxima decisão.

**Depende de aprovação expressa:** aplicar em produção; quem executa; data e horário da janela; aceitar o plano de
backup/rollback. Antes dessas aprovações, **nada é aplicado em produção**.

> ☐ D02 = A (recomendada) · janela: ____ · executor: ____ · ☐ B · ☐ C

---

## D03 — Limites, retenção, expurgo e chaves

**Situação atual:**

- **Limites:** valores candidatos explícitos em `CANDIDATE_POLICY`.
- **Expurgo:** o schema já permite expurgar conteúdo em um sentido só. Provado no cenário **S33**:
  - expurgo do cupom, do snapshot, do comando e dos detalhes de evento;
  - segundo expurgo, restauração e DELETE são recusados;
  - depois do expurgo, a mesma venda **continua sem poder imprimir a 1ª via de novo**.
  - O **job** que faz o expurgo periodicamente **não existe** (casos B17, B18 e B19 da matriz, bloqueados neste gate).
- **Chaves:**
  - as chaves de conteúdo e assinatura vêm só do ambiente;
  - cada conteúdo cifrado guarda a referência da chave usada (`*_key_ref = ENV_V1_<impressão digital>`), mas o servidor só
    abre com a chave atual.

**Risco de não resolver:**

- **Retenção:** o conteúdo cifrado do cupom fica guardado para sempre.
- **Chaves:** sem regra de rotação, uma chave vazada não tem procedimento definido.
- **Expurgo descuidado:** apagar o registro de "já imprimi esta venda" reabre a impressão duplicada.

**Valores recomendados (opção A):**

| Item | Valor recomendado | Por quê |
|---|---|---|
| Vias por impressão | **máximo 2** (cliente + loja); a configuração antiga de até 5 vale só para o fluxo do navegador | já aplicado; mais vias = mais risco de duplicata |
| Limites de tamanho | 200 itens; comando 16 KiB; snapshot 64 KiB; cupom 64 KiB | venda com **mais de 200 itens** volta ao fluxo do navegador (código `ITEM_LIMIT`, mesmo caminho que o PW10 prova com a venda KG). Hoje uma venda que estoure só os limites de **bytes** mostra erro em vez de voltar ao navegador: incluir esses dois códigos no retorno ao fluxo antigo é ajuste pequeno, sugerido junto com D01-A1 |
| Janela da 1ª via | 30 min após a venda; depois disso só "2ª via" | já aplicado (S30) |
| Conteúdo cifrado — cupom da via (`print_copies.payload`), snapshot da venda (`print_jobs.snapshot`) e comando da requisição (`print_requests.command`) | **expurgar 7 dias** após o estado final (via aceita, falhou, cancelada ou incerta) | a 2ª via é gerada de novo a partir da venda; o conteúdo antigo não é necessário. Suporte já existe no schema (S33); falta o job |
| Detalhes de evento (`print_events.details`) | expurgar **só** de eventos sem prova; **nunca** de eventos de resultado incerto, ou manter neles `evidenceKey`, `evidenceHash` e `reason` | nesses eventos os detalhes são a prova do incerto e o motivo mostrado na tela (`core.ts`); apagá-los perderia a prova e permitiria evento duplicado num replay (sem reimpressão) |
| Requisições vencidas (`print_requests` com prazo expirado) | podem ser apagadas (o schema já permite); recomendação: **manter** até medir volume | a identidade da operação continua no job |
| Registro (documento, job, via, tentativa, evento, chaves `sendKey`/`requestKey`, marca de 1ª via) | **permanente** — nunca apagar | é o que impede imprimir duas vezes (B17–B19) |
| Volume | **a medir no piloto** | antes do expurgo, o snapshot cifrado tende a ser o maior item (até 64 KiB por job, tipicamente alguns KiB); depois do expurgo restam só metadados (algumas linhas por venda) |
| Diário local do agente | manter; rotação de entradas já registradas com mais de 30 dias numa entrega futura | o diário é a prova local de "já enviado" |
| Chaves de conteúdo e assinatura | 32 bytes aleatórios cada, **distintas**, geradas pela pessoa que você indicar, gravadas só no ambiente da Vercel (escopo Production só na liberação); nunca no repositório ou em mensagens | segredo fora do código |
| Rotação de chaves | anual e **imediata** sob suspeita, em horário de baixo movimento | efeito: cupons em preparo (até 15 min) e consentimentos de 2ª via (até 5 min) feitos com a chave antiga falham fechado, sem imprimir (`CONTENT_UNAVAILABLE`/`INVALID_PROOF`), e o caixa repete. Comprovado para o caso crítico no S32: uma via em envio na hora da troca **não trava o agente e nunca é reenviada**. Aceitar a chave anterior durante a transição é melhoria opcional |
| Credencial do agente | guardada só como hash; revogar = botão "Revogar" (derruba vínculos, S16); trocar = parear de novo. Parear de novo após troca de computador ou acesso de terceiros | já implementado |
| Código de pareamento | 10 min, uso único | já aplicado |

- **B** — aprovar os limites, mas **sem** expurgo (guardar o conteúdo cifrado para sempre). Mais simples; cresce o banco e
  guarda dado comercial sem necessidade.
- **C** — definir outros valores (indique).

**Consequência para o lojista:** nenhuma no dia a dia. A 2ª via continua disponível a qualquer momento (gerada da venda).

**Depende de aprovação expressa:** os números da tabela; quem gera e guarda as chaves; a regra de rotação. O job de expurgo
é tarefa de código própria (sem mudança de schema).

> ☐ D03 = A (recomendada) · responsável pelas chaves: ____ · ☐ B · ☐ C: ____

---

## D04 — Agente Windows (transporte real)

**D04-A_CONFIRMED:** o proprietário autorizou a preparação da tarefa ao logon, instalação controlada e recuperação.
A autorização desta sessão limita operações modificadoras a VM/laboratório isolado. Instalação em caixa real, pareamento
real, impressão, homologação física e produção continuam sem liberação.

Implementação e procedimentos atuais: `tools/omni-print-agent/README.md` e `D04_WINDOWS_AGENT.md`. O pacote sem assinatura
digital contém scripts de plano/aplicação, tarefa Interactive/Limited do mesmo SID, reinício limitado e diagnóstico.
DPAPI, instância e diário são preservados. Trava e hosts usam autoridade do SO e identidade de criação, inclusive no
tratamento de PID reaproveitado. Host antigo sem identidade comprovável bloqueia a retomada, sem ser morto por suposição.

**Substitui os procedimentos preliminares desta seção:** não usar o laço ilimitado antigo, não apagar `.lock` para forçar
partida e não apagar a pasta de dados ao desinstalar. A desinstalação controlada remove a tarefa e preserva todo o histórico.

Referências da configuração: [principal Interactive/Limited](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal),
[limites de reinício e instâncias](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
O logon/reboot real no equipamento e o papel serão verificados pelo `RUNBOOK_D05.md`, ainda PENDING.

---

## D05 — Homologação com impressora física

**Situação atual:** **nenhum teste físico foi executado**. Os casos F01–F07 e I18/I20 estão `DEFERRED_PHYSICAL_HARDWARE`. O
transporte foi provado com spooler **simulado** e com o host PowerShell real **sem impressora**. A ponte antiga já
imprimiu na POS-80 USB por outro caminho (003A); isso não vale como homologação deste candidato.

**Pré-requisitos:**

- **Banco e gates:** D02 aplicado **em banco de homologação** (branch Neon separado, nunca o banco da loja), D03 com
  valores definidos e D04 aprovado.
- **Release de homologação:** registrada por commit revisado numa branch própria.
- **Variáveis na Vercel:**
  - chaves, flags e URL do banco ficam **fixadas nessa branch** no escopo Preview. Uma variável Preview sem branch vale para
    todas as branches;
  - nunca no escopo Production.
- **Proteção de deployment da Vercel:** conferir se ela barra o agente. Se barrar, usar o bypass próprio da Vercel para
  automação, só nesse deployment.
- **Desmontagem ao final:**
  - remover as variáveis;
  - remover os deployments de homologação, porque deployments antigos mantêm as variáveis;
  - revogar o agente.

**Roteiro:** `ROTEIRO_HOMOLOGACAO_FISICA.md`, seções 1–9, cobrindo:

- impressora e fila do Windows;
- instalação e pareamento;
- cupom com acentos em 58/80 mm, corte e nenhuma gaveta;
- 2ª via (pelo agente e pelo navegador, em Chrome e Edge);
- falhas: impressora desligada, sem papel, agente parado, rede caindo após o envio, reinício no meio, venda pendente, dois
  caixas.

Cada linha do registro de execução começa **"NÃO EXECUTADO"** e só muda com foto, log e assinatura de quem executou.

**Critérios de parada (abortar e revogar o agente):** qualquer cupom duplicado; qualquer impressão sem venda confirmada;
gaveta abrindo; dado de cliente real no cupom de teste; vendas da loja afetadas.

**Risco de não resolver:** sem papel real não há prova de acentos, corte, tempo e comportamento de falha da fila do
Windows. Liberar sem isso é liberar no escuro.

**Alternativas:**

- **A (recomendada)** — homologar na loja piloto, fora do horário de pico, com dados de teste e banco de homologação.
- **B** — homologar numa bancada com uma impressora igual à da loja: sem risco para a loja, mas não prova a rede e o
  computador reais.
- **C** — pular. **Não recomendada.**

**Consequência para o lojista:** 1–2 horas com o caixa piloto reservado; papel de teste.

**Depende de aprovação expressa:** data e local; quem executa; consentimento da loja. `PHYSICAL_HOMOLOGATION=PASS` só com
o registro preenchido e a sua aprovação escrita.

> ☐ D05 = A (recomendada) · data/local: ____ · ☐ B · ☐ C

---

## G-AUTH — Sair, revogação e confirmação atrasada do agente

**Situação atual:**

- **"Sair":** o logout (`signOutAction`) apaga o cookie **daquele navegador**. A sessão é um JWT sem estado; só
  `sessionVersion` revoga sessões no servidor, e hoje ele sobe na troca de senha e na edição pelo administrador.
- **Rotas de impressão:** reconferem no banco, a cada operação, usuário ativo, papel, loja, módulo e `sessionVersion`
  (S15). Sem cookie válido não há pedido novo.
- **PR #326 (`SessionProvider`):** revalida a sessão a cada 30 s com rede. Sem rede, mantém a sessão para não derrubar o
  PDV no meio da venda offline; escritas sem cookie válido são recusadas e a venda fica preservada.
- **Novo teste S31** (cenários PostgreSQL, **33/33 PASS**):
  - **Montagem:** o cupom chega à fila e a rede cai antes do aviso do agente. O teste confirma no banco que a tentativa
    ainda está `STARTED`, ou seja, o aviso realmente não chegou. Então a sessão do caixa é revogada e o aviso chega
    atrasado.
  - **Resultado:** o aviso é **registrado** ("na fila da impressora"), porque vem autenticado pela credencial do agente,
    não pelo usuário; **nada é reenviado**; a sessão antiga recebe 401.
  - Se a revogação acontece **antes** do envio, a via é cancelada sem imprimir (S15).

**Risco de não resolver:** baixo para a impressão. Um JWT copiado antes do "sair" continua válido até expirar, e isso é uma
característica da autenticação inteira, não do Omni Print. Para impressão, o pior caso é alguém com o cookie antigo pedir a
2ª via de uma venda da própria loja, o que fica registrado e marcado.

**Alternativas:**

- **A (recomendada)** — **sem mexer na autenticação protegida.** O "sair" continua local. O que já foi enviado termina e
  fica registrado (S31), e pedido novo exige sessão válida. Aceitar o caso I12 com esta mitigação documentada.
- **B** — botão "Sair de todos os dispositivos" (`sessionVersion + 1`). É compatível com o `SessionProvider` do #326: outros
  aparelhos online saem em até 30 s, e os offline saem ao reconectar, com vendas pendentes preservadas e reenviadas após
  novo login. **Altera autenticação protegida** e exige sua autorização específica para uma tarefa separada. Atenção: se
  vários caixas usam o mesmo login, todos saem juntos.
- **C** — revogação por sessão individual (tabela de sessões revogadas). É a mais precisa, mas muda schema e autenticação.

**Consequência para o lojista:** com A, nada muda. Com B, o novo botão derruba todos os caixas que compartilham o mesmo
usuário.

**Depende de aprovação expressa:** A/B/C. B e C só com autorização específica para alterar a autenticação, em tarefa
própria. Esta PR não altera a autenticação.

> ☐ G-AUTH = A (recomendada) · ☐ B (tarefa separada) · ☐ C (tarefa separada)

---

## O que foi verificado nesta etapa (sem hardware)

| Verificação | Resultado |
|---|---|
| CI do head `8edd892` (PR #327) | 10/10 checks verdes (build, E2E autenticado, PostgreSQL, piloto, previews Vercel) |
| Regressão após integrar a main (#326) | bateria completa reexecutada (`evidence/battery-summary.json`): Playwright PDV Clássico 11/11, cenários PostgreSQL, unitários/agente, dois processos e layout futuro PASS |
| D02 — ensaio de aplicação, trava e rollback | 5/5 (`evidence/release-gates/d02-rehearsal.log`) |
| D03 — expurgo em sentido único (S33) e rotação de chave com via em voo (S32) | PASS. O S32 revelou um defeito do servidor (rotação durante um envio fazia o claim do agente falhar por até 60 s), corrigido em `lib/printing/direct/core.ts`. Sem a correção, o S32 falha |
| G-AUTH — ACK atrasado após revogação (S31) | PASS; cenários PostgreSQL 33/33 |
| Revisão independente destas propostas | `REVISAO_INDEPENDENTE.md`, rodada 5 |

## O que continua pendente (não aprovado por inferência)

- **Gates:** todos fechados até sua resposta: D01–D05 e G-AUTH.
- **Entregas de código que nascem das decisões (cada uma em PR própria):**
  - D01-A1: reimpressão do Histórico e da Conferência pelo registro, mais o retorno ao fluxo antigo quando estourar o limite
    de bytes;
  - D02: as duas migrations recortadas com a proteção e a mensagem de exclusão de loja;
  - D03: job de expurgo;
  - D04: empacotamento e encerramento do host órfão.
- **Homologação física:** não executada. `PHYSICAL_HOMOLOGATION=PENDING`.
- **Liberação:** `APPROVED_RELEASE` continua `null`; nenhuma variável de produção foi criada ou alterada; nada foi aplicado
  ou publicado em produção.
