# CONTADOR HUB — SEQUÊNCIA DE IMPLEMENTAÇÃO (GOALs)

| Campo | Valor |
|---|---|
| GOAL de origem | CONTADOR-HUB-FABLE5-MASTERPLAN-001 |
| Data | 2026-07-11 |
| Base factual | Auditoria sobre `origin/main = 1911415` |
| Documentos irmãos | MASTERPLAN, COMMANDS, ADRS (mesma série 001) |

---

## 1. Como usar

- Cada GOAL é executado por um agente isolado (Claude Code), em worktree própria, com commit por caminho e push apenas da branch do GOAL. Comandos completos em `CONTADOR_HUB_COMMANDS_001.md`.
- **Gates de aprovação sua (Rafael):** G1 após o GOAL 001 (delta da reconciliação pode alterar o plano); G2 antes do GOAL 009 (ADRs 001/003/004/005/006 aprovadas); G3 após o GOAL 013 (estratégia do portal e ADRs 002/008); G4 antes do GOAL 019 (retirada do legado).
- Nenhum GOAL toca `prisma/schema.prisma` exceto 009, 014 e 016 — e apenas de forma aditiva.
- O código atual vence este documento: se o GOAL 001 encontrar divergência relevante, o plano é revisado antes de seguir.

## 2. Mudanças em relação à sequência original (justificadas)

A sequência proposta no GOAL original tinha 15 itens. Este plano entrega **19**, com as seguintes alterações:

| Mudança | Justificativa |
|---|---|
| `HONESTY-AND-ROUTE-SAFETY-002` dividido em 002 (honestidade visual) + 003 (P0 auth externa) + 004 (P0 escopo de loja) | Misturar rótulos de UI com mudanças de segurança em endpoints compartilhados num só branch viola o princípio de GOAL pequeno e dificulta rollback. 004 toca arquivos de Operações e exige janela/coordenação próprias. |
| `COMPETENCIA-CONTRATOS` movido para **antes** de `DADOS-REAIS` (005 → 006) | Os readers dependem do contrato de período (timezone, intervalo UTC, regra de data por fonte) para filtrar corretamente. Construir readers antes do contrato geraria retrabalho. |
| `FECHAMENTO` dividido em read-only (007) e snapshot persistido (012) | O checklist derivado não precisa de schema e entrega valor cedo; snapshot/lock/versão dependem da migration núcleo e concentram o risco em um GOAL próprio. |
| `SCHEMA-OPERACIONAL-007` renomeado para `SCHEMA-NUCLEO-009` | Nome reflete o conteúdo (6 tabelas do núcleo) e a posição após o MVP de export, mantida do plano original. |
| `PORTAL-EXTERNO-READONLY` dividido em identidade/convite (014, migration 2) e portal UI (015) | Identidade externa é a peça mais sensível (auth, hash de senha, revogação); isolá-la permite revisão de segurança focada antes de qualquer tela externa. |
| Adicionado `FECHAMENTO-SNAPSHOT-012` antes do portal | O portal entrega pacotes persistidos; sem 012 não há o que o contador baixar/confirmar. |
| Mantidos no fim: Obrigações (016), Omni Agent (017), Fiscal (018), Hardening (019) | Mesma ordem relativa do original; Omni e Fiscal dependem de eventos/domínio prontos. |

## 3. Tabela-resumo

| # | GOAL | Objetivo em uma linha | Schema | Risco | Depende de |
|---|---|---|---|---|---|
| 001 | STATUS-RECONCILE | Reconciliar auditoria × código atual; atualizar MOCKS_TRACKING | não | baixo | — |
| 002 | HONESTY-ROUTE-SAFETY | Banners persistentes, CTAs no-op desabilitados/rotulados, rótulos honestos no legado | não | baixo | 001 |
| 003 | P0-AUTH-EXTERNA | PIN fail-closed, rate limit, cookie assinado curto, kill-switch do legado | não | baixo-médio | 001 |
| 004 | P0-STORE-SCOPE | `auth()` + `canAccessStore` em vendas-list e guard de OS | não | **alto** (arquivos compartilhados) | 001 |
| 005 | COMPETENCIA-CONTRATOS | Lib de competência: tipos, URL `?c=AAAA-MM`, período UTC, regra por fonte | não | baixo | 001 |
| 006 | DADOS-REAIS-READONLY | Readers com ACL alimentando Visão Geral e relatórios internos | não | médio | 004, 005 |
| 007 | FECHAMENTO-READONLY | Checklist 100% derivado com `nao_disponivel` honesto | não | baixo | 006 |
| 008 | PACOTE-EXPORT-MVP | ZIP sob demanda: CSVs + resumo + manifest + hashes; download interno | não | médio | 006 |
| 009 | SCHEMA-NUCLEO | Migration 1: Competencia, Documento, Pacote, PacoteItem, Comentario, Evento | **sim** | médio | 005 + **G2** |
| 010 | DOCUMENTOS-REAL | Upload/storage/download/soft-delete com auditoria; realifica seção Documentos | não | médio-alto | 009 |
| 011 | STATUS-COMENTARIOS | Máquina de status persistida, comentários, timeline real | não | médio | 009, 010 |
| 012 | FECHAMENTO-SNAPSHOT | Fechar/reabrir com snapshot, pacote materializado/versionado em storage | não | médio-alto | 008, 011 |
| 013 | PORTAL-EXTERNO-AUDIT | Auditoria dedicada do legado + decisão de rota/sessão do portal v2 (docs) | não | baixo | 003, 004 |
| 014 | IDENTIDADE-CONVITE | Migration 2: ContadorUsuario/Convite/Acesso; login externo; sessão dedicada | **sim** | alto | 009, 013 + **G3** |
| 015 | PORTAL-EXTERNO-READONLY | Portal isolado: competências, documentos, pacotes, confirmação, comentários | não | alto | 012, 014 |
| 016 | OBRIGACOES-GUIAS | Migration 3: Obrigacao/Template/Guia; agenda manual honesta | **sim** | médio | 011 |
| 017 | OMNI-AGENT-INTEGRATION | Lembretes/alertas sobre eventos, com permissões e confirmação humana | não | médio | 012, 016 |
| 018 | FISCAL-INTEGRATION | fiscalReader read-only atrás de flag; XML autorizado no pacote/checklist | não | médio | 012 + fiscal ativo |
| 019 | PRODUCTION-HARDENING | Retenção/LGPD, observabilidade, links temporários, retirada do legado (**G4**) | não | médio | 015 |

## 4. Grafo de dependências

```
001 ─┬─ 002
     ├─ 003 ─────────────┐
     ├─ 004 ──┐          ├─ 013 ── 014 ── 015 ── 019
     └─ 005 ──┴─ 006 ─┬─ 007         ▲       ▲
                      ├─ 008 ─────┐  │(G3)   │
                      └─(G2) 009 ─┼─ 010 ── 011 ── 012 ─┬─ 015
                                  │                     ├─ 017
                                  └─────────────────────┴─ 018
                            011 ── 016 ── 017
```

Paralelismo permitido: 002‖003‖004‖005 após 001; 007‖008 após 006; 013 pode correr em paralelo à Fase 2 (é documental). Nada da Fase 3 inicia sem G3.

---

## 5. Detalhamento por GOAL

### 001 — CONTADOR-HUB-STATUS-RECONCILE-001
- **Objetivo:** executar o pré-flight completo (fetch/log/grep), reconciliar a auditoria com a `origin/main` atual, registrar o delta e incluir o Contador HUB em `docs/status/MOCKS_TRACKING.md`.
- **Valor:** fecha a lacuna entre o plano (produzido sem acesso ao repo) e o código vivo; evita implementar sobre premissa vencida.
- **Dependências:** nenhuma. **Schema:** não. **Risco:** baixo (read-only + 2 docs).
- **Arquivos prováveis:** `docs/contador/CONTADOR_HUB_STATUS_RECONCILE_001.md` (novo), `docs/status/MOCKS_TRACKING.md` (atualização pontual). Valida também a presença dos 4 docs desta série.
- **Proibido:** qualquer código, schema, docs antigos além do tracking.
- **Testes:** n/a (documental). **Aceite manual:** delta lido e aprovado por você (**G1**).
- **Conclusão:** relatório de delta commitado na branch do GOAL; divergências classificadas (nenhuma | ajusta plano | bloqueia).

### 002 — CONTADOR-HUB-HONESTY-ROUTE-SAFETY-002
- **Objetivo:** tornar o preview inconfundível: banner persistente por seção, CTAs no-op desabilitados com rótulo (ou removidos), aviso no seletor de competência; no legado, rotular exportações ("agregado operacional — não é XML fiscal") e a alíquota como "estimativa manual".
- **Valor:** elimina o risco P1 de decisão baseada em dado fictício sem esperar backend.
- **Dependências:** 001. **Schema:** não. **Risco:** baixo (somente arquivos do contador).
- **Arquivos prováveis:** `contador-hub-preview.tsx`, `contador-preview-data.ts`, `app/dashboard/contador/page.tsx`, `area-contador-pro.tsx`, tracking.
- **Proibido:** rotas, proxy, APIs, schema, qualquer arquivo fora do módulo contador.
- **Testes:** TypeScript/ESLint; snapshot/teste de render dos banners se houver harness.
- **Aceite manual:** navegar pelas 11 áreas e confirmar que nenhum CTA aparenta efeito real.
- **Conclusão:** zero no-ops silenciosos; tracking atualizado.

### 003 — CONTADOR-HUB-P0-AUTH-EXTERNA-003
- **Objetivo:** endurecer `/api/auth/contador` sem mudar o fluxo: remover `DEFAULT_CONTADOR_PIN` (fail-closed em produção), comparação em tempo constante, rate limit por IP/janela, cookie opaco assinado (HMAC) com validade curta (≤12h), log estruturado de tentativa/sucesso/logout, e flag `CONTADOR_LEGACY_PORTAL` como kill-switch (default: comportamento atual, até sua decisão).
- **Valor:** neutraliza o P0 de autenticação global enquanto o portal v2 não existe.
- **Dependências:** 001. **Schema:** não. **Risco:** baixo-médio (superfície pequena, mas sensível).
- **Arquivos prováveis:** `app/api/auth/contador/route.ts`, `app/login-contador/page.tsx`, trecho contador de `proxy.ts` (diff mínimo), `lib/contador/auth/*` (novo), testes.
- **Proibido:** schema, endpoints de operações, qualquer outra frente.
- **Testes:** Vitest da rota (sem env → 503; PIN errado → 401; excedeu → 429 + Retry-After; certo → cookie assinado; cookie adulterado → rejeitado). TS/ESLint/build.
- **Aceite manual:** login/logout reais; rate limit observável; portal continua navegável com flag ligada.
- **Conclusão:** nenhum segredo default no código; nenhum PIN em log; cookie literal `1` extinto.

### 004 — CONTADOR-HUB-P0-STORE-SCOPE-004
- **Objetivo:** fechar o IDOR: `/api/ops/vendas-list` e o caminho legado de `/api/ops/ordens` passam a exigir `auth()` + `canAccessStore` (padrão `inventory`); o fallback "assinatura basta" deixa de autorizar loja arbitrária.
- **Valor:** elimina o P0 mais grave (leitura cross-store de vendas/clientes/pagamentos/OS).
- **Dependências:** 001. **Risco:** **alto** — arquivos compartilhados com Operações/PDV; consequência assumida: o portal legado sem sessão NextAuth perde hidratação remota (degrada para cache local). Exige sua ciência prévia e coordenação com frentes paralelas.
- **Arquivos prováveis:** `app/api/ops/vendas-list/route.ts`, `app/api/ops/ordens/route.ts`, `lib/ops-api-gate.ts`, testes novos. Diff mínimo; nada além do guard.
- **Proibido:** schema, UI, `lib/operations-store.tsx` (consumidores não mudam neste GOAL), demais rotas ops.
- **Testes (obrigatórios):** cross-store (sessão loja A pedindo loja B → 403; sem sessão → 401; header/query/cookie forjados ignorados como autorização); regressão dos consumidores internos (PDV/dashboard continuam lendo a própria loja).
- **Aceite manual:** dashboard e PDV funcionam; tentativa cross-store manual bloqueada; comportamento do legado documentado no relatório.
- **Conclusão:** nenhuma leitura operacional aceita `storeId` do cliente como autorização.

### 005 — CONTADOR-HUB-COMPETENCIA-CONTRATOS-005
- **Objetivo:** criar `lib/contador/competencia.ts`: tipos (`Competencia`, `PeriodoUtc`), `resolvePeriodo()` com `America/Sao_Paulo`, parse/format `?c=AAAA-MM`, navegação anterior/próxima, e a tabela canônica de regra-de-data-por-fonte (constante documentada). Conectar o seletor do preview à URL.
- **Valor:** competência determinística, compartilhável e testável — pré-requisito dos readers.
- **Dependências:** 001. **Schema:** não. **Risco:** baixo.
- **Arquivos prováveis:** `lib/contador/competencia.ts` + testes, `contador-hub-preview.tsx` (seletor→URL), página da rota.
- **Proibido:** schema, APIs, portal legado.
- **Testes:** unit de fronteira de mês/ano, parse inválido, intervalo semiaberto, round-trip URL.
- **Aceite manual:** trocar competência altera a URL; reload preserva estado.
- **Conclusão:** nenhum `useState` como fonte da competência.

### 006 — CONTADOR-HUB-DADOS-REAIS-READONLY-006
- **Objetivo:** implementar `lib/contador/readers/` (vendas, financeiro, caixa) sobre `requireContadorScope()` (caminho interno) e realificar Visão Geral (KPIs/resumo) + relatórios básicos (vendas por período/forma de pagamento, cancelamentos/devoluções, recebimentos/pagamentos, títulos abertos, caixa), com estados vazio/carregando/erro. Investigar: campo de desconto, vínculo OS↔venda, fonte de forma de pagamento (payload × movimentações) — registrar achados.
- **Valor:** primeira entrega de dado real na rota interna; substitui arrays por leitura autorizada.
- **Dependências:** 004 (padrão de guard), 005 (período). **Schema:** não. **Risco:** médio (interpretação de dados).
- **Arquivos prováveis:** `lib/contador/scope.ts`, `lib/contador/readers/*` + testes, componentes das seções realificadas, tracking.
- **Proibido:** schema; escrita em qualquer tabela; endpoints ops além de consumir via server-side.
- **Testes:** cross-store por reader; agregação com massa controlada (venda cancelada excluída, devolução redutora, títulos nos dois cortes).
- **Aceite manual:** números da Visão Geral reconciliáveis com as telas de origem para uma loja de teste.
- **Conclusão:** seções realificadas sem badge; demais seguem Preview.

### 007 — CONTADOR-HUB-FECHAMENTO-READONLY-007
- **Objetivo:** checklist derivado (§9 do masterplan): sinais reais via readers, itens manuais desabilitados com rótulo, fiscal como `nao_disponivel`; botão "Fechar" permanece desabilitado com explicação ("disponível após snapshot — fase 2").
- **Valor:** transforma a tela mais enganosa do preview em painel honesto e útil.
- **Dependências:** 006. **Schema:** não. **Risco:** baixo.
- **Arquivos prováveis:** `lib/contador/checklist.ts` + testes, seção Fechamento do componente.
- **Proibido:** persistir estado de checklist; schema.
- **Testes:** unit dos sinais (limiares, `nao_disponivel` quando fonte ausente).
- **Aceite manual:** checklist reage à competência selecionada.
- **Conclusão:** nenhum status manual fictício visível.

### 008 — CONTADOR-HUB-PACOTE-EXPORT-MVP-008
- **Objetivo:** geração server-side sob demanda do Pacote (estrutura e manifesto do §12): CSVs por fonte, `resumo.md`, `indice.md`, `manifest.json` com sha256/bytes/fonte por arquivo, ZIP em streaming, download por endpoint interno autenticado (mesmo RBAC do HUB), log estruturado de geração/download. Sem storage/versão persistidos.
- **Valor:** a feature âncora entrega valor imediato ao lojista.
- **Dependências:** 006. **Schema:** não. **Risco:** médio (dependência de ZIP; volume).
- **Arquivos prováveis:** `lib/contador/pacote/{builder,manifest,csv}.ts` + testes, `app/api/contador/pacote/route.ts` (interna), seção Pacote da UI. Se precisar adicionar dependência (ex.: `archiver`), listar no relatório.
- **Proibido:** storage, links públicos, portal legado, schema.
- **Testes:** manifesto íntegro (hash confere com arquivo), CSV escapado, competência vazia gera pacote válido com avisos, ACL do endpoint (cross-store → 403).
- **Aceite manual:** baixar pacote de uma competência real e conferir contagens com a origem.
- **Conclusão:** CTA "Gerar pacote" real na rota interna; aviso claro de escopo do MVP.

### 009 — CONTADOR-HUB-SCHEMA-NUCLEO-009  ⚠️ migration 1 · **gate G2**
- **Objetivo:** única migration aditiva com `ContadorCompetencia`, `ContadorDocumento`, `ContadorPacote`, `ContadorPacoteItem`, `ContadorComentario`, `ContadorEvento` (campos/índices conforme ADRs 003/004/005 aprovadas), enums correspondentes, e serviço mínimo `getOrCreateCompetencia`.
- **Valor:** habilita toda a Fase 2 com um único ponto de revisão de schema.
- **Dependências:** 005 conceitual; **ADRs aprovadas (G2)**. **Schema:** sim. **Risco:** médio.
- **Arquivos prováveis:** `prisma/schema.prisma` (blocos novos ao final), migration gerada, `lib/contador/db/*` mínimo, testes de unicidade.
- **Proibido:** alterar/renomear qualquer model existente; backfill; UI.
- **Testes:** `prisma validate`; migration aplicável em banco de dev; unicidade `(storeId, ano, mes)` e `(competenciaId, versao)`; SQL revisado como 100% aditivo.
- **Aceite manual:** revisão do SQL da migration por você antes do push.
- **Conclusão:** migration aditiva única, nomeada `contador_hub_nucleo`, sem tocar tabelas existentes.

### 010 — CONTADOR-HUB-DOCUMENTOS-REAL-010
- **Objetivo:** upload/download/listagem/soft-delete de `ContadorDocumento` com validação MIME/tamanho, sha256, storage namespaced (**auditar provider existente primeiro; se inexistente, PARAR e pedir aprovação**), eventos de auditoria, e realificação da seção Documentos (filtros/tabela/drawer sobre dados reais).
- **Valor:** primeiro fluxo de escrita do domínio; base para pacote v2 e portal.
- **Dependências:** 009. **Schema:** não (usa mig. 1). **Risco:** médio-alto (storage/segurança de arquivo).
- **Arquivos prováveis:** `lib/contador/documentos/*` + storage adapter, `app/api/contador/documentos/*`, seção Documentos, tracking.
- **Proibido:** URL pública persistida; schema; `FinancialAttachment`.
- **Testes:** ACL upload/download cross-store; MIME fora da allowlist rejeitado; hash confere; soft delete não remove blob sem política; evento gravado por download.
- **Aceite manual:** anexar, baixar, substituir (versão) e excluir com motivo; drawer mostra metadados reais.
- **Conclusão:** seção Documentos sem badge; zero no-ops nela.

### 011 — CONTADOR-HUB-STATUS-COMENTARIOS-011
- **Objetivo:** máquina de status persistida para documentos/itens (`pendente→enviado→conferido→resolvido`, `vencido` como flag), comentários (`ContadorComentario`, visibilidade interna/compartilhada), timeline real projetada de `ContadorEvento` + comentários; realifica Timeline e o fluxo de status nas seções já reais.
- **Valor:** dá semântica operacional ao domínio; substitui a conversa mock.
- **Dependências:** 009, 010. **Schema:** não. **Risco:** médio.
- **Arquivos prováveis:** `lib/contador/status.ts` (matriz de transição + permissões) + testes, actions/rotas de transição e comentário, seções Timeline/Documentos.
- **Proibido:** schema; transições sem verificação de papel; edição/deleção de eventos.
- **Testes:** matriz de transição completa (permitidas/negadas por papel), rejeição exige comentário, evento por transição.
- **Aceite manual:** ciclo completo de um documento com timeline coerente.
- **Conclusão:** nenhum status alterável sem permissão + evento.

### 012 — CONTADOR-HUB-FECHAMENTO-SNAPSHOT-012
- **Objetivo:** `fechar` (permissão elevada + confirmação + pendências assumidas) gera snapshot JSON via readers, materializa pacote v_n em storage (`ContadorPacote/Item`), congela documentos da competência; `reabrir` exige motivo, incrementa versão, registra evento; UI de versões e diff por manifesto.
- **Valor:** entrega a governança central da competência — o coração contábil do HUB.
- **Dependências:** 008 (builder), 011 (status). **Schema:** não. **Risco:** médio-alto.
- **Arquivos prováveis:** `lib/contador/fechamento/*`, `lib/contador/pacote/persist.ts`, seção Fechamento (botão real), testes.
- **Proibido:** editar snapshot após gravado; deletar versões; schema.
- **Testes:** fechar→snapshot íntegro (hash), documento imutável pós-fechamento (mutação → 409), reabrir versiona e audita, pacote regenerado = nova versão.
- **Aceite manual:** ciclo fechar→tentar alterar→reabrir→refechar com trilha completa.
- **Conclusão:** "Fechar competência" real, auditável e reversível com trilha.

### 013 — CONTADOR-HUB-PORTAL-EXTERNO-AUDIT-013  (documental · **gate G3**)
- **Objetivo:** auditoria dedicada de `/contador` + `/login-contador` pós-GOALs 003/004 (comportamento real, degradação, uso em produção) e especificação do portal v2: rota final, modelo de sessão, wireframe mínimo, plano de convivência/retirada do legado. Sem código.
- **Valor:** cumpre a regra "não substituir/redirecionar/remover sem auditoria específica e autorização" e destrava a Fase 3 com decisão informada.
- **Dependências:** 003, 004. **Schema:** não. **Risco:** baixo.
- **Arquivos prováveis:** `docs/contador/PORTAL_EXTERNO_AUDIT_013.md` (+ spec de UX/sessão).
- **Proibido:** qualquer alteração de rota/código.
- **Testes:** n/a. **Aceite manual:** sua decisão registrada (ADR-002/008 → Accepted ou revisadas).
- **Conclusão:** estratégia de rota/identidade aprovada por escrito.

### 014 — CONTADOR-HUB-IDENTIDADE-CONVITE-014  ⚠️ migration 2
- **Objetivo:** `ContadorUsuario` (email único, senhaHash, status, tokenVersion), `ContadorConvite` (token **hasheado**, expiração, revogação, criadoPor), `ContadorAcesso` (vínculo usuário↔loja com papel, concessão/revogação); fluxo: admin gera convite (link copiável no MVP) → aceite define senha → login externo → sessão dedicada (cookie próprio assinado, curto, rotativo; revogação via tokenVersion); rate limit; eventos de login/acesso; página mínima autenticada listando lojas do escopo.
- **Valor:** substitui o PIN global por identidade real — pré-condição absoluta do portal.
- **Dependências:** 009, 013 (**G3**). **Schema:** sim (aditiva). **Risco:** alto (autenticação).
- **Arquivos prováveis:** schema + migration `contador_identidade`, `lib/contador/auth-externa/*`, rotas de convite/aceite/login/logout, telas mínimas, admin de convites na seção Permissões, testes.
- **Proibido:** reutilizar cookie/PIN legado como base; tocar NextAuth interno; qualquer navegação do portal para o dashboard.
- **Testes:** convite expira/revoga; token só em hash; senha com hash forte (util existente se houver); brute force → 429; sessão adulterada rejeitada; revogação derruba sessão ativa; acesso a loja não vinculada → 403.
- **Aceite manual:** ciclo convite→aceite→login→revogação de ponta a ponta.
- **Conclusão:** contador autentica com identidade própria e escopo verificado no servidor.

### 015 — CONTADOR-HUB-PORTAL-EXTERNO-READONLY-015
- **Objetivo:** portal isolado (layout/sessão próprios, **zero providers do ERP**, atrás de `CONTADOR_PORTAL_V2`): lista de competências das lojas autorizadas, documentos com download auditado, pacotes com download + confirmação de recebimento, comentários e "marcar conferido" conforme matriz de permissões; auditoria de todo acesso.
- **Valor:** entrega o produto ao contador externo com segurança real.
- **Dependências:** 012, 014. **Schema:** não. **Risco:** alto (superfície externa).
- **Arquivos prováveis:** árvore do portal v2 (rota conforme G3), readers no caminho externo do `requireContadorScope()`, testes E2E de escopo.
- **Proibido:** qualquer import de providers do ERP; escrita além de confirmação/comentário/status permitidos; links públicos.
- **Testes:** cross-store em todas as rotas do portal; download sempre gera evento; usuário revogado perde tudo imediatamente.
- **Aceite manual:** contador de teste opera 2 lojas autorizadas e é bloqueado numa terceira.
- **Conclusão:** portal externo funcional e isolado; legado permanece intocado até G4.

### 016 — CONTADOR-HUB-OBRIGACOES-GUIAS-016  ⚠️ migration 3
- **Objetivo:** `ContadorObrigacao`, `ContadorObrigacaoTemplate`, `ContadorGuia` (§11 do masterplan); CRUD manual com status padrão de item, `vencido` derivado, instanciação explícita de templates por competência, guia com PDF/comprovante via documentos; realifica seções Obrigações e Guias com rótulo permanente "informado pelo responsável".
- **Valor:** agenda operacional honesta, sem inventar obrigação legal.
- **Dependências:** 011 (status), 010 (documentos). **Schema:** sim (aditiva). **Risco:** médio.
- **Arquivos prováveis:** schema + migration `contador_agenda`, `lib/contador/agenda/*`, seções Obrigações/Guias, testes.
- **Proibido:** qualquer cálculo de imposto/alíquota/vencimento oficial; seeds de obrigações "padrão Brasil".
- **Testes:** recorrência instancia corretamente; vencido é derivado (nunca gravado); guia sem valor/vencimento informado é inválida.
- **Aceite manual:** registrar guia com PDF, pagar com comprovante, ver na timeline.
- **Conclusão:** zero valores fiscais fictícios remanescentes no HUB.

### 017 — CONTADOR-HUB-OMNI-AGENT-INTEGRATION-017
- **Objetivo:** camada de notificação/lembrete consumindo `ContadorEvento` + agenda: documento pendente, fechamento próximo, guia informada vencendo, pacote incompleto (manifesto), `alteracao_pos_fechamento`; rascunho de mensagem ao contador com envio sempre confirmado por humano; tudo pelo gate de políticas com audit.
- **Valor:** proatividade segura sobre o domínio já auditável.
- **Dependências:** 012, 016. **Schema:** não (avaliar tabela de preferências de notificação; se precisar, PARAR e propor). **Risco:** médio.
- **Arquivos prováveis:** `lib/contador/notificacoes/*`, contratos de evento para o agente, configurações na seção própria.
- **Proibido:** ação autônoma com efeito externo sem confirmação; qualquer inferência fiscal.
- **Testes:** disparo por evento com permissão respeitada; silêncio fora do horário configurado.
- **Aceite manual:** um lembrete de ponta a ponta com trilha.
- **Conclusão:** nenhuma automação fora do gate/permissões.

### 018 — CONTADOR-HUB-FISCAL-INTEGRATION-018
- **Objetivo:** `fiscalReader` read-only atrás de `CONTADOR_FISCAL_READER`: notas por competência com status juridicamente entregável (critério definido com a trilha fiscal), sinais de rejeição/cancelamento no checklist, XML autorizado em `05-XML` do pacote com hash no manifesto.
- **Valor:** completa o pacote com o artefato mais pedido por escritórios, sem promessa falsa.
- **Dependências:** 012 + runtime fiscal ativo/validado. **Schema:** não. **Risco:** médio (status jurídico).
- **Arquivos prováveis:** `lib/contador/readers/fiscal.ts` + testes, checklist e builder do pacote.
- **Proibido:** escrita no pipeline fiscal; expor rascunho/pendente como entregável; ligar a flag por default.
- **Testes:** filtro de status; loja sem fiscal → `nao_disponivel`; XML no ZIP = hash do manifesto.
- **Aceite manual:** pacote de loja homologada contém apenas XML autorizados.
- **Conclusão:** seção fiscal honesta, ligada por flag e por loja.

### 019 — CONTADOR-HUB-PRODUCTION-HARDENING-019  (**gate G4**)
- **Objetivo:** retenção/descarte por categoria de documento, limites e validações finais de upload, links temporários quando aplicável, métricas/alertas do §22, revisão LGPD (minimização no pacote conforme sua decisão), carga de geração de pacote, e — mediante G4 — retirada/redirecionamento do portal legado.
- **Valor:** prontidão de produção e encerramento do legado com segurança.
- **Dependências:** 015. **Schema:** não. **Risco:** médio.
- **Arquivos prováveis:** jobs/config de retenção, observabilidade, docs de operação, remoção do legado (somente com G4).
- **Proibido:** remover legado sem G4; afrouxar qualquer guard.
- **Testes:** job de retenção em massa controlada; alertas disparam; carga de pacote dentro do SLA definido.
- **Aceite manual:** checklist de produção assinado por você.
- **Conclusão:** módulo operável, observável e sem superfícies legadas inseguras.

---

## 6. Critérios transversais (valem para todos os GOALs)

1. **Isolamento:** worktree própria por GOAL; proibido `git add .`, `git add -A`, `git commit -a`; stage por caminho; push somente da branch do GOAL; nunca push em main.
2. **Fronteira de arquivos:** cada GOAL só toca sua allowlist; qualquer arquivo estranho no diff → não tocar, reportar.
3. **Verificações:** TypeScript (`npx tsc --noEmit`), ESLint nos caminhos alterados, build quando houver rota/página nova, Vitest dos módulos tocados.
4. **Segurança:** todo reader/endpoint novo nasce com teste cross-store; todo download com evento; nenhum segredo/URL assinada em log.
5. **Honestidade:** realificou uma seção → remove o no-op, remove o badge, atualiza `MOCKS_TRACKING.md` no mesmo commit.
6. **Registro:** GOALs com decisão arquitetural atualizam o ADR correspondente (Proposed → Accepted) no mesmo branch, após sua aprovação.
7. **Parada obrigatória:** ambiguidade material (provider de storage inexistente, divergência com o plano, conflito com frente paralela) → parar e perguntar, nunca improvisar.
