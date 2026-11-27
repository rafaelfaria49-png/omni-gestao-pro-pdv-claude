# Fechamento dirigido das evidências 004B

GOAL=OMNI-PRINT-004B-EVIDENCE-CLOSEOUT-001

Conclusão: evidências do laboratório coerentes com limites explícitos. Os 193 arquivos do manifesto de entrega têm os mesmos bytes atuais;35 provas anteriores continuam registradas e rastreáveis. Nenhuma suíte foi reexecutada. A revisão independente complementar do journal foi concluída. A única repetição dirigida de Prisma validate passou. Isso não aprova aplicação, integração, piloto ou produção.

## Preservação e capacidade

Worktree C:\Projetos\omni-gestao-print-core-004b; HEAD/base 35a3971c31f62e6e802b7dd8763be81475334780; branch work/omni-print-persistencia-004b-synthetic. Status manteve o schema modificado e módulos/migration/harness sem commit. AEP opt-in ausente; governança lida, sem open/close ou mudanças de estado. Todas as escritas deste fechamento ficam em C:\Projetos\omni-print-004b-evidence-closeout-001.
Antes de iniciar o executor/processos de revisão, volumes da worktree e temporários foram consultados. Todos estão em C:. Disponíveis cerca de907MB decimais; estimativa conservadora512MiB temporários +64 MiB seleção/ZIP, margem cerca de303MB. Essa é estimativa operacional, não requisito publicado do provedor. O material antigo listado soma3.466.176 bytes. Não houve limpeza, instalação, movimentação de ferramentas ou remoção de qualquer WIP/cache/cluster para liberar espaço.
O cluster já estava parado e permaneceu assim. Não foram lidos .env nem usados dados/credenciais de produção. Nenhuma conexão de banco foi aberta por este fechamento; validate usa apenas referência sintática loopback sem credenciais. Fontes antigas do harness foram lidas como texto, nunca importadas/executadas.

## Cadeia e associação de bytes

Manifesto antigo:26D819087538CED0E1F08E073E3CC0395AE37A4DC18BAAEB645603811D771ED0. Ele permanece intacto. Conferidos193/193 pares antes e depois, sem divergências; cópias do pacote também têm manifesto novo independente.
SQL original 4F05F943112DF35AFE986CA8BC1B4CFCF15FC53B0AFA23328C5E9A786F2FD97F → R01/R02 D0F22A28323288F3FC7C6765643A932730DE3D3964DEDEFFF2516406760F004F → R03 F8001CD338ED1E122DA775A74C416AC2ABCB0863403571302415F5D7D4A1E74F → R04/final E55A0340E266681556CA238E2D59019DE10E9439FEECAEB8AFF3CCE92DE8D6DD. Os três diffs antigos foram aplicados apenas em memória e cópias derivadas novas. O resultado coincide byte a byte com a migration local. Não houve aplicação SQL.
Delta Prisma 1A8F11063AF75740CD46C4A014487159385871935CF0B7E30741295A6C0E39B6 aplicado em memória ao blob da base produz schema AEA08DA0E8DB34AF5BFC73D90148A01BCF5BD3EEBED06E7A5835453AAC5E56ED. A base Git em LF tem hash EC2D485E5B8E66DBB9F19B285616CCC2590DF3A18A666DBB60337CE7B87DD7D7; sua variante CRLF coincide exatamente com o hash bruto de checkout registrado 9C692E2688DA7B9B921DEAB36E47FC4488DE6B3B75E1464DAEE1BA1F3C9198BE. O normalizador original do patch converte CRLF em LF. Não se trata de drift.
Os seis módulos reais são authority.ts,codec.ts,core.ts,db.ts,sale.ts,simulator.ts em lib/print-core-synthetic/. Os 16 arquivos do harness são enumerados em PACKAGE_ALLOWLIST.json e no manifesto novo, sem inventar fontes ausentes.
O vínculo dos bytes atuais à execução é o manifesto pós-execução antigo, seus hashes de fontes declaradas testadas, os registros do run core-6909ccad, o journal correlacionado e o catálogo capturado. Não existe no registro do run um hash de cada fonte tomado na abertura de cada teste. Portanto, a conclusão é identidade com a entrega declarada testada, não uma atestação independente criptográfica no instante de execução. Não há alteração material atual que justifique repetir35provas.

## Provas, catálogo e revisão independente

O run core-6909ccad registra35PASS/0 FAIL em Node 24.19.0. O índice novo liga80IDs às provas anteriores, arquivos/linhas e asserções. Os 53 PASS da matriz reutilizam33blocos dentre35totais; não são53execuções adicionais. CORE-MISSING-COPY-COMMIT e CORE-A4-LOGICAL-ONLY são os dois blocos adicionais não referenciados pelos PASS da matriz original.
Estática sobre catálogos preservados:154 colunas iguais às derivadas, PKs/FKs e índices derivados conferidos,36 FKs,60 CHECKs,45 triggers e seis corpos de função iguais ao SQL final. Invoker e search_path fixo preservados. Isso confere o catálogo histórico; não é nova inspeção de banco ativo nem teste individual de toda constraint. Gate A anterior permanece preservado e coerente.
O executor /root/independent_contract_review leu o journal integral e fontes/instrumentação correspondentes, separou owner/runtime, reviu os seis achados/regressões e conferiu a matriz. Sua leitura complementar não teve erro112, não executou testes/runtime/banco e não concedeu aprovação humana. O ChatGPT externo recebeu somente o relatório anterior: não lhe é atribuída esta conferência de bytes/journal.
O journal possui795registros de exec antes da execução,44 hashes distintos:794 alvos print_* e1SET CONSTRAINTS ALL IMMEDIATE. Foram reconstruídos46candidatos de SQL por literais/builder e todos os 795 índices correlacionam. Isso não revela parâmetros, ramo, commit/rollback nem cobre query() ou SQL interno de triggers. Não declarar795escritas confirmadas. A conclusão de ausência de DML comercial instrumentado usa conjuntamente fonte/builder, grants/negativa42501 e snapshots, não hashes isolados.
Owner seed/correções é cliente distinto. São15correções declaradas em vendas(11),venda_itens(3),pdv_terminais(1). Os 108 snapshots excluem admin_users; checkpoint após correções e final são byte a byte iguais. Antes→checkpoint a asserção só compara o conjunto de tabelas alteradas, não cada delta/escritor. Esse limite restringe a afirmação de integridade comercial ao alcance realmente demonstrado.
A regressão sessaoId comprova reader válido e fonte corrigida, mas não um valor não nulo extraído. B12 tem barreira real com commit do owner antes do SELECT final e recusa por versão. Nenhum desses casos promete atomicidade universal com todos os writers ou com dispositivo físico. Os outros cinco achados permanecem resolvidos no recorte sintético, conforme inventário independente.

## Matriz preservada e ressalvas

Contagem original confirmada como inventário:53 PASS/0 FAIL/27 DEFERRED,80 IDs únicos. Nenhum DEFERRED foi promovido. O complemento separa47casos rastreáveis no escopo declarado, seis critérios parcialmente exercitados e27DEFERRED. Os seis são subconjunto dos53PASS originais. Essa classificação de revisão não cria novas execuções e não altera a matriz antiga.
As seis ressalvas de critério são P01(uiContextId/envelopeUI),P06(duas renderizações iguais),P07(vetorACCEPT+UNKNOWN),P11(negativas específicas de snapshot/payload),B19(retirement/arquivamento completo),I17(consulta não encontrado do adaptador). MATRIX_SCOPE_COMPLEMENT contém o demonstrado, a cláusula pendente e a menor prova/gate futuro para cada uma. P13 limita-se à minimização da fixture; I25 tem a janela/limites de comparação descritos acima.
Os 27 DEFERRED estão classificados por gate no complemento: sessão/API/reader canônico, Origin/CSRF/cache, logout global, pareamento/instalação/destino/lifecycle, transporte/capacidades/offline, UI/A4/fallback, renderers/encoding térmico, D03 e homologação física. Não é objetivo deste fechamento completá-los.

## Uma tentativa extra de Prisma

PASS em aproximadamente26segundos: Node 24.19.0 já instalado, Prisma 6.19.3 local, timeout explícito120000ms. Comando direto node→prisma/build/index.js validate --schema em cópia byte idêntica no diretório novo. Ambiente filho por allowlist; nenhuma variável herdada de PG/auth/Neon/Vercel, nenhum .env e nenhuma credencial. O esquema original preserva SHA AEA08DA0E8DB34AF5BFC73D90148A01BCF5BD3EEBED06E7A5835453AAC5E56ED.
PRISMA_EXTRA_RECHECK.json registra binários/versões/hashes, comando, início/fim/saída/status. A nova prova não reescreve validate/generate anteriores nem o timeout de checks.json. A causa do timeout anterior permanece NOT_DETERMINED; não foi atribuída ao erro112 por suposição.

## Build, chaves e limites permanentes

FULL_APPLICATION_BUILD continua BLOCKED_NOT_RUN. Bundle isolado e typecheck/lint focados anteriores não equivalem a build/integracão da aplicação. Não foram alterados scripts/config/PWA nem instaladas dependências.
Renderer do laboratório é JSON, não ESC/POS/A4. A chave efêmera ficou na memória durante os ensaios; recuperação de payload após encerramento completo do processo não está homologada. Identidade/helpers de fixture não certificam sessão/logout real. Quantidade da base é Int, sem homologação KG. TTLs, retenção, grants e rate limit são fixtures; D03/D04 continuam pendentes. Nenhum transporte, pareamento, prova física, endpoint, tela ou worker foi implementado por consequência deste fechamento.

## Refs e decisão

Os artefatos históricos documentam114identidades de worktrees e seteWIPs comparados, reflogs/stashes com digest igual. A divergência do digest global de refs permanece REF_DELTA=UNATTRIBUTED. Um checkpoint foi observado no intervalo, mas não há inventário original por ref para atribuir toda a diferença. Não é prova automática de corrupção/perda. Não foi feita reconstrução retrospectiva inventada, reparo de refs ou interrupção de outras sessões.
LAB_EVIDENCE_DECISION=CONSISTENT_WITH_LIMITS. Não foi identificado novo defeito material de implementação; há cláusulas de cobertura ainda não demonstradas integralmente e explicitadas no complemento. Nenhum código funcional, schema, migration ou evidência antiga foi corrigido neste GOAL.
Recomendo preservar esta entrega e versionar o checkpoint local revisado, incluindo as ressalvas, somente após autorização explícita posterior do proprietário. Não houve commit/push/PR/merge/deploy, nova funcionalidade ou abertura automática de gate. NEXT_GATE=EXPLICIT_AUTHORIZATION_FOR_LOCAL_CHECKPOINT.

## Pacote local

Pacote por allowlist em OMNI-PRINT-004B-EVIDENCE-CLOSEOUT-001.zip, neste diretório. O manifesto novo dentro dele descreve as cópias efetivamente incluídas e distingue as derivadas. O manifesto antigo continua byte idêntico, com193referências; o pacote inclui subconjunto explícito, não todo o laboratório. Cluster/WAL/dumps/.env/segredos/keys/node_modules/gerados/executáveis/caches e arquivos de outras frentes são excluídos.
O SHA-256 final do ZIP só é calculado após fechá-lo e fica no PACKAGE_DESCRIPTOR.json/PACKAGE_SHA256.txt externos, evitando circularidade. Um caminho C: é local; não se afirma que o ChatGPT externo recebeu esse anexo. A verificação de nomes/conteúdo/hash das entradas e a checagem de segredos são registradas no descritor.

Arquivos de leitura: INDEPENDENT_REVIEW_COMPLEMENT.md/json, MATRIX_SCOPE_COMPLEMENT.md/json, INDEX_CASO_PROVA.md, CASE_PROOF_SOURCE_INDEX.json, JOURNAL_STATIC_CORRELATION.json, HASH_CHAIN_AND_CATALOG_REVIEW.json, PRISMA_EXTRA_RECHECK.json e comparações de hashes.
