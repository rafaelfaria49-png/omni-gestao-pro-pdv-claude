# CAD-R2-021 — Cliente por texto e voz

Entrega parcial em validação. Texto implementado; voz bloqueada por revisão administrativa/jurídica de processamento. Não declarar o GOAL encerrado nem habilitar o microfone com base em testes técnicos.

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
