# CAD-R2-021 — relatório único de texto, voz e prontidão de governança

## Implementação da voz local de Clientes — 19/10/2026

`GOAL=CAD-R2-021`. `VOICE_IMPLEMENTATION=IMPLEMENTED_LOCAL_ONLY` (estado funcional em dispositivo: ver "Captura real"). `TEXT_CAPTURE=PRESERVED`. `HUMAN_REVIEW=REQUIRED`. `CLIENT_WRITE_SERVICE=REUSED`. `VOICE_AUDIO_STORAGE=NONE_IN_APPLICATION`. `REMOTE_FALLBACK=DISABLED`. `OTHER_MODULES=UNCHANGED`. `SCHEMA_MIGRATIONS=UNCHANGED`. `WIP_PRESERVED=YES`.

### Autoridade e base

Decisão do responsável pelo produto: desenvolver e desbloquear tecnicamente a voz de Clientes, sem novo GOAL, preservando #282 e #286. Não é parecer jurídico, consentimento de titulares nem aprovação de fornecedor externo; processamento remoto continua sem aprovação (VOICE-GOVERNANCE.md, "Decisão registrada"). Base conferida após fetch: `a6777234bcc336fef64ecb7491d5705bdd404b39`. Worktree isolada `.worktrees/cad-r2-021-voz`, branch `claude/cad-r2-021-voz-clientes-funcional`. Worktree principal e seu WIP intocados. `.aep-active` ausente; não existe trilha AEP de Cadastros; nenhum state/LEDGER/REGISTRY editado.

### O que mudou

- **Política** (`lib/cadastros/voice-capture/cliente.ts`): `CLIENT_VOICE_PRIVACY_GATE` (bloqueio permanente) substituído por `CLIENT_VOICE_POLICY` congelado — local estrito, sem fallback remoto, pt-BR, 30 s, 2000 caracteres, sem áudio armazenado, sem autosave. Mensagens próprias de Clientes sobre a máquina compartilhada `reduceVoiceCapture`, com descarte do trecho temporário em todo término sem sucesso. Formatação visível da transcrição (pontuação falada, separação dos rótulos que o parser conhece) e junção em linha própria.
- **Adapter local** (`lib/cadastros/voice-capture/local.ts`): verificação por metadados (`available({langs:["pt-BR"], processLocally:true})`, contexto seguro, API on-device completa), instalação explícita do pacote, sessão com `processLocally = true` antes de `start()`, recusa de instância que não confirma o modo local, parar/cancelar/descartar, limites de duração e caracteres, carência de `end`. Reconhecimento genérico nunca é aceito.
- **Editor** (`ClienteEditor.tsx`): "Ditar por voz" / "Instalar voz local pt-BR" / "Verificar voz local" / "Voz indisponível" conforme o terminal; "Parar ditado", "Cancelar ditado", indicador "Ouvindo · m:ss de 0:30"; transcrição ao vivo somente leitura e, ao concluir, texto editável; "Interpretar texto" e "Salvar cliente" bloqueados durante a escuta; fechar, trocar loja, descartar, ocultar aba e `pagehide` encerram o motor e invalidam callbacks. Rótulo de origem "Extraído da transcrição por voz" na revisão.
- **Action** (`cliente-texto-livre.ts`): depois de autenticar/autorizar a loja, aceita só os literais `text`/`voice`; qualquer outra origem é recusada antes do parser com mensagem constante. A origem não muda parser, sugestão nem `salvarClienteRevisado` → ClientWriteService.
- **Sem mudança**: adapter/máquina/tipos de voz de Produto (`browser.ts`, `session.ts`, `types.ts`, `detect.ts`, `index.ts`), `produto-ia.tsx`, Prisma/schema/migrations, auth/proxy, `next.config.mjs` e os demais HUBs.

### Testes

Simulados (motor sintético `__fixtures__/fake-local-speech.ts`, sem áudio): unidade do adapter, política, Action e UI cobrindo início, parada, cancelamento, permissões negadas, `audio-capture`/`no-speech`, compatibilidade pt-BR (available/downloadable/downloading/unavailable/política/timeout/contexto inseguro/API genérica), `processLocally` obrigatório e sem fallback, eventos tardios após cancelar/fechar/trocar loja, aba oculta/`pagehide`, limites, revisão humana, duplicidade e isolamento por loja na Action, ausência de logs/storage/URL. Duas mutações (remover `processLocally`; remover o encerramento no unmount/ocultação) derrubaram 18 e 4 testes, respectivamente; arquivos restaurados byte a byte.

Smoke Chromium do editor real (motor SIMULADO injetado, I/O das Actions simulado) em 1440×1000, 390×844 e 320×740: instalação explícita, início local pt-BR, transcrição ao vivo, parar → texto editável, interpretação com origem `voice`, revisão, aplicação, confirmação, save simulado, cancelamento com evento tardio, troca de loja abortando o motor, motor genérico recusado e caminho por texto. Zero chamadas a microfone/permissões pela aplicação, zero rede externa, zero storage, zero page errors, sem overflow. Capturas `voice-listening-*.png` e `review-*.png`.

### Captura real

`scripts/cadastros/real-voice-capture-local.mjs` (fora do CI) dirige o editor real no Chrome instalado, com fala **sintética** pt-BR gerada localmente (SAPI) entrando por dispositivo de áudio falso e a rede do navegador bloqueada por proxy morto durante o reconhecimento. Estado nesta máquina antes de qualquer instalação: Chrome 155.0.8059.80 com API local, `available(pt-BR, local) = downloadable` → `real-voice-capture.json` = `NOT_RUN_LOCAL_PACK_UNAVAILABLE`. A captura exige que o Chrome baixe o modelo pt-BR (ação separada, sujeita a autorização). Até uma captura real passar, não se declara voz funcional em dispositivo.

## Continuação — 19/10/2026

`CAD_R2_021_STATUS=PARTIAL_BLOCKED`. `TEXT_CAPTURE=PUBLISHED_PRESERVED`. `VOICE_CAPTURE=DISABLED`. `VOICE_PRIVACY_GATE=BLOCKED`. `LEGAL_APPROVAL=PENDING`. Testes, revisão, CI, merge ou deployment não substituem a decisão administrativa/jurídica.

### Autoridade, base e isolamento

Comando humano: continuação autônoma de Voice Privacy & Governance Readiness do GOAL existente, sem habilitação de voz. Base remota conferida após fetch: `9eb59d08f06af881adc7d2e11a167ef24c5a1fee`. Branch isolada: `codex/cad-r2-021-voice-governance-readiness`; nenhuma modificação na worktree principal. `.aep-active` ausente na principal e na nova worktree; AEP opt-in inativo. Nenhum state/LEDGER/REGISTRY editado. PRs paralelas inventariadas e preservadas.

### Reconciliação com a entrega publicada

A [PR #282](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/282) foi merged, head `bf16f06c519496450b531f891f261d9a909df575`, merge `d6bdaa023f44a2ad3a7650c68979810934636069`. O [CI anterior](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39143910374) aprovou TypeScript, lint de fontes ativas, 994 testes/20 skips, build sem migrations e smoke responsivo. O prefixo de build `d6bdaa023f44` foi observado no smoke somente GET da publicação anterior. Esses números são históricos, não resultados presumidos desta continuação. A main atual inclui alterações posteriores de outras frentes.

O texto já publicado não foi reimplementado. Os parágrafos abaixo de “Histórico da PR #282” registram sua evolução e suas falhas intermediárias; referências antigas a validação/merge pendentes não descrevem o estado atual dessa PR.

### Auditoria e proteções desta continuação

- Leitura direta de gate, lifecycle, Action, editor, tipos, parser, testes e dependências. Gate constante `false`, agora congelado em runtime; sem env, query, local/sessionStorage ou configuração externa para ativá-lo.
- UI sem import do adapter de fala, construção de reconhecedor, enumeração de dispositivos ou solicitação de microfone. Testes ampliados para os dois nomes de SpeechRecognition, query/storage adulterados, APIs de permissão e descarte de respostas tardias/erros após fechamento e troca de loja.
- Action direta autentica/autoriza antes de responder e recusa origem não literal `text` antes do parser; matriz ampliada de tipos/valores adulterados, sem rede, escrita, auditoria ou log de conteúdo. O discriminador não certifica a origem física de uma string fornecida pelo chamador; ferramentas externas de ditado não são ativadas pela aplicação.
- Texto/sugestão efêmeros e DTO de escrita revisado preservados; ClientWriteService continua sendo a fronteira canônica, com identidade, deduplicação, UNIQUE e isolamento de loja.
- Smoke Chromium instrumentado para falhar se o editor consultar motores de fala, permissões ou microfone. Probe de compatibilidade separado do produto consulta apenas metadados de pt-BR em localhost com microfone negado; não instala pacotes nem inicia áudio.
- PostgreSQL local indisponível (Docker sem daemon). CI preparado com serviço PostgreSQL descartável, credenciais sintéticas e guard de URL exata/loopback antes de qualquer operação. `db push` somente materializa o schema inalterado nesse serviço; não executa migrations nem backfill. O teste de update concorrente foi fortalecido: documento novo e exatamente um sucesso, evitando PASS com duas recusas sobre documento previamente ocupado.

### Pacote preparado para análise humana

- [VOICE-GOVERNANCE.md](VOICE-GOVERNANCE.md): finalidades separadas, hipóteses sem fundamento selecionado, matriz de agentes, retenção/minimização por camada, riscos de atendente/cliente/terceiros/sensíveis, minutas de transparência, diligência de transferência, matriz de decisão e suspensão. **Todos os campos de aprovação permanecem PENDENTES.** Não há parecer, assinatura ou aceite fictício.
- [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md): alternativas local/externa/manual, API/pacotes pt-BR, compatibilidade documental, Permissions-Policy, estados de erro e proibição de fallback remoto. Google Cloud Speech-to-Text V1 e Azure Speech avaliados apenas como candidatos; contratos, contas e países efetivamente contratados não validados. Não se declara retenção zero de fornecedores.
- Próximo ato humano indispensável: administração e assessoria jurídica identificarem responsáveis reais e documentarem finalidade/base, tecnologia/escopo, destinatários/países, retenção, avisos, condições e suspensão. Homologação dos terminais e qualidade de reconhecimento ainda dependerá de autorização apropriada; nenhuma captura de áudio real foi executada.

### Validação e publicação desta continuação

Validação local: 48 testes de Action/gate/guard passaram; o worker jsdom inicialmente não iniciou por timeout no host com pressão de memória. A repetição isolada aprovou os 13 testes de UI: 61 testes focados PASS. ESLint dos dez arquivos de código alterados passou sem erros/warnings; sintaxe dos scripts e `git diff --check` passaram.

A [PR #286](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/286) foi aberta com commit inicial `2c486c0d9e3f29337a8e17c68f5fc578565408a2`. As 20 integrações passaram em PostgreSQL descartável no primeiro CI, sem escrita produtiva. A revisão automatizada apontou que `Promise.all` sozinho não comprova colisão UNIQUE. Corrigido para usar duas conexões reais, barreira imediatamente antes de create/update (após os lookups), confirmação de dois backend PIDs e observação obrigatória de exatamente um P2002 real, além do resultado de domínio seguro. A nova execução deve validar esse cenário mais forte.

O [primeiro CI completo](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39193697563), head `2c486c0d9e3f29337a8e17c68f5fc578565408a2`, passou TypeScript, lint de fontes ativas (0 erros/91 warnings históricos), regressões, build com `MIGRATION_SKIPPED`, smoke em 1440/390/320 e probe sem áudio. No smoke, zero chamadas às APIs de voz/microfone/permissões, zero rede externa, zero storage, zero page errors e sem overflow. I/O de save simulado; editor/parser reais. Não se declara save autenticado produtivo testado.

No [CI da correção](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/39194301274), head `b8d4300aa71c83a5084336b1106f47288a651e8e`, as 20 integrações passaram novamente, agora exigindo a corrida real e P2002. A suíte sem banco pode exibir os 20 opt-in como skips; o job PostgreSQL separado os executa efetivamente. O workflow passa a produzir também `voice-regression.json` para contagem exata das regressões no head final, sem depender da apresentação dos logs.

Compatibilidade observada no primeiro runner: Chromium 136.0.7103.25 expõe reconhecimento genérico, mas não API local nem consulta de pacote; `ptBR=NOT_CHECKABLE`. Não existe demonstração de suporte local pt-BR nos terminais atuais da operação. Arquitetura local continua não homologada, mesmo com o pacote documental pronto.

### Self-review R5 da continuação

1. **Autoridade e escopo:** comando humano autoriza preparação/publicação técnica; não autoriza voz. AEP inativo; 14 caminhos específicos, sem áreas protegidas nem controle manual de state/LEDGER/REGISTRY.
2. **Privacidade:** gate imutável, UI sem engine/permissão, Action com recusa antes do parser, nenhuma integração externa. Minutas não publicadas como aceites; retenção externa/infraestrutura separada da efemeridade comprovada na aplicação.
3. **Contexto e lifecycle:** testes de loja/sessão reais no servidor, campos de autoridade ignorados, respostas tardias de sucesso/erro descartadas na UI; preservação do manual e confirmação explícita.
4. **Integridade:** writer e identidade canônicos preservados. Corrida sintética com duas conexões/transações reais, barreira após lookup, UNIQUE e mapeamento P2002 comprovados no serviço PostgreSQL descartável; nenhum backfill ou migration.
5. **Evidência e release:** limitações locais registradas, CI e fontes oficiais vinculados; revisão automatizada e gates no head a integrar são obrigatórios antes do merge. Deployment canônico e smoke final só leitura, sem alterações de secrets ou da autoridade de migrations.

### Recibo final de publicação

O resultado único pós-execução, com SHA final, commits, CI/revisão, merge, deployment/smoke e limpeza da worktree, será registrado no corpo da [PR #286](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/286) e no relatório final entregue ao solicitante. Este arquivo preserva as evidências verificadas antes de sua própria publicação; não presume aprovação futura. Os artefatos `voice-regression.json`, `postgres-integration.json`, `postgres-isolation.json`, `browser-smoke.json` e `voice-compatibility.json` pertencem ao CI do head respectivo.

`PRODUCTION_DB_WRITES_BY_AGENT=0`. `MIGRATIONS_EXECUTED=NO`. `CAD_R2_022_STARTED=NO`. `WIP_PRESERVED=YES`.

## Histórico da PR #282

Registro histórico da implementação e revisão anterior. Texto publicado; voz continuou bloqueada. Não declarar o GOAL encerrado nem habilitar o microfone com base em testes técnicos.

## Escopo e autoridade

Base remota verificada: `976ebaa294e09441ce0c5be7bbe5776a568f4013`. Branch `codex/cad-r2-021-cliente-texto-voz`, em worktree nova e isolada. WIPs e worktrees anteriores preservados. ENTRYPOINT lido, `.aep-active` ausente; `track status cadastros` confirmou que não existe trilha AEP de Cadastros. Nenhum state, LEDGER ou REGISTRY editado.

Nenhuma especificação REV2.2 posterior/CAD-R2-021 foi encontrada no código versionado da main. Aplica-se o contrato detalhado da missão humana. As pendências de `CAD-R2-020-PRIVACY-20261015/GOVERNANCE.md` continuam abertas. Não se inferiu consentimento, base jurídica ou aprovação de compartilhamento.

## Implementação

- Editor real do HUB extraído para `ClienteEditor.tsx`, com componentes e tokens existentes, diálogo Radix, labels, foco e uma coluna no celular. A marca visual é o preview por campo com origem explícita. Criação e edição continuam na mesma superfície do HUB.
- Parser fechado e determinístico de Cliente em `natural-text/cliente.ts`; envelope de sugestão reutiliza o contrato 016, com schema de Cliente separado. Nome, telefone, CPF/CNPJ, email, cidade, endereço e UF somente com evidência explícita. Documentos e números ambíguos não são adivinhados. Normalizadores/validadores de identidade canônicos reutilizados.
- Sugestões editáveis; campos ausentes/ambíguos identificados; aplicação preenche apenas vazios; descarte e cancelamento sem escrita. Troca de loja, unmount, reabertura e edição do texto invalidam respostas anteriores. Texto/transcrição não entram no payload de escrita.
- Confirmação explícita e novo clique de salvar; alterações posteriores revogam a confirmação. Adapter server-side autoriza sessão/perfil/loja, valida o DTO fechado e chama exclusivamente ClientWriteService, com autor canônico e preservação server-side dos metadados ocultos. Sem force/reviewDecision/merge automático. Histórico financeiro/fiscal e UNIQUE permanecem no serviço existente.
- Gate de voz efetivo na UI e na Action: não constrói SpeechRecognition, não solicita permissão e recusa captureSource diferente de text. Reutiliza o lifecycle compartilhado de captura no estado unavailable. O aviso informa que o reconhecimento do navegador pode enviar áudio externamente.
- Sem providers externos de IA no caminho de Cliente, sem logs de captura/PII, URL de busca, armazenamento local ou cache próprio. Motores 016/017 de Produto preservados.

## Validações até o primeiro commit

- 986 testes passaram; 20 integrações opt-in ficaram skipped (16 de listagem SQL de Produto e 4 de concorrência PostgreSQL). 65 arquivos: 63 passaram e 2 skipped. Inclui writer, identity, merge, documento/UNIQUE, privacidade, HUB, importadores, consumidores, Produto 016/017, novas Actions e editor. Banco fictício de loopback/mocks, zero escrita em banco real. Resultado completo em `regression.json`.
- Os testes novos usam nomes e números sintéticos para algoritmos, sem vínculo com pessoas reais. A integração das novas Actions usa os gates, classificadores e ClientWriteService reais com persistência simulada.
- O primeiro worker de interface sofreu timeout de inicialização com pouca memória; a execução sequencial passou. Um warning de descrição Radix encontrado foi corrigido e a regressão subsequente passou sem esse warning.
- Typecheck local não aprovado por esgotamento de memória do host de 8 GB, inclusive em execução isolada. `typecheck.log` preserva a falha ambiental; não equivale a PASS. Workflow dedicado valida o commit em ambiente limpo com Node 24, TypeScript, lint, regressões, build sem migrations e smoke em Chromium.
- Lint completo, CI, build, smoke responsivo e release: resultados finais a acrescentar após execução. Nenhum resultado futuro presumido.

## Self-review R5

1. **Autoridade:** gates reais de sessão, perfil e membership cobertos; contexto canônico do servidor prevalece sobre payload adulterado; IDOR update e matches de outra loja recusados/isolados.
2. **Privacidade:** caminho determinístico sem imports do interpretador externo de Produto; erros constantes; sugestão efêmera; payload de save fechado, sem transcript, fonte bruta ou campos financeiros; gate de voz fechado em duas fronteiras.
3. **Integridade:** nenhum motor paralelo de identidade/escrita; conflitos fortes, duplicidade de contato, colisão UNIQUE P2002 e metadados ocultos testados com writer real; sem merge, mudança de schema, migration ou reexecução do backfill.
4. **Interface/lifecycle:** revisão, correção, preservação de dados manuais, confirmação revogada ao editar, descarte, cancelamento, concorrência e troca de loja cobertos. Diálogo, labels e mensagens operacionais reutilizam componentes existentes. Conferência visual ainda pendente neste registro inicial.
5. **Evidência/release:** resultados locais distinguidos dos checks remotos. Merge e produção dependem de CI verde e revisão da PR. `MIGRATION_AUTHORITY_ENABLED=false` informado na missão não será alterado. Smoke produtivo será somente leitura, sem gravação de clientes reais.

## Dependência para voz

A administração e a assessoria jurídica precisam aprovar e documentar o processamento de voz de Clientes: finalidade, fundamento aplicável, serviço/navegadores autorizados, destinatários, retenção e comunicação ao operador. Essa aprovação não foi fornecida. O gate fica fechado até implementação e validação contra tal decisão; um checkbox do operador não substitui essa autorização.

CAD_R2_021_STATUS=PARTIAL. READY_FOR_NEXT_GOAL=NO. CAD-R2-022 não iniciado.

## Revisão e CI — continuação

- A revisão automatizada da PR #282 identificou dois P2, corrigidos em `66812da`: edições de registros históricos com documento inválido continuam sob a policy do writer; marcadores de campo não dividem palavras dentro de nomes/endereços. Testes específicos acrescentados. Threads respondidas e resolvidas; a nova revisão de `66812da` terminou sem achados.
- A revisão própria também preservou o tipo PF/PJ escolhido pelo operador e marcou UF explícita conflitante como ambígua.
- TypeScript completo PASS no runner, execução 39140256136. A execução anterior encontrou `startSaving` removido da inativação inline e uma opção não tipada num helper de teste; ambos corrigidos.
- Nova regressão local: 988 PASS/20 skipped, seguida de testes focados verdes para o delimitador final. O relatório JSON local registra essa execução; a contagem final do CI pode incluir os casos acrescentados depois.
- O scan de lint sem excluir cópias encontrou 105 erros antigos apenas em `components/pdv-github-original/claude-export` e `components/pdv-github-original/components/studio/components/bom-dia-modal.tsx`, sem alterações da tarefa. Não foi declarado PASS para esse scan bruto. O Vitest já exclui o espelho e o tsconfig já exclui seus componentes copiados. O wrapper vivo `PdvGithubOriginal.tsx` importa `Icons`, `Modals` e `data` da raiz do espelho, não os exports/cópias defeituosos. A CI verifica todas as fontes ativas, inclusive esse wrapper, excluindo somente Prisma gerado e essas duas árvores de cópias. Nenhuma regra de ESLint ou código do PDV foi modificado.
- Smoke local Chromium PASS em 1440×1000, 390×844 e 320×740. Editor e parser reais, CSS real compilado diretamente do `app/globals.css`; apenas I/O das Actions simulado. Revisão, correção, confirmação revogada após edição, aplicação, save simulado, descarte/reabertura e resposta antiga após troca de loja passaram. Sem overflow horizontal, chamadas externas, entradas em local/sessionStorage ou page errors. Capturas desktop e mobile inspecionadas. Evidências: `browser-smoke.json` e `review-*.png`. Isso não substitui o build completo ou smoke de produção.
- O próprio smoke inicialmente usou polling incompatível com a CSP restritiva do harness. Corrigido para polling pelo runner, preservando a CSP; a execução completa subsequente passou. Não houve mudança na segurança da aplicação para viabilizar o teste.
- A execução 39141288488 de `d36cb52` passou integralmente: TypeScript, lint de fontes ativas, regressões, build completo sem migrations e smoke Chromium com CSS do build. A revisão desse SHA identificou mais um caso de endereço com bairro iniciado por palavra de rótulo (`Cidade Jardim`). Corrigido conservadoramente: após Endereço, outro campo exige `:`/`=` ou separação por ponto e vírgula/nova linha; vírgulas internas permanecem no endereço. 58 testes focados passaram; a validação integral será repetida para esse ajuste antes do merge.
- A execução 39142043853 de `3ebb16f` também passou integralmente. A revisão pediu validação de identidade efetivamente alterada durante edição: uma leitura mínima autorizada no servidor prova o original; tipo/documento são revalidados juntos quando mudam, telefone/email modificados são validados, e campos históricos intocados são omitidos do patch. O writer continua sendo a única fronteira de escrita/dedupe/transação. 62 testes focados passaram, incluindo tentativa de trocar PF por PJ conservando CPF e alterações inválidas de identidade legada. Os gates completos serão repetidos para esse ajuste.
