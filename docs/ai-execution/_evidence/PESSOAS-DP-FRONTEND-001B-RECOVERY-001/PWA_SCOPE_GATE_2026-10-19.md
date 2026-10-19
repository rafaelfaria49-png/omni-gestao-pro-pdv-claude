# Gate humano — compatibilidade do inspetor PWA com a main

Data: 19/10/2026. GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001. PR de produto: #273.

## Evidência concreta

No HEAD validado `dab8ce719142f334250c69afe5ed6b6a8cd76e10`, TypeScript e 162 testes passaram, sem skipped/todo, incluindo os 20 novos casos do P2-01. O primeiro build passou com MIGRATION_SKIPPED. A etapa PWA falhou em `scripts/pessoas/inspect-pwa-build.mjs:35`: o stub de importScripts exige zero argumentos, mas o SW recém-gerado contém `importScripts("/client-privacy-cache.js")`.

Esse import já pertence à main: `next.config.mjs:58`, commit `ae8793259df48b1cfa27d3e87bd5cfa74da95c13`, ancestral de origin/main e da execução. Os blobs de next.config.mjs e public/client-privacy-cache.js são idênticos em HEAD e origin/main. O script público registra limpeza de caches históricos de Clientes na ativação. Nenhum desses arquivos foi modificado por esta missão. Esta constatação não substitui a inspeção PWA completa.

## Limite atual

O caminho `scripts/pessoas/inspect-pwa-build.mjs` **não está na allowlist** da revisão 6 nem no marcador atualizado oficialmente. ENTRYPOINT determina: “Escreva só dentro da allowlist” e “Gate não liberado no GOAL = pare e peça autorização humana”. Não é permitido remover o import da configuração global, fabricar um SW sem esse import, ignorar a falha, copiar o inspetor para outro caminho ou alterar o marcador à mão.

## Proposta restrita para decisão humana — não executada

1. Replanejar formalmente este mesmo GOAL, acrescentando somente o caminho do inspetor e registrando um rito oficial compatível de atualização da sessão existente. Preservar tentativa 1/3, opened_at, attempts_log, histórico, gates e item 8. Esta proposta não autoriza mudança no core AEP nem edição manual de derivados ou marcador.
2. Atualizar o inspetor para verificar explicitamente o único import local aprovado na main, incluindo presença e conteúdo do arquivo, mantendo recusa de import desconhecido, ausente ou externo. Executar/inspecionar o script importado em contexto controlado e verificar sua ativação; não simplesmente silenciar importScripts.
3. Preservar todas as provas atuais de Pessoas NetworkOnly, HTML/RSC/prefetch, offline sem cache/fallback, worker auxiliar sem aquecimento de Pessoas, revision/MD5 e comportamento das rotas de controle. Acrescentar regressões do import aprovado e das recusas de import indevido em um caminho de teste permitido pelo plano.
4. Não alterar next.config.mjs, public/client-privacy-cache.js, auth, schema, dependências, produção ou política de privacidade. Não dispensar PWA ou E2E.
5. Reavaliar espaço físico antes da instalação e repetir a validação necessária, incluindo os ajustes de lint posteriores ao HEAD já testado. A dispensa externa permanece condicional; close somente após todos os gates.

## Trabalho autorizado já concluído

P2-01 corrigido e comprovado por PostgreSQL real descartável. As duas causas de lint foram corrigidas nos arquivos já permitidos: dependência do efeito documental e montagem do provider no teste React. Esses últimos ajustes ainda precisam de reexecução; não recebem PASS antecipado. Cleanup do runner passou; nenhum recurso produtivo ou WIP de outro terminal foi utilizado.

**Decisão pendente:** autorizar o replanejamento restrito e seu fluxo oficial, ou manter o GOAL aberto e a PR draft com este bloqueio documentado. Nenhum merge da #273, close/DONE ou GOAL 002 foi executado.
