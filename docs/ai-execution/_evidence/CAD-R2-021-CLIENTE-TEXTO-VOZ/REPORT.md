# CAD-R2-021 — relatório único de texto, voz e prontidão de governança

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

TypeScript completo, lint de fontes ativas, regressões, UI, 20 integrações PostgreSQL, build e smoke são gates do CI limpo. Resultados finais, revisão, merge/deploy e limpeza serão registrados após conferência. Nenhum PASS futuro é presumido.

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
