# Recovery 002 — gate real de preflight, 29/10/2026

GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-002. HEAD funcional: bb573fdf9a892c870cdc5d238c1cc8395b4cb9b5. MAIN_BASE: aaab27505a03903d9fb8333baef5b52424821093. Branch/worktree originais preservados.

## Retomada e merge

Fetch confirmou a main aaab275. Merge normal em 902b3089f60d2ab862c657d5c979b705c82ffa68, sem reset, force, rebase, amend ou ours/theirs. O detector de renames havia aplicado a revisao 9 ao arquivo fechado e removido o caminho quente. Antes do commit, os dois caminhos foram restaurados explicitamente dos blobs canonicos de origin/main. O historico revisao 8 e o ledger sao identicos na origem, main e HEAD; plano revisao 9 identico na main/base/HEAD. Os 35 caminhos funcionais da origem estavam intactos no merge; diff contra a main dentro da allowlist. verify --all e diff check PASS.

resume-blocked foi executado exatamente como autorizado, primeiro dry-run PASS, depois aplicacao PASS. Marcador criado atomicamente pela CLI; attempt=2, historical_attempt=1, attempts_log vazio. Sem open, refresh-active, edicao manual de marcador ou falha artificial.

## Correcao auth verificada

Commit bb573fdf9a892c870cdc5d238c1cc8395b4cb9b5: retorno especifico somente para /dashboard/pessoas e /dashboard/pessoas/*, depois da aprovacao real de canAccessPage e antes dos filtros Enterprise por substring. Cookie/Store e guards DP nao foram editados. Regressao com funcoes reais: 13 testes page-access + 26 testes do consumidor = 39 PASS, zero falhas/skipped/todo. Inclui configuracoes, limite de prefixo, permissoes Enterprise ausentes, rotas negadas, cookie de Store nao concedida e revogacao. Nenhum mock de acesso.

Lint focado dos quatro paths auth: exit 0, zero erros/avisos. Verificacao usou dependencias existentes e Node v26.12.1; nao houve instalacao limpa e nao equivale ao runner oficial. JSONs auth-focused e auth-lint estao vinculados ao HEAD acima. Autorrevisao do patch auth: sem achados bloqueantes no recorte; autorrevisao integral da entrega permanece pendente.

## Gate comprovado e ponto de parada

Medicao fs.statfsSync no volume C da worktree, TEMP e evidencia: 11.706 GiB livres, minimo obrigatorio 12 GiB. Faltam 301.2 MiB apenas para o limiar inicial; instalacao e builds exigem margem adicional, mantendo o minimo depois dessas etapas. Detalhes e instante em PREFLIGHT_GATE_2026-10-29.json. O runner canonico recusa espaco insuficiente em frontendSpace antes da instalacao e novamente depois da instalacao/antes do build. Nenhuma limpeza adicional esta autorizada pelo plano. O Node padrao e v26.12.1; o runner exige Node 24, e nenhum runtime alternativo foi validado nesta coleta.

Sem npm ci, runner integral, banco descartavel, build, E2E ou recursos QA iniciados. Causa E2E historica continua HYPOTHESIS: fixture ainda tem membership somente B e usa a pagina administrativa /dashboard/unidades; sua correcao e a correlacao real de sessao/API/URL/DOM permanecem pendentes. Nao elevar STORE a PLATFORM nem enfraquecer asserts.

Typecheck, regressao integral/20 casos documentais/PostgreSQL, dois builds/PWA, E2E ON/OFF, matriz visual/acessibilidade, Preview/R2 e autorrevisao integral nao foram executados. Nao chamar close para ratificar DONE com esses gates pendentes. Este bloqueio sera ratificado apenas pelo block oficial da tentativa 2/3, preservando o BLOCKED 1/3 e usando arquivo fechado r9-a2 separado. Sem push/PR funcional antes de DONE; PR #273 e producao intocadas. Nao iniciado GOAL 002.

## Acao humana necessaria

Liberar espaco adicional no volume C com margem para instalacao/build e selecionar Node 24. Apos ratificacao de block, nova retomada exige plano revisado integrado e resume-blocked autorizado; a proxima corretiva cumulativa e 3/3. Nao apagar/regenerar marcador nem reiniciar contador.
