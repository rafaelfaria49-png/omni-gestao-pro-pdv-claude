# CONTADOR HUB — COMANDOS COMPLETOS (1 por GOAL)

| Campo | Valor |
|---|---|
| GOAL de origem | CONTADOR-HUB-FABLE5-MASTERPLAN-001 |
| Data | 2026-07-11 |
| Total de comandos | 19 (GOALs 001–019) |
| Documentos irmãos | MASTERPLAN, IMPLEMENTATION_GOALS, ADRS (mesma série) |

## Regras permanentes (embutidas em cada comando)

Cada comando abaixo é autocontido e já embute: worktree isolada por GOAL, allowlist/blocklist de arquivos, proibição de `git add .` / `git add -A` / `git commit -a` / `git reset|restore|stash|rebase|merge`, stage por caminho, commit convencional, push apenas da branch do GOAL e relatório final obrigatório. Nenhum comando faz push para main. GOALs de schema (009, 014, 016) exigem gate de aprovação prévio (G2/G3). Modelo recomendado: **Claude Code com Claude Fable 5**; GOALs 002, 005 e 007 podem rodar com Sonnet 4.6 sem perda relevante.

---

## COMANDO 1/19

```
GOAL: CONTADOR-HUB-STATUS-RECONCILE-001

Usar: Claude Code com Claude Fable 5
Modo: auditoria read-only + documentação
Base esperada: origin/main mais recente

OBJETIVO
Reconciliar o masterplan (produzido a partir da auditoria sobre origin/main=1911415,
commit visual 9023e7b) com o código atual, registrar o delta e incluir o Contador HUB
no tracking oficial de mocks.

CONTEXTO
O masterplan e os comandos da série 001 foram escritos sem acesso direto ao repositório.
Este GOAL é o gate G1: nada da série é implementado antes desta reconciliação.

ISOLAMENTO (REGRA PERMANENTE)
- Há outros chats/terminais/worktrees em paralelo. Não bloquear por isso; não tocar
  em nada do trabalho paralelo.
- Proibido: git reset, git restore, git stash, git rebase, git merge,
  git add ., git add -A, git commit -a.
- Nunca fazer push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git log -15 --oneline origin/main
git worktree list
git worktree add C:\Projetos\omni-gestao-contador-001 -b goal/contador-001-status-reconcile origin/main
cd C:\Projetos\omni-gestao-contador-001

PASSOS
1. Localizar o estado atual do Contador HUB:
   git log --all --oneline --decorate --grep="contador"
   git grep -n "Contador HUB" -- app components lib docs
   git grep -n "/dashboard/contador" -- app components lib docs
   git grep -n "Pacote do Contador" -- app components lib docs
   git grep -rn "noop(" components/dashboard/contador
2. Confirmar: existência e conteúdo de app/dashboard/contador/page.tsx,
   components/dashboard/contador/contador-hub-preview.tsx, contador-preview-data.ts,
   area-contador-pro.tsx, lib/contador-aggregates.ts, app/contador/*,
   app/login-contador/*, app/api/auth/contador/route.ts,
   app/api/ops/vendas-list/route.ts, lib/ops-api-gate.ts, proxy.ts,
   lib/loja-ativa.tsx, lib/operations-store.tsx, prisma/schema.prisma
   (procurar por qualquer model "Contador*").
3. Comparar cada afirmação central do masterplan (§3 e §21) com o código:
   classificar cada item como CONFIRMADO, DIVERGENTE (descrever) ou NOVO.
4. Verificar se commits posteriores tocaram o módulo contador ou os guards citados;
   listar branches remotas relacionadas: git branch -r | findstr /i contador
5. Confirmar presença dos 4 documentos da série em docs/contador/; se ausentes,
   apenas reportar (não criar aqui).
6. Criar docs/contador/CONTADOR_HUB_STATUS_RECONCILE_001.md com: hash atual de
   origin/main; tabela de reconciliação; deltas classificados
   (nenhum | ajusta plano | bloqueia); riscos P0 reconfirmados ou alterados.
7. Atualizar docs/status/MOCKS_TRACKING.md: adicionar entrada do Contador HUB
   (rota, componente, arquivo de dados fixos, 16 no-ops, data). Alteração pontual;
   não reformatar o arquivo.

SEGURANÇA
- Nenhum código alterado. Nenhum schema. Somente os dois documentos acima.

TESTES / TYPESCRIPT / ESLINT / BUILD
- Não aplicáveis (documental). Não rodar build.

VALIDAÇÃO MANUAL
- Reler o delta e conferir que cada divergência aponta arquivo e linha.

ENTREGA
git status --short
git diff --name-only
# O diff deve conter SOMENTE:
#   docs/contador/CONTADOR_HUB_STATUS_RECONCILE_001.md
#   docs/status/MOCKS_TRACKING.md
# Qualquer outro arquivo: não tocar, não adicionar, apenas reportar.
git add docs/contador/CONTADOR_HUB_STATUS_RECONCILE_001.md
git add docs/status/MOCKS_TRACKING.md
git commit -m "docs(contador): reconciliar estado do Contador HUB e tracking de mocks (GOAL 001)"
git push -u origin goal/contador-001-status-reconcile

RELATÓRIO FINAL OBRIGATÓRIO
1. Hash de origin/main analisado.
2. Situação do commit 9023e7b e de commits posteriores sobre o contador.
3. Tabela de reconciliação (confirmado/divergente/novo) resumida.
4. Deltas que ajustam ou bloqueiam o plano da série 001.
5. Confirmação: nenhum código/schema tocado; diff restrito aos 2 arquivos; sem push em main.
6. Recomendação: liberar (G1) ou revisar o masterplan antes dos próximos GOALs.
```

---

## COMANDO 2/19

```
GOAL: CONTADOR-HUB-HONESTY-ROUTE-SAFETY-002

Usar: Claude Code com Claude Fable 5 (Sonnet 4.6 aceitável)
Modo: implementação controlada, somente módulo contador
Base esperada: origin/main com GOAL 001 concluído (G1 liberado)

OBJETIVO
Tornar o preview interno inconfundível como preview e rotular honestamente o portal
legado, sem alterar rotas, APIs ou comportamento funcional.

CONTEXTO
Auditoria classificou como P1 o risco de decisão baseada em dados fictícios
verossímeis: 11 áreas com valores fixos e 16 CTAs no-op em /dashboard/contador;
no legado, XML próprio pode ser confundido com XML fiscal e a alíquota editável
com apuração.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-002 -b goal/contador-002-honesty origin/main
cd C:\Projetos\omni-gestao-contador-002

ARQUIVOS PERMITIDOS
- app/dashboard/contador/page.tsx
- components/dashboard/contador/contador-hub-preview.tsx
- components/dashboard/contador/contador-preview-data.ts
- components/dashboard/contador/area-contador-pro.tsx
- docs/status/MOCKS_TRACKING.md (linha de status, se necessário)

ARQUIVOS PROIBIDOS
- proxy.ts, qualquer app/api/**, prisma/**, lib/** compartilhado,
  qualquer arquivo de outra frente (PDV, Operações, Financeiro, Fiscal, etc.)

PASSOS
1. Preview interno: banner persistente e visível em TODAS as seções
   ("Pré-visualização — dados ilustrativos, sem efeito real"), não só em trechos.
2. CTAs no-op: desabilitar com rótulo explicativo ("disponível na fase de dados
   reais") OU remover, decidindo por CTA; eliminar o padrão toast-de-noop como
   única sinalização. Nenhum CTA pode parecer executável sem sê-lo.
3. Seletor de competência: manter funcional, com nota de que os dados não mudam
   por competência nesta fase.
4. Valores sensíveis do preview (certidões, guias, vencimentos): prefixar
   visualmente como exemplo (ex.: "EXEMPLO —") onde o banner não estiver adjacente.
5. Portal legado: renomear rótulos de exportação para "CSV de agregados
   operacionais" e "XML de movimentos (formato próprio — não é XML fiscal)";
   rotular a alíquota como "estimativa manual — não é apuração"; manter avisos
   existentes.
6. Nada de mudanças de rota, navegação externa, APIs ou dados.

SEGURANÇA
- Mudança exclusivamente visual/textual; sem novo estado, storage ou request.

TESTES
- Se houver harness de componentes: teste de render garantindo banner presente
  por seção. Caso contrário, registrar ausência no relatório.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint app/dashboard/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Navegar pelas 11 áreas: nenhum CTA aparenta efeito real; banner sempre visível.
- Portal legado: rótulos novos visíveis; exportações continuam funcionando.

ENTREGA
git status --short
git diff --name-only   # somente a allowlist acima; extras: não tocar, reportar
git add app/dashboard/contador/page.tsx
git add components/dashboard/contador/contador-hub-preview.tsx
git add components/dashboard/contador/contador-preview-data.ts
git add components/dashboard/contador/area-contador-pro.tsx
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): honestidade visual do preview e rotulos do portal legado (GOAL 002)"
git push -u origin goal/contador-002-honesty

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos alterados. 3. Lista dos 16 no-ops e destino de cada um
(desabilitado/removido/rotulado). 4. Verificações executadas. 5. Confirmação de
diff restrito e sem push em main.
```

---

## COMANDO 3/19

```
GOAL: CONTADOR-HUB-P0-AUTH-EXTERNA-003

Usar: Claude Code com Claude Fable 5
Modo: correção de segurança, superfície mínima
Base esperada: origin/main com GOAL 001 concluído

OBJETIVO
Endurecer a autenticação do portal legado sem mudar o fluxo do usuário:
eliminar PIN default, fail-closed, comparação em tempo constante, rate limit,
cookie assinado de vida curta, logs estruturados e kill-switch por flag.

CONTEXTO
P0 confirmado em auditoria: app/api/auth/contador/route.ts aceita
DEFAULT_CONTADOR_PIN="5678" quando CONTADOR_PIN não está definido; cookie de
sessão é o literal "1" por 7 dias; sem rate limit, sem identidade, sem trilha.
O portal legado continua no ar (decisão de convivência até o GOAL 013/019).

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-003 -b goal/contador-003-auth-externa origin/main
cd C:\Projetos\omni-gestao-contador-003

ARQUIVOS PERMITIDOS
- app/api/auth/contador/route.ts
- app/login-contador/page.tsx (mensagens de erro/limite, sem redesenho)
- proxy.ts (SOMENTE o trecho que valida o cookie do contador; diff mínimo)
- lib/contador/auth/legacy-session.ts (novo)
- lib/contador/auth/rate-limit.ts (novo; ou reutilizar util de rate limit
  existente no repo, se houver — verificar antes de criar)
- Testes correspondentes (ex.: lib/contador/auth/__tests__/*,
  app/api/auth/contador/__tests__/*)
- .env.example (documentar CONTADOR_PIN, CONTADOR_SESSION_SECRET,
  CONTADOR_LEGACY_PORTAL)

ARQUIVOS PROIBIDOS
- prisma/**, app/api/ops/**, lib/ops-api-gate.ts, lib/operations-store.tsx,
  qualquer arquivo de outra frente.

PASSOS
1. Remover DEFAULT_CONTADOR_PIN. Sem CONTADOR_PIN ou CONTADOR_SESSION_SECRET no
   ambiente: responder 503 com mensagem administrativa (fail-closed). Nunca logar
   o PIN recebido nem o esperado.
2. Comparação em tempo constante: comparar sha256(PIN recebido) com
   sha256(CONTADOR_PIN) via crypto.timingSafeEqual.
3. Rate limit por IP: 5 tentativas falhas por janela de 15 minutos → 429 com
   Retry-After. Registrar tentativa/sucesso/bloqueio em log estruturado
   (evento, ipHash, timestamp — sem PIN).
4. Cookie de sessão: substituir o literal "1" por token opaco assinado
   (HMAC-SHA256 com CONTADOR_SESSION_SECRET) contendo issuedAt e expiração
   ≤ 12h; httpOnly, secure em produção, sameSite=lax; validação da assinatura
   no ponto único usado pelo proxy/rota.
5. Logout: revogar/expirar o cookie e registrar evento.
6. Flag CONTADOR_LEGACY_PORTAL: "on" mantém o portal; "off" → /login-contador e
   /contador respondem com página estática "portal desativado" e a rota de auth
   responde 503. DEFAULT: "on" (comportamento atual preservado até decisão do
   Rafael registrada no GOAL 013).
7. Atualizar .env.example com as três variáveis e comentários curtos.

SEGURANÇA
- Fail-closed em produção sem env. Nenhum segredo em código ou log.
- Cookie antigo "1" deixa de ser aceito imediatamente (sessões legadas caem —
  comportamento esperado; relatar).

TESTES (Vitest)
- Sem env → 503. PIN errado → 401 e contador de tentativas incrementa.
- 6ª tentativa em 15min → 429 + Retry-After.
- PIN correto → Set-Cookie assinado, httpOnly, expiração ≤ 12h.
- Cookie adulterado/expirado → rejeitado pela validação.
- Flag off → 503 na rota de auth.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint app/api/auth/contador app/login-contador lib/contador/auth proxy.ts
BUILD: npm run build

VALIDAÇÃO MANUAL
- Login com PIN correto entra; errado bloqueia após 5; logout derruba sessão;
  portal navegável com flag on; flag off desativa tudo.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add app/api/auth/contador/route.ts
git add app/login-contador/page.tsx
git add proxy.ts
git add lib/contador/auth
git add .env.example
# adicionar caminhos de teste criados, um a um
git commit -m "fix(contador): endurecer autenticacao do portal legado (GOAL 003)"
git push -u origin goal/contador-003-auth-externa

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos alterados/criados. 3. Antes/depois de cada mecanismo
(default, comparação, rate limit, cookie, flag). 4. Testes e resultados.
5. Efeitos colaterais (queda de sessões legadas). 6. Confirmação: diff restrito,
nenhum segredo em código/log, sem push em main.
```

---

## COMANDO 4/19

```
GOAL: CONTADOR-HUB-P0-STORE-SCOPE-004

Usar: Claude Code com Claude Fable 5
Modo: correção de segurança em arquivos COMPARTILHADOS — risco alto, diff mínimo
Base esperada: origin/main com GOAL 001 concluído
ATENÇÃO: coordenar com frentes paralelas de Operações/PDV antes de iniciar
(arquivos compartilhados). Consequência assumida e autorizada previamente:
o portal legado sem sessão NextAuth perde hidratação remota (degrada para
cache local do navegador).

OBJETIVO
Fechar o IDOR: nenhuma leitura operacional aceita lojaId vindo do cliente como
autorização. /api/ops/vendas-list e o caminho legado de /api/ops/ordens passam
a exigir auth() + canAccessStore, no padrão já correto de /api/ops/inventory.

CONTEXTO
P0 mais grave da auditoria: vendas-list resolve lojaId de query/header/cookie
com apenas requireOpsSubscription() (sem auth(), sem canAccessStore) — qualquer
assinante autenticado lê vendas/clientes/pagamentos de QUALQUER loja trocando o
identificador. O mesmo padrão existe no guard apiGuardOperacoesHubOrLegacy
usado por /api/ops/ordens.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar além da allowlist.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-004 -b goal/contador-004-store-scope origin/main
cd C:\Projetos\omni-gestao-contador-004
# Reconhecimento antes de editar:
git grep -n "requireOpsSubscription" -- app lib
git grep -n "canAccessStore" -- app lib
git grep -n "apiGuardOperacoesHubOrLegacy" -- app lib

PASSO 0 — MAPEAMENTO OBRIGATÓRIO (antes de qualquer edição)
Listar TODOS os consumidores de vendas-list e do guard legado de ordens
(git grep por "vendas-list" e pelo nome do guard em app, components, lib).
Se aparecer consumidor não previsto pela auditoria (além de
lib/operations-store.tsx e das telas internas), PARAR e reportar antes de editar.

ARQUIVOS PERMITIDOS
- app/api/ops/vendas-list/route.ts
- app/api/ops/ordens/route.ts
- lib/ops-api-gate.ts
- Testes novos (ex.: app/api/ops/__tests__/store-scope.test.ts)

ARQUIVOS PROIBIDOS
- lib/operations-store.tsx (consumidores NÃO mudam neste GOAL)
- lib/loja-ativa.tsx, proxy.ts, prisma/**, qualquer outra rota ops,
  qualquer arquivo de UI.

PASSOS
1. Espelhar o padrão de /api/ops/inventory:
   a sessão via auth() é obrigatória → sem sessão: 401;
   lojaId solicitado passa por canAccessStore(session, lojaId) → sem acesso: 403.
2. requireOpsSubscription() permanece como verificação ADICIONAL, nunca como
   autorização suficiente.
3. Query/header/cookie de loja passam a ser apenas SELEÇÃO entre lojas às quais
   a sessão já tem acesso — nunca fonte de autorização.
4. Mesmo tratamento no caminho legado dentro de lib/ops-api-gate.ts
   (apiGuardOperacoesHubOrLegacy) usado por /api/ops/ordens.
5. Diff mínimo: somente o bloco de guard; não refatorar, não renomear, não
   alterar formato de resposta de sucesso.

SEGURANÇA
- Nenhuma resposta de erro pode vazar existência de dados de outra loja
  (403 genérico).

TESTES (Vitest — OBRIGATÓRIOS, cross-store)
- Sem sessão → 401 (mesmo com assinatura válida simulada).
- Sessão da loja A pedindo loja B (query, header e cookie, cada um) → 403.
- Sessão da loja A pedindo loja A → 200 com dados.
- /api/ops/ordens caminho legado: mesmos quatro casos.
- Regressão: consumidor interno com sessão válida da própria loja continua
  recebendo o mesmo payload de antes (snapshot de shape).
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint app/api/ops/vendas-list app/api/ops/ordens lib/ops-api-gate.ts
BUILD: npm run build

VALIDAÇÃO MANUAL
- Dashboard interno e PDV seguem funcionando na própria loja.
- Tentativa manual cross-store (alterar header/cookie) → 403.
- Portal legado sem sessão NextAuth: registrar exatamente o que degrada
  (hidratação remota) e o que segue (cache local, downloads sobre cache).

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add app/api/ops/vendas-list/route.ts
git add app/api/ops/ordens/route.ts
git add lib/ops-api-gate.ts
# adicionar caminhos de teste criados, um a um
git commit -m "fix(security): exigir ACL de loja nas leituras operacionais do contador (GOAL 004)"
git push -u origin goal/contador-004-store-scope

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Mapeamento de consumidores (passo 0). 3. Antes/depois de cada
guard. 4. Resultado dos testes cross-store, um a um. 5. Degradação observada no
portal legado. 6. Impacto potencial em frentes paralelas. 7. Confirmação: diff
restrito, sem push em main.
```

---

## COMANDO 5/19

```
GOAL: CONTADOR-HUB-COMPETENCIA-CONTRATOS-005

Usar: Claude Code com Claude Fable 5 (Sonnet 4.6 aceitável)
Modo: lib pura + integração mínima de UI
Base esperada: origin/main com GOAL 001 concluído

OBJETIVO
Criar o contrato canônico de competência (tipos, resolução de período com fuso,
URL ?c=AAAA-MM) e conectar o seletor do preview à URL. Nenhum dado real ainda.

CONTEXTO
Hoje a competência é useState local: não sobrevive a reload, não é compartilhável
e não define fronteiras de data. Toda a Fase 1/2 depende deste contrato
(§7 do masterplan: fuso America/Sao_Paulo, intervalo UTC semiaberto
[início, iníciodoMêsSeguinte), regra-de-data por fonte).

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-005 -b goal/contador-005-competencia origin/main
cd C:\Projetos\omni-gestao-contador-005

ARQUIVOS PERMITIDOS
- lib/contador/competencia.ts (novo)
- lib/contador/__tests__/competencia.test.ts (novo)
- app/dashboard/contador/page.tsx (ler/propagar searchParams)
- components/dashboard/contador/contador-hub-preview.tsx (seletor → URL)

ARQUIVOS PROIBIDOS
- prisma/**, app/api/**, portal legado, qualquer lib compartilhada existente.

PASSOS
1. lib/contador/competencia.ts:
   - Tipos: Competencia { ano: number; mes: number } e
     PeriodoUtc { inicio: Date; fimExclusivo: Date }.
   - parseCompetencia(raw: string | null): Competencia | null
     (formato estrito AAAA-MM; mes 01–12; ano plausível 2000–2100).
   - formatCompetencia(c): "AAAA-MM"; labelCompetencia(c): "julho/2026" pt-BR.
   - resolvePeriodoUtc(c): fronteiras do mês em America/Sao_Paulo convertidas
     para UTC, intervalo semiaberto. Implementar com Intl/date puro ou util de
     data já existente no repo (verificar antes de adicionar dependência; se
     precisar adicionar, PARAR e reportar).
   - anterior(c) / proxima(c) com virada de ano.
   - competenciaAtual(agora?: Date): baseada no fuso de São Paulo.
   - REGRA_DATA_POR_FONTE: constante documentada mapeando fonte → campo de corte
     (venda→at; devolução→data da devolução; título→{vencimento|pagamento};
     movimentação→data; caixa→abertura; transação financeira→competencyDate),
     com comentário citando §7 do masterplan.
2. Rota: page.tsx lê searchParams.c, aplica parse com fallback para a
   competência atual e passa ao componente.
3. Seletor do preview: trocar competência atualiza a URL (router.replace com
   ?c=AAAA-MM, sem scroll reset); anterior/próxima idem; estado deriva da URL,
   não de useState próprio.
4. Rótulo do preview segue informando que os dados ainda não variam por
   competência (mantido do GOAL 002).

SEGURANÇA
- Lib pura, sem IO. Parse estrito rejeita entradas malformadas sem lançar
  exceção não tratada na rota.

TESTES (Vitest)
- Parse: válidos, inválidos ("2026-13", "26-01", vazio, injeção de texto).
- Round-trip parse↔format. anterior/proxima em jan/dez.
- resolvePeriodoUtc: fronteira de mês comum, fevereiro bissexto, virada de ano;
  invariante fimExclusivo = início do mês seguinte; horário de São Paulo
  respeitado na conversão.
- competenciaAtual determinística com "agora" injetado.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/dashboard/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Trocar competência muda a URL; reload preserva; URL colada em outra aba abre
  na mesma competência; c inválido cai na atual.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador/competencia.ts
git add lib/contador/__tests__/competencia.test.ts
git add app/dashboard/contador/page.tsx
git add components/dashboard/contador/contador-hub-preview.tsx
git commit -m "feat(contador): contrato de competencia e periodo com URL canonica (GOAL 005)"
git push -u origin goal/contador-005-competencia

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos. 3. Decisões de implementação de data/fuso (e se algum
util existente foi reutilizado). 4. Testes e resultados. 5. Confirmação: diff
restrito, sem dependência nova (ou parada reportada), sem push em main.
```

---

## COMANDO 6/19

```
GOAL: CONTADOR-HUB-DADOS-REAIS-READONLY-006

Usar: Claude Code com Claude Fable 5
Modo: readers server-side + realificação de seções de leitura
Base esperada: origin/main com GOALs 004 e 005 mergeados

OBJETIVO
Implementar lib/contador/scope.ts (requireContadorScope, caminho interno) e
lib/contador/readers/ (vendas, financeiro, caixa) e realificar a Visão Geral e
os relatórios básicos do HUB interno com dados reais da loja ativa, por
competência da URL.

CONTEXTO
Fontes maduras confirmadas na auditoria: Venda/ItemVenda (status concluida |
cancelada | parcialmente_devolvida, payload de pagamento), DevolucaoVenda,
ContaPagarTitulo/ContaReceberTitulo (vencimento/pagamento), MovimentacaoFinanceira/
CarteiraFinanceira, CaixaSessao/CaixaOperacao, FechamentoFinanceiro,
FinancialTransaction (competencyDate). Regra-de-data por fonte: usar
REGRA_DATA_POR_FONTE do GOAL 005. Guard de referência: /api/ops/inventory.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-006 -b goal/contador-006-dados-reais origin/main
cd C:\Projetos\omni-gestao-contador-006

ARQUIVOS PERMITIDOS
- lib/contador/scope.ts (novo)
- lib/contador/readers/** (novos: vendas.ts, financeiro.ts, caixa.ts, index.ts)
- lib/contador/__tests__/** (novos testes de readers)
- app/dashboard/contador/page.tsx (buscar dados server-side e passar DTOs)
- components/dashboard/contador/contador-hub-preview.tsx e novos
  subcomponentes em components/dashboard/contador/** (seções Visão Geral e
  Relatórios; extrair subcomponentes é permitido)
- docs/status/MOCKS_TRACKING.md (marcar seções realificadas)

ARQUIVOS PROIBIDOS
- prisma/** (nenhuma migration), app/api/ops/** (não criar nem alterar rotas ops),
  lib/operations-store.tsx, portal legado, qualquer escrita em banco.

PASSOS
1. lib/contador/scope.ts: requireContadorScope() para o caminho interno —
   auth() obrigatório, loja ativa validada com canAccessStore, permissão
   p.hubs.financeiro (adotar p.hubs.contador somente se Rafael já tiver
   aprovado; caso contrário, comentar TODO referenciando §27 do masterplan).
   Retorna { tipo: "interno", storeId, userId }.
2. Readers (assinatura padrão: (scope, periodo) => Promise<DTO>; consultas
   Prisma server-side, sem cache global):
   - vendasResumo: total bruto, descontos (registrar no relatório ONDE o
     desconto vive no modelo — investigação obrigatória), devoluções do mês,
     líquido, contagens por status, quebra por forma de pagamento (fonte:
     payload da venda; registrar divergência com MovimentacaoFinanceira se
     houver — investigação obrigatória).
   - vendasLista: page/pageSize para o relatório detalhado.
   - financeiroResumo: recebimentos/pagamentos do mês (dois cortes: por
     vencimento e por pagamento), títulos em aberto na fronteira, saldos de
     carteira quando disponíveis.
   - caixaResumo: sessões do mês, diferenças apuradas, sangrias/suprimentos.
   - Investigação obrigatória adicional: vínculo OS↔venda existe? Registrar
     achado (impacta relatório de OS futuro; NÃO implementar OS aqui).
3. Visão Geral: KPIs e resumo por dados reais; estados vazio/carregando/erro
   explícitos; remover badge Preview e no-ops da seção.
4. Relatórios: vendas por período e por forma de pagamento, cancelamentos/
   devoluções, recebimentos/pagamentos, títulos em aberto, resumo de caixa —
   tabelas server-rendered simples; sem export novo aqui (export = GOAL 008).
5. Seções não realificadas permanecem com banner do GOAL 002.
6. Atualizar MOCKS_TRACKING.md no mesmo commit.

SEGURANÇA
- Todo reader recebe scope já validado; nenhum reader aceita storeId solto.
- Nenhum dado de outra loja em nenhuma resposta (testes cross-store).

TESTES (Vitest)
- Cross-store por reader: scope da loja A jamais retorna linhas da loja B
  (massa de teste com duas lojas).
- Agregação com massa controlada: venda cancelada excluída; parcialmente
  devolvida líquida correta; devolução de venda de mês anterior conta no mês da
  devolução; títulos nos dois cortes; fronteira de competência (venda 23:59
  São Paulo do último dia pertence ao mês).
- Paginação de vendasLista estável.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/dashboard/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Em loja de teste: números da Visão Geral reconciliam com as telas de origem
  (vendas, financeiro, caixa) para a mesma competência.
- Loja recém-criada: estados vazios corretos, sem erro.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador
git add app/dashboard/contador/page.tsx
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): readers read-only e visao geral com dados reais (GOAL 006)"
git push -u origin goal/contador-006-dados-reais

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos. 3. Achados das 3 investigações (desconto, forma de
pagamento, vínculo OS↔venda) com evidência de arquivo/campo. 4. Seções
realificadas × seções ainda preview. 5. Testes cross-store e de agregação com
resultados. 6. Divergências numéricas encontradas na reconciliação manual.
7. Confirmação: nenhuma escrita em banco, diff restrito, sem push em main.
```

---

## COMANDO 7/19

```
GOAL: CONTADOR-HUB-FECHAMENTO-READONLY-007

Usar: Claude Code com Claude Fable 5 (Sonnet 4.6 aceitável)
Modo: lib derivada + uma seção de UI
Base esperada: origin/main com GOAL 006 mergeado

OBJETIVO
Substituir o checklist fictício da seção Fechamento por checklist DERIVADO de
sinais reais, com nao_disponivel como estado de primeira classe. Botão "Fechar"
permanece desabilitado com explicação (snapshot chega no GOAL 012).

CONTEXTO
A auditoria apontou esta seção como a mais enganosa do preview (checklist e
status inventados). §9 do masterplan define os sinais deriváveis hoje:
vendas do mês presentes, caixa sem sessão aberta além da fronteira, títulos
vencidos não tratados, divergências de caixa acima de limiar, fiscal
nao_disponivel, itens manuais desabilitados com rótulo.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-007 -b goal/contador-007-fechamento-ro origin/main
cd C:\Projetos\omni-gestao-contador-007

ARQUIVOS PERMITIDOS
- lib/contador/checklist.ts (novo)
- lib/contador/__tests__/checklist.test.ts (novo)
- components/dashboard/contador/** (somente a seção Fechamento)
- app/dashboard/contador/page.tsx (passar DTO do checklist)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- prisma/**, app/api/**, readers existentes (consumir, não alterar; se um reader
  precisar de campo novo, PARAR e reportar), portal legado.

PASSOS
1. lib/contador/checklist.ts: montarChecklist(scope, periodo) consumindo os
   readers do GOAL 006; cada item tipado
   { id, titulo, estado: "ok" | "atencao" | "pendente" | "nao_disponivel",
     detalhe, fonte }.
   Sinais mínimos: vendas registradas no mês; caixa: nenhuma sessão aberta
   cruzando a fronteira; títulos vencidos em aberto (limiar: qualquer um →
   atencao); divergência de caixa acima de limiar configurável em constante;
   fiscal → nao_disponivel (constante explicando flag futura);
   documentos/conferência do contador → nao_disponivel nesta fase.
2. UI: lista de checklist com estados visuais distintos; nao_disponivel com
   tooltip do porquê; botão "Fechar competência" desabilitado com texto
   "disponível na fase de snapshot (GOAL 012)".
3. Remover da seção qualquer status/percentual inventado remanescente.
4. Atualizar MOCKS_TRACKING.md (Fechamento: derivado read-only).

SEGURANÇA
- Sem escrita; sem persistir estado de checklist em lugar nenhum.

TESTES (Vitest)
- Cada sinal com massa que o dispara e massa que não dispara.
- Fonte ausente → nao_disponivel (nunca "ok" silencioso).
- Limiar de divergência respeitado nos dois lados da fronteira.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador components/dashboard/contador app/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Trocar competência muda o checklist coerentemente; loja vazia mostra
  pendências/nao_disponivel plausíveis, não "tudo ok".

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador/checklist.ts
git add lib/contador/__tests__/checklist.test.ts
git add components/dashboard/contador
git add app/dashboard/contador/page.tsx
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): checklist de fechamento derivado read-only (GOAL 007)"
git push -u origin goal/contador-007-fechamento-ro

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos. 3. Sinais implementados e limiares. 4. Testes e
resultados. 5. Confirmação: nenhum estado persistido, diff restrito, sem push
em main.
```

---

## COMANDO 8/19

```
GOAL: CONTADOR-HUB-PACOTE-EXPORT-MVP-008

Usar: Claude Code com Claude Fable 5
Modo: geração server-side de artefato + endpoint interno
Base esperada: origin/main com GOAL 006 mergeado

OBJETIVO
Pacote do Contador MVP: geração sob demanda, server-side, de um ZIP com CSVs
por fonte, resumo, índice e manifest.json (schema omni.contador.pacote.manifest/v1
com sha256 por arquivo), baixado por endpoint interno autenticado. Sem storage,
sem versão persistida (isso é GOAL 012).

CONTEXTO
Feature âncora do módulo (§12 do masterplan). Estrutura de pastas:
00-LEIA-ME (indice.md, resumo.md), 01-VENDAS, 02-FINANCEIRO, 03-CAIXA,
04-DOCUMENTOS (vazio com aviso nesta fase), 05-XML (ausente/aviso até GOAL 018),
manifest.json na raiz. O manifesto declara: schema, competencia, storeId,
geradoEm, geradoPor, fontes com filtros e contagens, arquivos
[{ caminho, bytes, sha256, fonte }], pendencias, naoDisponiveis, avisos.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-008 -b goal/contador-008-pacote-mvp origin/main
cd C:\Projetos\omni-gestao-contador-008
# Verificar se já existe util de ZIP no repo antes de adicionar dependência:
git grep -n "archiver\|jszip\|zip" -- package.json lib

ARQUIVOS PERMITIDOS
- lib/contador/pacote/** (novos: builder.ts, manifest.ts, csv.ts, index.ts)
- lib/contador/__tests__/pacote*.test.ts (novos)
- app/api/contador/pacote/route.ts (novo — namespace do contador, NÃO em /api/ops)
- components/dashboard/contador/** (somente a seção Pacote do Contador)
- app/dashboard/contador/page.tsx (se necessário para a seção)
- docs/status/MOCKS_TRACKING.md
- package.json + lockfile SOMENTE se dependência de ZIP for indispensável
  (preferir archiver ou similar consolidado; justificar no relatório)

ARQUIVOS PROIBIDOS
- prisma/**, storage/upload de qualquer tipo, portal legado, /api/ops/**.

PASSOS
1. lib/contador/pacote/csv.ts: geração de CSV com escape correto (RFC 4180),
   separador vírgula, UTF-8 com BOM (compatibilidade Excel pt-BR), cabeçalhos
   estáveis documentados por fonte.
2. lib/contador/pacote/manifest.ts: tipos do manifesto v1 + builder + sha256
   (crypto nativo) por arquivo.
3. lib/contador/pacote/builder.ts: gerarPacote(scope, competencia) → consome os
   readers do GOAL 006, monta arquivos em memória/stream, calcula hashes,
   produz manifest.json e resumo.md (totais por fonte + pendências do checklist
   do GOAL 007) e indice.md; retorna stream ZIP.
   Competência vazia → pacote VÁLIDO com CSVs de cabeçalho e avisos no manifesto.
4. app/api/contador/pacote/route.ts (GET ?c=AAAA-MM):
   requireContadorScope() interno; valida competência; responde ZIP em streaming
   com Content-Disposition pacote-contador-{storeId}-{AAAA-MM}.zip;
   log estruturado de geração e download (evento, storeId, userId, competencia,
   bytes, duração). Erro de geração → 500 com log, sem stack ao cliente.
5. UI da seção Pacote: botão real "Gerar e baixar pacote (MVP)", estados de
   progresso/erro, texto de escopo ("sem documentos e sem XML nesta fase;
   pacote não fica arquivado — arquivamento chega com o fechamento").
   Remover mocks/no-ops restantes da seção.
6. Atualizar MOCKS_TRACKING.md.

SEGURANÇA
- Endpoint recusa cross-store (403) e sem sessão (401) — mesmos testes do
  padrão GOAL 004.
- Nenhum caminho de arquivo do servidor exposto; nomes de arquivo no ZIP
  saneados; sem URL pública.

TESTES (Vitest)
- Manifesto: sha256 declarado confere com o conteúdo real de cada arquivo;
  contagens do manifesto = linhas dos CSVs.
- CSV: campos com vírgula/aspas/quebra de linha escapados; BOM presente.
- Competência vazia → ZIP válido + avisos.
- ACL do endpoint: 401 sem sessão; 403 cross-store; 200 na própria loja.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Gerar pacote de competência real; abrir ZIP; conferir contagens contra as
  telas de origem; abrir CSV no Excel/LibreOffice sem quebra de acentuação;
  validar manifest.json manualmente contra dois arquivos.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador/pacote
git add lib/contador/__tests__
git add app/api/contador/pacote/route.ts
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
# se dependência adicionada: git add package.json package-lock.json (justificar)
git commit -m "feat(contador): pacote do contador MVP com manifesto e download interno (GOAL 008)"
git push -u origin goal/contador-008-pacote-mvp

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Arquivos. 3. Dependência de ZIP adicionada? Qual e por quê
(ou util existente reutilizado). 4. Estrutura final do ZIP gerado em teste.
5. Testes e resultados. 6. Tempo/tamanho de geração observados em loja de teste.
7. Confirmação: nada persistido, diff restrito, sem push em main.
```

---

## COMANDO 9/19

```
GOAL: CONTADOR-HUB-SCHEMA-NUCLEO-009
⚠️ MIGRATION 1 — NÃO INICIAR SEM GATE G2 (ADRs 001, 003, 004, 005, 006 aprovadas
por Rafael, registradas como Accepted em CONTADOR_HUB_ADRS_PROPOSTOS_001.md)

Usar: Claude Code com Claude Fable 5
Modo: schema aditivo + serviço mínimo. Sem UI.
Base esperada: origin/main com GOALs 001–008 mergeados + G2 aprovado

OBJETIVO
Criar o núcleo persistente do domínio: ContadorCompetencia, ContadorDocumento,
ContadorPacote, ContadorPacoteItem, ContadorComentario, ContadorEvento, em UMA
migration 100% aditiva, com serviço mínimo getOrCreateCompetencia.

CONTEXTO
Auditoria confirmou: NENHUM model Contador* existe no schema. Padrões a espelhar:
AuditoriaFinanceira (append-only), FinancialAttachment (referência de arquivo),
FechamentoFinanceiro (snapshot JSON + versão). Models existentes NÃO são tocados.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; schema é recurso compartilhado — coordenar a janela
  da migration com Rafael antes do push.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-009 -b goal/contador-009-schema-nucleo origin/main
cd C:\Projetos\omni-gestao-contador-009
# Confirmar inexistência prévia:
git grep -n "ContadorCompetencia\|ContadorDocumento\|ContadorEvento" -- prisma

ARQUIVOS PERMITIDOS
- prisma/schema.prisma (SOMENTE blocos novos ao final do arquivo)
- prisma/migrations/<timestamp>_contador_hub_nucleo/** (gerada)
- lib/contador/db/competencia.ts (novo, serviço mínimo)
- lib/contador/__tests__/db-competencia.test.ts (novo)

ARQUIVOS PROIBIDOS
- Qualquer linha existente de prisma/schema.prisma (nenhum model/enum/campo
  existente alterado, renomeado ou removido). UI, rotas, readers.

PASSOS
1. Adicionar ao FINAL do schema (nomes de campo em conformidade com o padrão do
   repo — verificar convenção camelCase/snake_case e mapeamentos @@map usados):

   enum ContadorCompetenciaStatus { aberta enviada com_pendencia fechada }
   enum ContadorItemStatus { pendente enviado conferido resolvido }
   enum ContadorDocumentoCategoria { fiscal financeiro folha juridico outro }

   model ContadorCompetencia:
     id, storeId (FK Store), ano Int, mes Int,
     status ContadorCompetenciaStatus @default(aberta),
     versao Int @default(1), snapshot Json?, snapshotHash String?,
     fechadaEm DateTime?, fechadaPorId String?, reabertaEm DateTime?,
     criadaEm/atualizadaEm; @@unique([storeId, ano, mes]);
     índice [storeId, status].

   model ContadorDocumento:
     id, competenciaId (FK), storeId, categoria ContadorDocumentoCategoria,
     titulo, nomeArquivo, mime, bytes Int, sha256 String,
     storageRef String (caminho namespaced, NUNCA URL pública),
     status ContadorItemStatus @default(pendente), vencimento DateTime?,
     enviadoPorTipo String (interno|externo), enviadoPorId String,
     versaoDeId String? (auto-relação), excluidoEm DateTime?,
     excluidoMotivo String?, criadoEm/atualizadoEm;
     índices [competenciaId, categoria], [storeId, status], [sha256].

   model ContadorPacote:
     id, competenciaId (FK), versao Int, manifestoHash String,
     storageRef String, bytes Int, geradoPorTipo/geradoPorId, geradoEm;
     @@unique([competenciaId, versao]).

   model ContadorPacoteItem:
     id, pacoteId (FK), caminho String, bytes Int, sha256 String, fonte String;
     índice [pacoteId].

   model ContadorComentario:
     id, competenciaId (FK), documentoId String?, autorTipo String,
     autorId String, visibilidade String (interna|compartilhada),
     texto String, criadoEm; índice [competenciaId, criadoEm].

   model ContadorEvento (APPEND-ONLY):
     id, competenciaId String?, storeId String, tipo String,
     atorTipo String, atorId String, payload Json?, criadoEm;
     índices [storeId, criadoEm], [competenciaId, criadoEm], [tipo].
     Comentário no schema: nunca editar/deletar linhas deste model.

2. npx prisma format
3. npx prisma validate
4. npx prisma migrate dev --name contador_hub_nucleo
5. Abrir o SQL gerado e CONFERIR: somente CREATE TABLE/TYPE/INDEX e FKs novas;
   nenhum ALTER/DROP em objeto pré-existente. Colar o SQL no relatório.
6. lib/contador/db/competencia.ts: getOrCreateCompetencia(storeId, {ano, mes})
   idempotente (upsert pela unique), registrando ContadorEvento
   "competencia_criada" apenas na criação.

SEGURANÇA
- Migration aditiva; rollback = drop das tabelas novas (documentar no relatório).
- Nenhum backfill; nenhuma escrita em tabelas existentes.

TESTES (Vitest, banco de dev)
- Unicidade (storeId, ano, mes): segunda criação cai no caminho get.
- Unicidade (competenciaId, versao) de pacote.
- getOrCreateCompetencia concorrente não duplica nem lança.
- Evento criado uma única vez na criação.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Rafael revisa o SQL da migration ANTES do push (colar no chat/relatório).
- prisma migrate reset em banco de dev descartável aplica limpo.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add prisma/schema.prisma
git add prisma/migrations
git add lib/contador/db/competencia.ts
git add lib/contador/__tests__/db-competencia.test.ts
git commit -m "feat(contador): schema nucleo do dominio contador — migration aditiva (GOAL 009)"
git push -u origin goal/contador-009-schema-nucleo

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash + confirmação do G2 (data da aprovação das ADRs). 2. SQL completo
da migration. 3. Prova de aditividade (nenhum ALTER/DROP em objeto existente).
4. Convenções de nomenclatura seguidas. 5. Testes e resultados. 6. Plano de
rollback. 7. Confirmação: nenhum model existente tocado, diff restrito, sem
push em main.
```

---

## COMANDO 10/19

```
GOAL: CONTADOR-HUB-DOCUMENTOS-REAL-010

Usar: Claude Code com Claude Fable 5
Modo: primeiro fluxo de escrita do domínio + storage
Base esperada: origin/main com GOAL 009 mergeado (migration 1 aplicada)

OBJETIVO
Realificar a seção Documentos: upload, listagem, download auditado, substituição
versionada e soft-delete de ContadorDocumento, com storage namespaced e hash.

CONTEXTO
ADR-003 (aprovada no G2): documento próprio do domínio + provider de storage
EXISTENTE. FinancialAttachment não é tocado.

PASSO 0 — AUDITORIA DE STORAGE (OBRIGATÓRIA, ANTES DE QUALQUER CÓDIGO)
git grep -n "S3\|supabase.storage\|uploadthing\|blob\|createSignedUrl\|putObject" -- lib app package.json
Identificar o provider real usado pelo repo (ex.: onde FinancialAttachment.fileUrl
nasce). Registrar: provider, bucket/pasta, ACL, se suporta acesso privado +
download por stream/URL assinada curta.
SE NÃO EXISTIR provider utilizável com acesso privado: PARAR AQUI, reportar
opções (com prós/contras/custo) e aguardar aprovação de Rafael. Não instalar
nada por conta própria.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-010 -b goal/contador-010-documentos origin/main
cd C:\Projetos\omni-gestao-contador-010

ARQUIVOS PERMITIDOS
- lib/contador/documentos/** (novos: service.ts, storage.ts adapter, validacao.ts)
- lib/contador/__tests__/documentos*.test.ts
- app/api/contador/documentos/** (novas rotas: upload, download por id, delete)
- components/dashboard/contador/** (somente seção Documentos: tabela real,
  filtros, drawer de detalhe, upload)
- app/dashboard/contador/page.tsx (se necessário)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- prisma/** (schema já existe), FinancialAttachment e qualquer código do
  Financeiro, portal legado, /api/ops/**.

PASSOS
1. validacao.ts: allowlist de MIME (pdf, xml, csv, xlsx, png, jpg, ofx, txt,
   zip), tamanho máximo por arquivo em constante (proposta: 25 MB — confirmar
   com Rafael no relatório), saneamento de nome.
2. storage.ts: adapter fino sobre o provider identificado no Passo 0; path
   contador/{storeId}/{aaaa-mm}/{documentoId}/{nomeSaneado}; NUNCA persistir
   URL pública em storageRef; download via stream autenticado ou URL assinada
   de vida curta gerada on-demand.
3. service.ts: criarDocumento (upload → sha256 → storage → registro → evento
   documento_enviado), substituir (novo registro com versaoDeId, evento),
   softDelete (excluidoEm + motivo obrigatório + evento; blob permanece —
   política de descarte é GOAL 019), listar por competência/categoria/status.
4. Rotas /api/contador/documentos: POST upload (multipart, requireContadorScope
   interno), GET lista, GET /:id/download (stream + evento documento_baixado),
   DELETE /:id (motivo no corpo). 401/403 padrão GOAL 004.
5. UI Documentos: tabela real (categoria, título, status, vencimento, versão),
   filtros funcionais, upload com progresso e erros de validação legíveis,
   drawer com metadados + hash + histórico de versões, ação excluir com motivo.
   Remover mock/no-ops da seção; badge some.
6. MOCKS_TRACKING.md atualizado.

SEGURANÇA
- MIME validado por conteúdo (magic bytes) além da extensão, quando viável.
- Cross-store: upload/lista/download/delete testados com 403.
- Nenhum caminho absoluto do servidor ou URL permanente exposto.

TESTES (Vitest)
- Upload válido cria registro + evento; hash confere com bytes.
- MIME fora da allowlist → 415; acima do limite → 413.
- Substituição cria nova linha ligada por versaoDeId; original intacto.
- Soft delete não remove blob; documento some da listagem padrão.
- Download gera evento com atorId; cross-store 403.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Ciclo completo: anexar → baixar → substituir → excluir com motivo; drawer
  mostra a cadeia de versões; eventos visíveis no banco.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador/documentos
git add lib/contador/__tests__
git add app/api/contador/documentos
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): documentos reais com storage namespaced e auditoria (GOAL 010)"
git push -u origin goal/contador-010-documentos

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Resultado do Passo 0 (provider, ACL, decisão). 3. Arquivos.
4. Limites adotados (MIME/tamanho) para confirmação. 5. Testes e resultados.
6. Confirmação: FinancialAttachment intocado, nenhuma URL pública persistida,
diff restrito, sem push em main.
```

---

## COMANDO 11/19

```
GOAL: CONTADOR-HUB-STATUS-COMENTARIOS-011

Usar: Claude Code com Claude Fable 5
Modo: máquina de estados + colaboração + timeline
Base esperada: origin/main com GOAL 010 mergeado

OBJETIVO
Persistir a máquina de status de documentos/itens (pendente→enviado→conferido→
resolvido; rejeição volta a pendente com comentário obrigatório; vencido =
flag derivada), comentários com visibilidade interna/compartilhada e timeline
real projetada de ContadorEvento + comentários.

CONTEXTO
ADR-005 aprovada no G2. Papéis nesta fase (portal externo ainda não existe):
atorTipo interno com papéis do ERP; transição "conferido" reservada a papel
financeiro/admin (matriz em lib/contador/status.ts, documentada).

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-011 -b goal/contador-011-status origin/main
cd C:\Projetos\omni-gestao-contador-011

ARQUIVOS PERMITIDOS
- lib/contador/status.ts (novo: matriz de transição + permissões + aplicar)
- lib/contador/comentarios.ts (novo)
- lib/contador/timeline.ts (novo: projeção eventos+comentários)
- lib/contador/__tests__/{status,comentarios,timeline}*.test.ts
- app/api/contador/{status,comentarios}/** (novas rotas ou server actions —
  seguir o padrão dominante do repo)
- components/dashboard/contador/** (Timeline; controles de status nos
  Documentos; caixa de comentário)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- prisma/**, portal legado, /api/ops/**, readers (consumir apenas).

PASSOS
1. status.ts: TRANSICOES: pendente→enviado (autor do item ou financeiro);
   enviado→conferido (financeiro/admin); conferido→resolvido (financeiro/admin);
   enviado→pendente e conferido→pendente = REJEIÇÃO (exige comentário; grava
   comentário + evento juntos); qualquer outra combinação → erro tipado.
   aplicarTransicao(scope, alvo, novoStatus, comentario?) valida matriz +
   permissão, atualiza status, grava ContadorEvento status_alterado
   { de, para, alvoTipo, alvoId, motivo? }. vencido nunca é gravado: derivar de
   vencimento < hoje && status != resolvido.
2. comentarios.ts: criar(scope, { competenciaId, documentoId?, visibilidade,
   texto }) com evento comentario_criado; listar por competência/documento
   respeitando visibilidade (compartilhada preparada para o portal futuro;
   interna jamais sai do caminho interno).
3. timeline.ts: projetarTimeline(scope, competenciaId) → união ordenada de
   eventos relevantes + comentários visíveis, tipada para a UI.
4. UI: Timeline real substitui a conversa mock; controles de status no drawer
   de Documentos conforme permissão do papel logado; rejeição abre modal
   exigindo motivo; badges Preview removidos das partes realificadas.
5. MOCKS_TRACKING.md atualizado.

SEGURANÇA
- Nenhuma transição sem verificação de papel no servidor.
- Eventos jamais editados/apagados; timeline é projeção somente-leitura.

TESTES (Vitest)
- Matriz completa: todas as transições permitidas passam; TODAS as demais
  combinações falham com erro tipado (teste exaustivo por par).
- Rejeição sem comentário → recusada.
- Papel sem permissão → 403 e nenhum evento gravado.
- vencido derivado nos dois lados da fronteira de vencimento.
- Comentário interno não aparece em consulta com visibilidade compartilhada.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Ciclo completo de um documento (enviar→conferir→resolver, e um caminho com
  rejeição) com timeline coerente e motivos visíveis.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador
git add app/api/contador
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): maquina de status, comentarios e timeline reais (GOAL 011)"
git push -u origin goal/contador-011-status

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Matriz de transição final (tabela). 3. Mapeamento papel→ação
adotado. 4. Testes e resultados (incluindo o exaustivo da matriz).
5. Confirmação: eventos imutáveis, diff restrito, sem push em main.
```

---

## COMANDO 12/19

```
GOAL: CONTADOR-HUB-FECHAMENTO-SNAPSHOT-012

Usar: Claude Code com Claude Fable 5
Modo: governança de competência — fechar/reabrir com snapshot e pacote versionado
Base esperada: origin/main com GOALs 008 e 011 mergeados

OBJETIVO
Tornar real o ciclo de fechamento: fechar gera snapshot JSON (via readers) +
pacote materializado versionado em storage; competência fechada congela
documentos; reabrir exige motivo, incrementa versão e audita; alterações
operacionais pós-fechamento geram evento alteracao_pos_fechamento.

CONTEXTO
ADR-001 (híbrido vivo/snapshot) e ADR-004 (pacote persistido no fechamento)
aprovadas no G2. Builder de pacote existe (GOAL 008); storage adapter existe
(GOAL 010); checklist existe (GOAL 007).

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-012 -b goal/contador-012-fechamento origin/main
cd C:\Projetos\omni-gestao-contador-012

ARQUIVOS PERMITIDOS
- lib/contador/fechamento/** (novos: fechar.ts, reabrir.ts, snapshot.ts)
- lib/contador/pacote/persist.ts (novo: materializar ZIP no storage +
  ContadorPacote/PacoteItem)
- lib/contador/__tests__/fechamento*.test.ts
- app/api/contador/fechamento/** (rotas/actions de fechar e reabrir)
- app/api/contador/pacote/route.ts (passa a servir também versões persistidas)
- lib/contador/documentos/service.ts (SOMENTE adicionar guarda de competência
  fechada nas mutações)
- components/dashboard/contador/** (seção Fechamento: botão real, modal de
  confirmação com pendências, lista de versões; seção Pacote: histórico de
  versões e diff por manifesto)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- prisma/**, readers (consumir), portal legado, /api/ops/**.

PASSOS
1. snapshot.ts: montarSnapshot(scope, competencia) → JSON de TOTAIS e contagens
   por fonte (não linhas), + resultado do checklist + referências (contagem de
   documentos por categoria/status). Calcular snapshotHash (sha256 do JSON
   canônico ordenado).
2. fechar.ts: pré-condições — status aberta|com_pendencia|enviada; permissão
   elevada (admin/financeiro); modal já confirmou pendências em aberto
   (lista do checklist vai no payload do evento). Transação:
   snapshot + hash gravados em ContadorCompetencia; status=fechada; fechadaEm/
   fechadaPorId; gerar pacote via builder e persistir (persist.ts) como versão
   N = max(versao)+1 com manifestoHash; evento competencia_fechada
   { versao, pendenciasAssumidas }.
3. Congelamento: mutações de documento (upload/substituir/excluir/status) em
   competência fechada → 409 com mensagem clara. Comentários PERMANECEM
   permitidos (registrar decisão no relatório).
4. reabrir.ts: permissão elevada + motivo obrigatório; status volta a aberta;
   versao += 1; reabertaEm; snapshot anterior PRESERVADO (histórico via
   eventos/pacotes); evento competencia_reaberta { motivo, novaVersao }.
5. alteracao_pos_fechamento: no fechamento, gravar no snapshot os totais-chave;
   expor util verificarDivergenciaPosFechamento(scope, competencia) que
   readers/checklist chamam ao exibir competência fechada — divergência entre
   vivo e snapshot → evento único por detecção (dedupe por hash de diff) +
   aviso na UI ("dados operacionais mudaram após o fechamento — considere
   reabrir").
6. UI: botão Fechar habilita conforme pré-condições; modal lista pendências e
   exige confirmação textual; competência fechada mostra selo "oficial v{N}" e
   bloqueia ações; histórico de versões de pacote com download por versão e
   diff simples entre manifestos (arquivos adicionados/removidos/alterados por
   hash); Reabrir com modal de motivo.
7. MOCKS_TRACKING.md: Fechamento e Pacote = reais.

SEGURANÇA
- Fechar/reabrir somente permissão elevada + evento; snapshot imutável após
  gravado (nenhum caminho de update).
- Download de versão persistida: mesmo ACL + evento pacote_baixado { versao }.

TESTES (Vitest)
- Fechar: snapshot gravado, hash confere, pacote v1 persistido com itens =
  manifesto.
- Mutação de documento em fechada → 409.
- Reabrir sem motivo → recusado; com motivo → versao incrementa, snapshot
  antigo intacto, evento correto.
- Refechar → pacote v2; diff de manifestos detecta arquivo alterado.
- Divergência pós-fechamento detectada com massa alterada; evento com dedupe.
- Permissão insuficiente → 403 sem efeito.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Ciclo completo: fechar → tentar alterar (bloqueado) → alterar dado operacional
  na origem → ver aviso de divergência → reabrir com motivo → refechar → duas
  versões de pacote baixáveis com manifestos distintos.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador
git add app/api/contador
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): fechamento com snapshot, congelamento e pacote versionado (GOAL 012)"
git push -u origin goal/contador-012-fechamento

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Formato final do snapshot (chaves). 3. Regras de congelamento
adotadas (incl. comentários permitidos). 4. Mecânica de divergência
pós-fechamento. 5. Testes e resultados. 6. Confirmação: snapshot imutável,
diff restrito, sem push em main.
```

---

## COMANDO 13/19

```
GOAL: CONTADOR-HUB-PORTAL-EXTERNO-AUDIT-013
(documental — gate G3 depende deste GOAL)

Usar: Claude Code com Claude Fable 5
Modo: auditoria read-only + especificação. ZERO código.
Base esperada: origin/main com GOALs 003 e 004 mergeados

OBJETIVO
Auditar o portal legado pós-hardening e especificar o portal externo v2, para
decisão de Rafael (G3): rota final, modelo de sessão, escopo funcional, plano
de convivência e retirada do legado.

CONTEXTO
Regra do masterplan: /contador e /login-contador não podem ser substituídos,
redirecionados ou removidos sem auditoria específica + autorização. ADRs 002 e
008 estão Proposed e serão decididas com este material.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-013 -b goal/contador-013-portal-audit origin/main
cd C:\Projetos\omni-gestao-contador-013

ARQUIVOS PERMITIDOS
- docs/contador/PORTAL_EXTERNO_AUDIT_013.md (novo)
- docs/contador/PORTAL_EXTERNO_V2_SPEC_013.md (novo)

ARQUIVOS PROIBIDOS
- Absolutamente qualquer arquivo de código, rota, schema ou config.

PASSOS
1. Auditoria do legado pós-GOALs 003/004:
   - Comportamento real de /contador sem sessão NextAuth (degradação de
     hidratação confirmada no relatório do GOAL 004): o que ainda funciona,
     o que quebrou, mensagens exibidas.
   - Fluxo de auth endurecido: flag, rate limit, cookie — estado atual.
   - Dependências vivas: OperationsProvider, LojaAtivaProvider, aggregates —
     mapa de imports com git grep.
   - Uso real: existe telemetria/logs de acesso ao portal? Se não houver,
     registrar ausência (insumo para decidir prazo de retirada).
2. Especificação do v2 (base: masterplan §13 e matriz de permissões §14):
   - Opções de rota com prós/contras: (a) /portal/contador novo caminho;
     (b) reutilizar /contador após retirada. Recomendar uma.
   - Modelo de sessão: cookie próprio assinado curto/rotativo, tokenVersion
     (ADR-008), isolamento total de NextAuth.
   - Escopo funcional do MVP v2: lista de competências por loja autorizada;
     documentos (lista + download + upload conforme papel); pacotes (download
     + confirmar recebimento); comentários compartilhados; marcar conferido.
     FORA do MVP: qualquer visão operacional além dos relatórios do pacote.
   - Wireframe textual das 4 telas (login, seleção de loja/competência,
     competência, documento).
   - Plano de convivência: legado atrás de CONTADOR_LEGACY_PORTAL; critérios
     objetivos para desligar (v2 estável + X semanas + zero acessos legado);
     comunicação ao contador.
3. Registrar perguntas de decisão para Rafael (rota, prazo do legado, e-mail
   automático vs link copiável, papel padrão do convite).

TESTES / TYPESCRIPT / ESLINT / BUILD: não aplicáveis.

VALIDAÇÃO MANUAL
- Rafael lê os dois documentos e registra decisões (G3) — ADRs 002/008 →
  Accepted (ou emendadas) no arquivo de ADRs, no branch do GOAL 014.

ENTREGA
git status --short
git diff --name-only   # somente os 2 docs; extras: não tocar, reportar
git add docs/contador/PORTAL_EXTERNO_AUDIT_013.md
git add docs/contador/PORTAL_EXTERNO_V2_SPEC_013.md
git commit -m "docs(contador): auditoria do portal legado e especificacao do portal v2 (GOAL 013)"
git push -u origin goal/contador-013-portal-audit

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Estado real do legado pós-hardening (resumo). 3. Recomendação
de rota e sessão. 4. Perguntas abertas para G3. 5. Confirmação: zero código
tocado, sem push em main.
```

---

## COMANDO 14/19

```
GOAL: CONTADOR-HUB-IDENTIDADE-CONVITE-014
⚠️ MIGRATION 2 — NÃO INICIAR SEM GATE G3 (decisões do GOAL 013 registradas;
ADRs 002 e 008 Accepted)

Usar: Claude Code com Claude Fable 5
Modo: autenticação externa — risco alto, revisão dupla
Base esperada: origin/main com GOALs 009 e 013 mergeados + G3 aprovado

OBJETIVO
Identidade externa dedicada: ContadorUsuario, ContadorConvite, ContadorAcesso
(migration aditiva 2), fluxo convite→aceite→login→revogação, sessão externa
própria e página mínima autenticada.

CONTEXTO
ADR-008 aprovada: convite por link copiável (MVP), token hasheado com expiração,
senha com hash forte, cookie assinado curto/rotativo, revogação via
tokenVersion, rate limit, eventos. NUNCA reutilizar PIN/cookie legado ou
NextAuth interno.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; schema compartilhado — coordenar janela da
  migration com Rafael antes do push.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-014 -b goal/contador-014-identidade origin/main
cd C:\Projetos\omni-gestao-contador-014
# Verificar util de hash de senha existente (bcrypt/argon2) antes de escolher:
git grep -n "bcrypt\|argon2\|scrypt\|hash" -- lib package.json | head -30

ARQUIVOS PERMITIDOS
- prisma/schema.prisma (SOMENTE blocos novos ao final)
- prisma/migrations/<timestamp>_contador_identidade/**
- lib/contador/auth-externa/** (novos: usuarios.ts, convites.ts, sessao.ts,
  rate-limit reuso do GOAL 003)
- lib/contador/__tests__/auth-externa*.test.ts
- app/api/contador-externo/** (novas rotas: convite [admin], aceite, login,
  logout, sessao)
- Telas mínimas do fluxo externo (caminho conforme rota decidida no G3 —
  ex.: app/portal/contador/(auth)/**)
- components/dashboard/contador/** (SOMENTE seção Permissões/Acessos: gerar
  convite, listar acessos, revogar)
- .env.example (CONTADOR_EXTERNO_SESSION_SECRET)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- NextAuth e qualquer config de auth interna; portal legado; models existentes
  do schema; /api/ops/**.

PASSOS
1. Schema (final do arquivo, convenções do repo):
   model ContadorUsuario: id, email @unique, nome, senhaHash, status
     (ativo|suspenso), tokenVersion Int @default(1), criadoEm/atualizadoEm,
     ultimoLoginEm DateTime?.
   model ContadorConvite: id, email, storeId, papel (leitura|conferencia),
     tokenHash @unique, expiraEm, usadoEm DateTime?, revogadoEm DateTime?,
     criadoPorId, criadoEm; índice [email, storeId].
   model ContadorAcesso: id, usuarioId (FK), storeId (FK), papel,
     concedidoPorId, concedidoEm, revogadoEm DateTime?, revogadoPorId String?;
     @@unique([usuarioId, storeId]); índice [storeId].
2. npx prisma format && npx prisma validate &&
   npx prisma migrate dev --name contador_identidade
   Conferir SQL 100% aditivo; colar no relatório.
3. convites.ts: gerar (admin interno com permissão elevada): token
   crypto.randomBytes(32) → URL única; SALVAR APENAS sha256(token);
   expiração 72h; uso único; revogação; evento convite_criado/revogado.
   Link exibido UMA vez para copiar (MVP sem e-mail — decisão G3).
4. Aceite: página pública com token → valida hash/expiração/uso → formulário
   nome+senha (política mínima: 10+ caracteres; medidor simples) → cria
   ContadorUsuario (ou vincula existente pelo mesmo e-mail) + ContadorAcesso +
   marca convite usado + eventos. Hash de senha: reutilizar util do repo se
   houver; senão argon2id ou bcrypt cost≥12 (justificar escolha).
5. sessao.ts: login (email+senha) → verifica hash + status → cookie próprio
   (nome distinto do interno e do legado) assinado HMAC com
   { usuarioId, tokenVersion, exp ≤ 12h, iat }; rotação a cada request
   autenticado com >50% da vida consumida; logout limpa; revogação de acesso
   ou suspensão → tokenVersion++ derruba TODAS as sessões do usuário.
   Rate limit login: 5/15min por e-mail+IP (reusar util do GOAL 003).
6. Página mínima autenticada: lista lojas do escopo (ContadorAcesso ativo) —
   só para provar o fluxo; portal completo é GOAL 015.
7. Seção Permissões (interna): gerar convite (loja + papel + e-mail), lista de
   convites pendentes/expirados com revogar, lista de acessos ativos com
   revogar (motivo opcional). Eventos em tudo.
8. requireContadorScope(): adicionar o caminho externo — sessão externa válida
   + ContadorAcesso ativo para a loja → { tipo: "externo", usuarioId, storeId,
   papel }.
9. MOCKS_TRACKING.md atualizado (Permissões: real).

SEGURANÇA
- Token de convite nunca persistido em claro nem logado; URL de aceite não vai
  para logs de acesso com token (usar POST ou fragmento — documentar escolha).
- Enumeração de e-mail: login e aceite respondem genérico.
- Cookies: httpOnly, secure em produção, sameSite=lax, path restrito ao portal.

TESTES (Vitest)
- Convite: expira; uso único; revogado não aceita; hash confere.
- Senha: política aplicada; hash forte verificável.
- Login: errado 401 genérico; 6ª tentativa 429; certo → cookie válido.
- Sessão adulterada/expirada → 401. tokenVersion++ derruba sessão ativa.
- Acesso: usuário com loja A não passa no scope da loja B (403).
- Cookie interno/legado NÃO autentica rotas externas e vice-versa.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador-externo components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Ciclo completo: gerar convite → aceitar em janela anônima → login → ver lojas
  → revogar acesso no ERP → sessão cai imediatamente.
- Rafael revisa SQL da migration ANTES do push.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add prisma/schema.prisma
git add prisma/migrations
git add lib/contador
git add app/api/contador-externo
# adicionar caminho das telas externas decidido no G3, um a um
git add components/dashboard/contador
git add .env.example
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): identidade externa por convite com sessao dedicada (GOAL 014)"
git push -u origin goal/contador-014-identidade

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash + confirmação G3. 2. SQL da migration + prova de aditividade.
3. Algoritmo de hash de senha adotado e por quê. 4. Mecânica de sessão/rotação/
revogação. 5. Testes e resultados. 6. Confirmação: legado e NextAuth intocados,
diff restrito, sem push em main.
```

---

## COMANDO 15/19

```
GOAL: CONTADOR-HUB-PORTAL-EXTERNO-READONLY-015

Usar: Claude Code com Claude Fable 5
Modo: superfície externa — risco alto
Base esperada: origin/main com GOALs 012 e 014 mergeados

OBJETIVO
Portal externo v2 funcional atrás de CONTADOR_PORTAL_V2: competências das lojas
autorizadas, documentos (download auditado; upload se papel permitir), pacotes
(download por versão + confirmar recebimento), comentários compartilhados e
marcar conferido — em layout/sessão totalmente isolados do ERP.

CONTEXTO
Rota e escopo definidos no G3 (usar a decisão registrada; exemplos abaixo
assumem app/portal/contador — ajustar se a decisão foi outra). Regra absoluta:
ZERO providers do ERP (OperationsProvider, LojaAtivaProvider etc.) em qualquer
arquivo do portal.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-015 -b goal/contador-015-portal-v2 origin/main
cd C:\Projetos\omni-gestao-contador-015

ARQUIVOS PERMITIDOS
- app/portal/contador/** (ou rota decidida no G3): layout próprio, páginas
  lojas/competências/competência/documentos/pacotes
- lib/contador/portal/** (novos: consultas específicas do portal sobre os
  readers/serviços existentes; confirmação de recebimento)
- lib/contador/__tests__/portal*.test.ts
- app/api/contador-externo/** (rotas de dados do portal, se o padrão do repo
  for API; ou server actions no próprio segmento)
- .env.example (CONTADOR_PORTAL_V2)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- Qualquer import de lib/operations-store.tsx, lib/loja-ativa.tsx ou providers
  do dashboard; componentes do ERP interno; portal legado; prisma/**; /api/ops/**.

PASSOS
1. Flag CONTADOR_PORTAL_V2: off → segmento inteiro responde página estática
   "em breve" (build-safe). Default: off.
2. Layout do portal: identidade visual mínima própria, header com lojas
   autorizadas (troca explícita), sessão do GOAL 014, logout. Nenhum menu do ERP.
3. Páginas:
   - /lojas: lista de acessos ativos.
   - /[loja]/competencias: lista com status (aberta/enviada/com_pendencia/
     fechada + selo oficial vN), navegável.
   - /[loja]/[competencia]: resumo (do snapshot quando fechada; vivo quando
     aberta, com rótulo), checklist read-only, timeline compartilhada,
     documentos (tabela + download; upload SOMENTE se papel=conferencia e a
     decisão G3 permitir — caso contrário ocultar), pacotes (versões +
     download + botão "Confirmar recebimento" da versão), caixa de comentário
     (visibilidade compartilhada fixa), ação "Marcar conferido" por documento
     conforme papel.
4. Confirmação de recebimento: registro via evento pacote_recebimento_confirmado
   { pacoteId, versao } (sem tabela nova; consulta via timeline/eventos) —
   idempotente por usuário+versão.
5. Toda leitura/ação passa por requireContadorScope() caminho externo; papel
   leitura não vê ações de escrita.
6. Auditoria: acesso a competência, download de documento/pacote, conferido,
   comentário, confirmação — todos geram evento com atorTipo=externo.
7. MOCKS_TRACKING.md atualizado (portal v2: real, atrás de flag).

SEGURANÇA
- Teste automatizado de import: nenhum arquivo do segmento do portal importa
  os providers proibidos (teste com grep programático no próprio Vitest).
- Cross-store em TODAS as rotas/ações do portal.
- Usuário revogado no meio da sessão: próxima request cai (tokenVersion).

TESTES (Vitest)
- Escopo: usuário com lojas A,B navega A e B; loja C → 403 em página e em ação.
- Papel leitura: ações de escrita ausentes na UI e bloqueadas no servidor.
- Confirmar recebimento idempotente; evento único por usuário+versão.
- Download de pacote/documento gera evento com atorTipo externo.
- Flag off → segmento inacessível.
- Teste de imports proibidos passa.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint app/portal lib/contador app/api/contador-externo
BUILD: npm run build

VALIDAÇÃO MANUAL
- Contador de teste com 2 lojas opera o ciclo: entrar → escolher loja →
  competência fechada → baixar pacote v2 → confirmar → comentar → marcar
  documento conferido → trocar de loja → bloqueado numa terceira.
- Legado segue intocado e funcional em paralelo.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add app/portal
git add lib/contador
git add app/api/contador-externo
git add .env.example
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): portal externo v2 read-only isolado atras de flag (GOAL 015)"
git push -u origin goal/contador-015-portal-v2

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Rota adotada (conforme G3). 3. Mapa de páginas/ações por papel.
4. Prova de isolamento (teste de imports). 5. Testes e resultados.
6. Confirmação: legado intocado, zero providers do ERP, diff restrito, sem push
em main.
```

---

## COMANDO 16/19

```
GOAL: CONTADOR-HUB-OBRIGACOES-GUIAS-016
⚠️ MIGRATION 3 — schema aditivo (sem gate novo; G2 cobre o padrão, mas
coordenar a janela da migration com Rafael antes do push)

Usar: Claude Code com Claude Fable 5
Modo: agenda manual do domínio
Base esperada: origin/main com GOALs 010 e 011 mergeados

OBJETIVO
Obrigações e guias 100% manuais/informadas: ContadorObrigacao,
ContadorObrigacaoTemplate, ContadorGuia (migration aditiva 3), CRUD com status
padrão, vencido derivado, templates instanciados explicitamente por competência,
guia com PDF/comprovante via documentos. Zero cálculo fiscal.

CONTEXTO
Masterplan §11: o sistema NUNCA infere obrigação legal, valor de tributo ou
vencimento oficial — tudo é informado pelo responsável (interno ou contador
com papel de conferência), com rótulo permanente "informado pelo responsável".
A estimativaImposto() do legado jamais alimenta este domínio.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-016 -b goal/contador-016-obrigacoes origin/main
cd C:\Projetos\omni-gestao-contador-016

ARQUIVOS PERMITIDOS
- prisma/schema.prisma (SOMENTE blocos novos ao final)
- prisma/migrations/<timestamp>_contador_agenda/**
- lib/contador/agenda/** (novos: obrigacoes.ts, templates.ts, guias.ts)
- lib/contador/__tests__/agenda*.test.ts
- app/api/contador/agenda/** (rotas/actions)
- components/dashboard/contador/** (seções Obrigações e Guias)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- Models existentes; lib/contador-aggregates.ts (estimativa legada);
  portal legado; /api/ops/**.

PASSOS
1. Schema (final do arquivo, convenções do repo):
   model ContadorObrigacaoTemplate: id, storeId, titulo, categoria
     ContadorDocumentoCategoria, diaVencimento Int? (1–28), recorrencia
     (mensal|nenhuma), ativo Boolean @default(true), criadoPorId, criadoEm.
   model ContadorObrigacao: id, competenciaId (FK), templateId String?,
     titulo, categoria, vencimento DateTime?, status ContadorItemStatus
     @default(pendente), responsavel String?, observacao String?,
     criadoPorTipo/criadoPorId, criadoEm/atualizadoEm;
     índices [competenciaId, status], [vencimento].
   model ContadorGuia: id, competenciaId (FK), obrigacaoId String?,
     titulo, valorCentavos Int, vencimento DateTime,
     documentoGuiaId String? (FK ContadorDocumento),
     pagaEm DateTime?, comprovanteDocumentoId String?,
     informadoPorTipo/informadoPorId, criadoEm/atualizadoEm;
     índices [competenciaId], [vencimento].
2. npx prisma format && npx prisma validate &&
   npx prisma migrate dev --name contador_agenda
   Conferir SQL aditivo; colar no relatório.
3. templates.ts: CRUD de templates (permissão financeiro/admin);
   instanciarTemplates(scope, competencia): cria obrigações da competência a
   partir dos templates ativos SOMENTE por ação explícita do usuário (botão
   "Gerar deste mês"), idempotente por (templateId, competenciaId) — sem cron,
   sem automatismo. Vencimento = diaVencimento no mês da competência
   (dia inexistente → último dia).
4. obrigacoes.ts: CRUD manual; status via máquina do GOAL 011 (mesma matriz);
   vencido SEMPRE derivado (vencimento < hoje && status != resolvido) — nunca
   coluna. Eventos obrigacao_criada/atualizada.
5. guias.ts: registrar guia exige titulo+valor+vencimento informados (inválida
   sem eles); anexar PDF da guia e comprovante via serviço de documentos do
   GOAL 010 (categoria fiscal/financeiro); marcarPaga(pagaEm, comprovante
   opcional mas recomendado — aviso). Eventos guia_informada/guia_paga.
6. UI Obrigações: lista por competência com filtros status/categoria, criação
   manual, botão de instanciar templates, gestão de templates (drawer), selo
   vencido derivado, rótulo permanente "informado pelo responsável".
   UI Guias: lista com valor/vencimento/status de pagamento, registrar guia,
   anexar PDF, marcar paga com comprovante; mesmos rótulos. Remover mocks
   restantes das duas seções; badges somem.
7. Checklist (GOAL 007): adicionar sinal derivado "guias informadas vencendo/
   vencidas" consumindo este domínio (alterar lib/contador/checklist.ts é
   PERMITIDO neste passo, somente para o novo sinal).
8. MOCKS_TRACKING.md atualizado.

SEGURANÇA
- Escrita restrita a papéis internos financeiro/admin e, quando decidido no G3,
  contador externo papel conferência (respeitar matriz §14).
- Nenhum valor calculado: qualquer campo monetário nasce de input explícito.

TESTES (Vitest)
- Instanciação idempotente; dia 31 em mês de 30 → último dia; template inativo
  não instancia.
- Guia sem valor/vencimento → inválida. vencido derivado nos dois lados.
- Status reusa a matriz do GOAL 011 (transições proibidas falham).
- Cross-store em todas as operações.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Criar template DAS dia 20 → gerar do mês → registrar guia com PDF → marcar
  paga com comprovante → ver timeline e checklist refletirem.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add prisma/schema.prisma
git add prisma/migrations
git add lib/contador
git add app/api/contador
git add components/dashboard/contador
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): obrigacoes, templates e guias manuais com vencido derivado (GOAL 016)"
git push -u origin goal/contador-016-obrigacoes

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. SQL da migration + prova de aditividade. 3. Regras de
instanciação e derivação adotadas. 4. Testes e resultados. 5. Confirmação:
zero cálculo fiscal, estimativa legada intocada, diff restrito, sem push em main.
```

---

## COMANDO 17/19

```
GOAL: CONTADOR-HUB-OMNI-AGENT-INTEGRATION-017

Usar: Claude Code com Claude Fable 5
Modo: camada de notificação sobre eventos — sem autonomia externa
Base esperada: origin/main com GOALs 012 e 016 mergeados

OBJETIVO
Lembretes e alertas derivados de ContadorEvento + agenda, com rascunho de
mensagem e envio SEMPRE confirmado por humano, respeitando o gate de políticas
do Omni Core.

CONTEXTO
Casos do masterplan §17: documento pendente perto do fechamento; guia informada
vencendo/vencida; competência aberta além do dia X; pacote gerado com
pendências no manifesto; alteracao_pos_fechamento. Princípio Omni: agente
propõe, humano confirma; tudo auditado.

PASSO 0 — DESCOBERTA (OBRIGATÓRIA)
Verificar o que já existe de infraestrutura Omni/notificação no repo:
git grep -n "omni\|notificac\|telegram\|webhook" -- lib app package.json | head -40
Se NÃO existir canal de saída (ex.: integração Telegram/e-mail) pronto para
reuso, implementar SOMENTE: geração de alertas internos (central de avisos na
UI do HUB) + contrato de payload para canal futuro, e reportar. NÃO criar
integração externa nova sem aprovação.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe (inclusive a frente Omni Core); não bloquear,
  não tocar no que for do Omni Core além de consumir contrato existente.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-017 -b goal/contador-017-omni-agent origin/main
cd C:\Projetos\omni-gestao-contador-017

ARQUIVOS PERMITIDOS
- lib/contador/notificacoes/** (novos: regras.ts, avaliar.ts, rascunhos.ts)
- lib/contador/__tests__/notificacoes*.test.ts
- app/api/contador/notificacoes/** (listar avisos, marcar lido, confirmar envio
  quando houver canal)
- components/dashboard/contador/** (central de avisos na seção adequada;
  configurações mínimas de limiares na seção Configurações)
- docs/contador/OMNI_AGENT_CONTRATO_017.md (novo: contrato de payload/evento
  para o Omni Core consumir)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- Código do Omni Core em si; prisma/** (se precisar de tabela de preferências,
  PARAR e propor); qualquer envio externo sem canal aprovado; portal legado.

PASSOS
1. regras.ts: regras puras (evento/estado → alerta tipado) com limiares em
   constantes configuráveis: docPendenteDiasAntesFechamento, guiaVenceEmDias,
   competenciaAbertaAposDia, pacoteComPendencias (bool),
   alteracaoPosFechamento (imediato).
2. avaliar.ts: avaliação sob demanda (ao carregar o HUB) + endpoint idempotente
   para avaliação agendada futura; dedupe por (regra, alvo, janela) via
   ContadorEvento tipo alerta_emitido (payload com chave de dedupe) — sem
   tabela nova.
3. rascunhos.ts: gerar texto de mensagem pt-BR por alerta (placeholders de
   loja/competência/prazo), marcado como RASCUNHO; nenhuma saída automática.
4. UI: central de avisos (lista de alertas ativos por competência, marcar como
   tratado → evento), botão "copiar rascunho"; se canal existir (Passo 0),
   botão "enviar" com modal de confirmação humana obrigatória + evento
   mensagem_enviada { canal, confirmadaPor }.
5. Contrato para Omni Core (doc): formato do evento de alerta, chave de dedupe,
   política (proposta→confirmação), campos de atribuição/custo — alinhado às
   cinco decisões invioláveis do Omni (policy gate único, audit imutável).
6. MOCKS_TRACKING.md atualizado.

SEGURANÇA
- Nenhum efeito externo sem confirmação humana explícita registrada.
- Rascunhos não incluem dados sensíveis além do necessário (sem valores de
  guia no texto por padrão — configurável).

TESTES (Vitest)
- Cada regra dispara com massa que a satisfaz e silencia sem ela.
- Dedupe: reavaliação na mesma janela não duplica alerta.
- Marcar tratado suprime reemissão da mesma chave.
- Sem canal: nenhuma tentativa de envio externo em nenhum caminho.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Provocar cada alerta em loja de teste e ver a central refletir; tratar e
  confirmar silêncio; conferir eventos.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador
git add app/api/contador
git add components/dashboard/contador
git add docs/contador/OMNI_AGENT_CONTRATO_017.md
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): alertas e rascunhos com confirmacao humana para Omni Agent (GOAL 017)"
git push -u origin goal/contador-017-omni-agent

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Resultado do Passo 0 (canal existente?). 3. Regras e limiares
implementados. 4. Contrato Omni resumido. 5. Testes e resultados.
6. Confirmação: zero envio autônomo, diff restrito, sem push em main.
```

---

## COMANDO 18/19

```
GOAL: CONTADOR-HUB-FISCAL-INTEGRATION-018
PRÉ-CONDIÇÃO: ADR-007 Accepted + runtime fiscal ativo/validável em pelo menos
uma loja de homologação. Sem isso, NÃO iniciar.

Usar: Claude Code com Claude Fable 5
Modo: leitura fiscal desacoplada atrás de flag
Base esperada: origin/main com GOAL 012 mergeado + trilha fiscal disponível

OBJETIVO
fiscalReader read-only atrás de CONTADOR_FISCAL_READER (por loja): notas da
competência com status juridicamente entregável, sinais de rejeição/
cancelamento no checklist e XML autorizados na pasta 05-XML do pacote, com
hash no manifesto.

CONTEXTO
Fundação existe (NotaFiscal, eventos, logs) mas runtime é default-off. O
critério de "status entregável" tem nuance jurídica: DEFINIR EM CONJUNTO com a
trilha fiscal antes de codificar (Passo 0) e registrar na ADR-007.

PASSO 0 — ALINHAMENTO (OBRIGATÓRIO)
1. git grep -n "NotaFiscal\|autorizada\|protocolo" -- prisma lib app | head -40
   Mapear campos reais de status/protocolo/XML no schema fiscal.
2. Propor por escrito (no chat, antes de codificar) o predicado de
   "entregável" (ex.: status=autorizada com protocolo, excluindo cancelada/
   denegada/inutilizada — confirmar nomenclatura real) e obter OK de Rafael.

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe (inclusive trilha fiscal); consumir, jamais alterar
  o pipeline fiscal.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-018 -b goal/contador-018-fiscal origin/main
cd C:\Projetos\omni-gestao-contador-018

ARQUIVOS PERMITIDOS
- lib/contador/readers/fiscal.ts (novo)
- lib/contador/__tests__/fiscal*.test.ts
- lib/contador/checklist.ts (SOMENTE sinal fiscal: nao_disponivel → real
  quando flag on)
- lib/contador/pacote/builder.ts (SOMENTE inclusão da pasta 05-XML quando
  flag on)
- components/dashboard/contador/** (relatório fiscal simples na seção
  adequada)
- .env.example (CONTADOR_FISCAL_READER)
- docs/status/MOCKS_TRACKING.md

ARQUIVOS PROIBIDOS
- QUALQUER arquivo do pipeline fiscal (emissão, eventos, certificados);
  prisma/**; portal legado.

PASSOS
1. fiscal.ts: notasDaCompetencia(scope, periodo) com o predicado aprovado no
   Passo 0; retorno tipado { entregaveis[], rejeitadas[], canceladas[],
   contagens }; loja com flag off ou sem runtime → { disponivel: false }.
2. Checklist: sinal fiscal vira real com flag on (rejeições pendentes →
   atencao; runtime indisponível → nao_disponivel).
3. Pacote: com flag on, 05-XML recebe os XML AUTORIZADOS da competência
   (bytes originais do storage fiscal, sem transformação), cada um com sha256
   no manifesto; flag off → aviso no manifesto como hoje. Relatório fiscal
   CSV (chave, número, data, valor, status) em 01-VENDAS ou pasta própria
   05-XML/relacao.csv.
4. UI: contagens e lista simples de notas por status na competência, com selo
   "leitura fiscal (flag)"; nenhuma ação de emissão/correção aqui.
5. MOCKS_TRACKING.md atualizado.

SEGURANÇA
- Somente leitura; nenhum XML de rascunho/pendente/denegado no pacote.
- Flag por loja: default OFF; ligar exige env + (se existir) toggle da loja.

TESTES (Vitest)
- Predicado: cada status mapeado corretamente (massa com todos os status).
- Flag off / runtime ausente → nao_disponivel em checklist e aviso no
  manifesto; nenhuma pasta 05-XML.
- XML no ZIP byte-idêntico ao storage (hash confere no manifesto).
- Cross-store no reader.
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador components/dashboard/contador
BUILD: npm run build

VALIDAÇÃO MANUAL
- Loja de homologação com notas: pacote contém somente autorizadas; contagens
  batem com a trilha fiscal.

ENTREGA
git status --short
git diff --name-only   # somente allowlist; extras: não tocar, reportar
git add lib/contador
git add components/dashboard/contador
git add .env.example
git add docs/status/MOCKS_TRACKING.md
git commit -m "feat(contador): leitura fiscal read-only no checklist e pacote (GOAL 018)"
git push -u origin goal/contador-018-fiscal

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash + confirmação do Passo 0 (predicado aprovado). 2. Campos fiscais
reais mapeados. 3. Testes e resultados. 4. Confirmação: pipeline fiscal
intocado, flag default off, diff restrito, sem push em main.
```

---

## COMANDO 19/19

```
GOAL: CONTADOR-HUB-PRODUCTION-HARDENING-019
GATE G4: a retirada do portal legado (Passo 6) SÓ executa com autorização
explícita de Rafael registrada; sem G4, entregar os Passos 1–5 e parar.

Usar: Claude Code com Claude Fable 5
Modo: prontidão de produção
Base esperada: origin/main com GOAL 015 mergeado (idealmente 016–018 também)

OBJETIVO
Retenção e descarte por categoria, limites finais de upload, observabilidade
(métricas/alertas), revisão LGPD do pacote, teste de carga da geração e —
mediante G4 — retirada do portal legado.

CONTEXTO
Fecha os pontos do masterplan §19/§22 e as pendências deliberadamente adiadas
(descarte de blob do soft-delete do GOAL 010; minimização de PII nos CSVs
conforme decisão de Rafael em §27).

ISOLAMENTO (REGRA PERMANENTE)
- Trabalho paralelo existe; não bloquear, não tocar.
- Proibido: git reset/restore/stash/rebase/merge, git add ., git add -A, git commit -a.
- Nunca push para main.

PRÉ-FLIGHT
cd C:\Projetos\omni-gestao
git fetch origin
git status -sb
git rev-parse --short origin/main
git worktree add C:\Projetos\omni-gestao-contador-019 -b goal/contador-019-hardening origin/main
cd C:\Projetos\omni-gestao-contador-019

ARQUIVOS PERMITIDOS
- lib/contador/retencao/** (novo: política + job idempotente)
- lib/contador/observabilidade.ts (novo: métricas nomeadas)
- lib/contador/documentos/** e lib/contador/pacote/** (limites finais,
  instrumentação)
- app/api/contador/** (instrumentação; endpoint de execução do job de
  retenção protegido)
- docs/contador/OPERACAO_CONTADOR_019.md (novo: runbook)
- .env.example (variáveis de retenção/limites)
- docs/status/MOCKS_TRACKING.md
- SOMENTE COM G4: app/contador/**, app/login-contador/**,
  app/api/auth/contador/route.ts, proxy.ts (trecho contador),
  lib/contador-aggregates.ts (remoção/redirect conforme decisão)

ARQUIVOS PROIBIDOS
- prisma/** (retenção opera sobre dados, não sobre schema); /api/ops/**;
  qualquer frente paralela. Sem G4: TODOS os arquivos do legado acima.

PASSOS
1. Retenção: política por categoria em constantes (proposta a confirmar:
   fiscal/financeiro 5 anos+, folha 5 anos, jurídico 10, outro 2 — Rafael
   decide os números finais ANTES do merge); job idempotente que (a) descarta
   blobs de documentos soft-deletados há mais de X dias e (b) marca/expira
   documentos além da retenção SEM apagar registro/evento (dado some, trilha
   fica). Execução manual protegida (admin) nesta fase; agendamento é
   infraestrutura futura.
2. Limites finais: tamanho por categoria, quota por competência (constantes +
   .env.example), mensagens claras na UI.
3. Observabilidade: métricas nomeadas (contador_pacote_geracao_ms,
   contador_pacote_bytes, contador_upload_erros, contador_login_externo_falhas,
   contador_alertas_ativos) no padrão de logging/métrica existente no repo
   (verificar antes; se não houver, log estruturado padronizado); alertas
   documentados no runbook (limiares).
4. LGPD: aplicar a decisão de Rafael (§27) sobre PII nos CSVs do pacote
   (ex.: cliente anonimizado por padrão com toggle explícito); revisar campos
   de eventos por excesso de dado pessoal; documentar base legal por categoria
   no runbook.
5. Carga: script de teste (Vitest ou script dedicado em scripts/) gerando
   pacote de competência com volume sintético alto (ex.: 20k vendas) — medir
   tempo/memória; registrar SLA observado no runbook.
6. SOMENTE COM G4 REGISTRADO: executar a decisão do GOAL 013 para o legado
   (desligar flag por default, redirect ou remoção), atualizar proxy/rotas,
   comunicar no runbook. Sem G4: pular e reportar.
7. MOCKS_TRACKING.md: estado final do módulo.

SEGURANÇA
- Job de retenção: dry-run obrigatório antes do modo destrutivo; log de tudo
  que descartou (evento retencao_executada com contagens).
- Nenhum guard afrouxado; conferir que flags default seguem seguros
  (LEGACY on/off conforme G4, PORTAL_V2 conforme rollout, FISCAL off).

TESTES (Vitest)
- Retenção: massa com documentos dentro/fora da janela — só os corretos
  expiram; dry-run não altera nada; idempotência (2ª execução = zero ações).
- Limites/quota aplicados no upload.
- Métricas emitidas nos caminhos instrumentados.
- Se G4: rotas legadas respondem conforme decisão (redirect/410/estática) e
  NENHUMA outra rota foi afetada (smoke das rotas vizinhas).
TYPESCRIPT: npx tsc --noEmit
ESLINT: npx eslint lib/contador app/api/contador scripts
BUILD: npm run build

VALIDAÇÃO MANUAL
- Executar dry-run de retenção em base de teste e revisar relatório; carga
  medida; checklist de produção do runbook preenchido e assinado por Rafael.

ENTREGA
git status --short
git diff --name-only   # somente allowlist (respeitando G4); extras: reportar
git add lib/contador
git add app/api/contador
git add docs/contador/OPERACAO_CONTADOR_019.md
git add .env.example
git add docs/status/MOCKS_TRACKING.md
git add scripts
# SOMENTE COM G4: adicionar, um a um, os caminhos do legado alterados
git commit -m "chore(contador): hardening de producao, retencao e observabilidade (GOAL 019)"
git push -u origin goal/contador-019-hardening

RELATÓRIO FINAL OBRIGATÓRIO
1. Base/hash. 2. Políticas de retenção finais (confirmadas por Rafael).
3. Resultado do teste de carga (tempo/memória/SLA). 4. Decisões LGPD aplicadas.
5. G4 executado? O que mudou no legado. 6. Estado final das flags.
7. Confirmação: dry-run antes de descarte, diff restrito, sem push em main.
```

---

## Encerramento

Ordem de execução: respeitar o grafo de dependências do documento de GOALs
(001 → 002–005 paralelizáveis → 006 → 007/008 → G2 → 009 → 010 → 011 → 012 →
013/G3 → 014 → 015 → 016/017/018 conforme pré-condições → 019/G4). Cada comando
é autossuficiente: pode ser colado num chat novo do Claude Code sem contexto
adicional, junto com o trecho relevante do masterplan se desejado.
