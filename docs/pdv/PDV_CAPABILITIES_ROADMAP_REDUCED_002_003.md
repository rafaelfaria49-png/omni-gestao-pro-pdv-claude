# PDV Capabilities — Roadmap Enxuto (002-003)

> GOAL `PDV-SURFACES-NEXT-ROADMAP-RECONCILE-002-003` · documentação **read-only**.
> Poda técnica dos antigos GOALs 006–032 do Fable 5
> (`PDV_CAPABILITIES_IMPLEMENTATION_GOALS_001.md`, 27 GOALs) contra o código vivo
> em `9a9626d091dd738aa292e122c697170a77a984e4`. **Nenhum GOAL foi preservado
> apenas por constar no roadmap antigo.** Nenhuma funcionalidade implementada.

Fontes: `docs/pdv/PDV_CAPABILITIES_STATUS_RECONCILE_001.md` (GOAL 001),
`docs/pdv/PDV_SURFACES_NEXT_RECONCILE_002_003.md` (002-003, Partes A/B/C),
pacote Fable 5 fora do repo (masterplan + GOALs + ADRs).

## 1. PARTE D — Avaliação individual 006–032

Legenda: KEEP (mantém como está) · MERGE (funde no novo GOAL indicado) ·
ALREADY_DONE (já cumprido) · PARTIAL (parte cumprida, resto no novo GOAL) ·
DEFER (adiado, motivo) · DROP (eliminado, motivo).

| # | GOAL antigo | Objetivo original | Estado atual | Evidência | Classe | Novo GOAL / destino |
|---|---|---|---|---|---|---|
| 006 | motor/shell architecture | glossário + ADRs P-01–P-04 | taxonomia feita em 002-003; **nenhuma ADR-P existe** (`docs/decisions/` só tem fiscal/WhatsApp/etc.) | `docs/decisions/INDEX.md`; §3 doc 002-003 | MERGE | N4 (contrato formaliza) |
| 007 | PDV ID canonicalization | `lib/pdv/surface-ids.ts` aditivo | **não existe**; valores legados (`classic\|supermercado\|next`, `services\|lovable`) vigentes | `Test-Path lib/pdv/surface-ids.ts=False`; `lib/pdv-layout-storage.ts:9`; `lib/pdv-classic-layout.ts:15` | MERGE | N4 (pequeno, mesma fronteira contrato) |
| 008 | capability contract | `lib/capabilities/types.ts` + keys v1 | **não existe**; zero `FeatureKey`/`resolveCapability` em runtime | `git grep CapabilityRegistry = 0` (só `ai-orchestrator`) | MERGE | N4 |
| 009 | capability resolver | `resolveCapability()` puro + tabela-verdade | **não existe** | idem 008 | MERGE | N4 |
| 010 | entitlement plan map | `feature→planos` como dado + conta/tenant | **não existe**; `checkPlanAccess` ainda por `AdminUser.planName`; decisão comercial de Rafael pendente | `lib/plan-guard.ts`; P-04 GOAL 001 | DEFER | N7 (aguarda decisão comercial G5) |
| 011 | settings registry | `SettingsModuleRegistry`, migrar 14 seções sem mudança visual | **não existe**; `SECTION_COMPONENTS` hardcoded | `ConfiguracoesV3Page.tsx:31`; `pages/Index.tsx:19` | MERGE | N6 |
| 012 | PDV registry | `PdvRegistry` + switch pelo registry | **não existe**; `vendas-pdv.tsx:54-133` com if/else | `vendas-pdv.tsx:32` | MERGE | N4 |
| 013 | capabilities persistence | `printerConfig.capabilities` versionado + PUT validado | **não existe** (`capabilities`/`byFeature` = 0 hits); G2 agora cumprido (004) | `git grep printerConfig.capabilities = 0` | MERGE | N3 |
| 014 | legacy settings inventory | inventário exaustivo chaves legadas | **coberto pelo §4 do doc 002-003** (matriz chave×escopo×dono de todas as chaves PDV) | §4 `PDV_SURFACES_NEXT_RECONCILE_002_003.md` | ALREADY_DONE | — (destinos de migração em N3) |
| 015 | dual-read | precedência banco→migrado→legado→default | **não existe**; runtime lê local primeiro; só hidratação parcial (`vendas-pdv.tsx:105-112`); padrão `readStoreScopedString` existe p/ layout/modo | `vendas-pdv.tsx:105-112`; `lib/omnigestao-pdv-modo.ts:21` | MERGE | N3 |
| 016 | backfill | promoção única legado→banco | **não existe** (sem marca de promoção) | `git grep promot = 0` em pdv | MERGE | N3 |
| 017 | cutover | fim da leitura legada, server-first | **não existe** | idem 015 | MERGE | N3 |
| 018 | hub settings entry | engrenagem + 7º card no VendasHub | **não existe** (6 cards, sem engrenagem) | `VendasHub.tsx:29-80` | MERGE | N6 |
| 019 | settings aggregator | Central monta menu do registry + `blockedReason` | **não existe** (sem `requires`, sem registry) | idem 011 | MERGE | N6 |
| 020 | PDV settings UI | painel superfícies + toggles por loja/superfície | **não existe**; base (`PdvSection`, `VendasSection`, `v3PdvSectionCard`) existe sem capabilities | `PdvSection.tsx:43,306,972` | MERGE | N6 |
| 021 | nav/entitlement gates | `visible` + gate servidor por entitlement | **não existe**; navegação só por papel; depende de 010 (adiado) | `dashboard-nav-items.ts:103` | DEFER | N7 (com 010) |
| 022 | capability runtime pilot | Classic consome resolver + snapshot | **não existe** (sem resolver); defaults idênticos triviais hoje | idem 009 | MERGE | N4 |
| 023 | server guards | revalidação server-side, servidor vence | **não existe**; servidor confia no cliente (além do 005) | §6 doc 002-003 | MERGE | N1 (é integridade, não capability) |
| 024 | offline snapshot | snapshot + `capabilitiesVersion` em hold/fila | **não existe** (`capabilitiesVersion` = 0 hits; holds sem snapshot) | `lib/pdv-hold.ts:1-169` | MERGE | N4 |
| 025 | assistência integration | Assistência consome resolver | PDV funciona em produção; consumo do resolver impossível (não existe) | `pdv-assistencia-enterprise.tsx:903` | MERGE | N4 (rollout) |
| 026 | supermercado integration | idem + lastro DB layout | idem; guarda 005 re-testável aqui | `pdv-supermercado.tsx:180` | MERGE | N4 (rollout) |
| 027 | next reactivation | paridade mínima e reativação como superfície | **objetivo rejeitado pela decisão C** (§5 doc 002-003): 7×P0 + 5×P1; reativar como superfície independente tem pior custo/benefício | matriz §5 | DROP | partes aproveitáveis em N2; Next segue gated |
| 028 | all-surfaces parity | suíte matriz §12.5 × 4 superfícies | **não existe**; matriz precisa reescrita (Black=SHELL, Rápido=MODE) | — | KEEP | N5 (reescopo: 4 bordas + componentes absorvidos) |
| 029 | películas lookup | modal compartilhado + `pdv.filmLookup` | backend read-only real existe; modal/atablo/capability **não existem**; é feature nova, não integridade | `api/catalogo/peliculas/search/route.ts`; `buscador-peliculas.tsx:104` | DEFER | FUTURE (feature, pós-paridade) |
| 030 | accessory capabilities | `pdv.accessoryModelColor` + guard | caminho real nos 3 PDVs; **Completa perde `accessorySelection`** (`:634`), Next sem nada — perda de dado é integridade | `venda-completa-enterprise.tsx:634`; `PdvBlackEdition` 0 hits | PARTIAL | perda de dado → N1/N2; gating → FUTURE |
| 031 | quickservices/OS | `pdv.quickServices` fora da Assistência + `pdv.osLookup` | Assistência opera (`quickServices` `:1108`, `linkedOsId` Classic `:582`); expansão é feature nova | `pdv-assistencia-enterprise.tsx:1108` | DEFER | FUTURE (feature, pós-paridade) |
| 032 | scale safety audit | auditoria motor + charter trilha fracionada | 005 cumprido (hard-block); charter **não existe**; trilha Int→decimal é schema + hardware, decisão futura | `sale-quantity-contract.ts`; `schema.prisma:237,774,1507` (Int) | DEFER | FUTURE (G13: autoriza trilha, nunca recurso) |

### Contagens 006–032 (27 GOALs)

- KEEP: **1** (028).
- MERGE: **18** (006, 007, 008, 009, 011, 012, 013, 015, 016, 017, 018, 019, 020, 022, 023, 024, 025, 026).
- ALREADY_DONE: **1** (014).
- PARTIAL: **1** (030).
- DEFER: **5** (010, 021, 029, 031, 032).
- DROP: **1** (027).
- Mantidos como trabalho futuro idêntico: 1 · Eliminados/fundidos/adiados: 26.

Revisão pedida no comando, item a item: motor/shell (006→N4), IDs (007→N4),
contrato (008→N4), resolver (009→N4), plan-map (010→DEFER/N7), settings
registry (011→N6), PDV registry (012→N4), persistência (013→N3), migração
legada (014 DONE; 015/016/017→N3), settings UI (018/019/020→N6),
gates navegação/server/runtime (021→DEFER; 023→N1; 024→N4), snapshot offline
(024→N4), Assistência/Supermercado (025/026→N4 rollout), Next (027 DROP→N2),
paridade (028→N5), películas (029 DEFER), acessórios (030 PARTIAL),
quickservices/OS (031 DEFER), scale (032 DEFER). Nenhum GOAL separado
adicional se justifica.

## 2. PARTE E — Novo roadmap operacional (7 GOALs)

Agrupado por fronteira técnica/arquivos/risco/validação. Ordem sugerida:
N1 → N2 → N5 ∥ N3 → N4 → N6 → N7.

### N1 — PDV-MOTOR-INTEGRITY-001

- Objetivo: honestidade transacional ponta a ponta — `pending` nunca promete
  sucesso; nenhuma linha cobrada sem ser persistida; servidor revalida.
- Funde: P1-a + P1-b (§6 doc 002-003) + 023 + parte-030 (preservar
  `accessorySelection` na Completa).
- Risco: **alto (financeiro/transação)** — toca o caminho de finalização.
- Dependências: nenhuma (004/005 já na base).
- Resultado visível: venda pendente mantém carrinho + cupom "PENDENTE —
  AGUARDANDO NÚMERO" + CTA "Reenviar sync"; linha não resolvida bloqueia com
  nomes dos itens (padrão Black) em vez de cobrar e descartar.
- Arquivos/domínios prováveis: `lib/operations-store.tsx` (contrato
  `{ok,pending}` + erro estruturado), 6 callers PDV, `PaymentModal`/cupom,
  `lib/ops-upsert-venda.ts` + rotas `venda-persist`/`corrigir-itens`
  (revalidação), `venda-completa-enterprise.tsx:634` (preservar acessório).
- Revisão independente: **sim** (transação financeira; segundo par de olhos +
  teste em 2 lojas antes de merge).
- Obrigatório p/ "PDV finalizado": **SIM**.

### N2 — PDV-NEXT-ABSORB-002

- Objetivo: executar a decisão C — portar os componentes bons do Next para os
  PDVs atuais e eliminar as desonestidades do Next gated.
- Funde: salvados de 027 (DROPPED como reativação) + P2s de borda.
- Risco: médio (UI/UX, sem schema; fiscal intocado).
- Dependências: N1 (guards honestos antes de portar).
- Resultado visível: `ProductSearchPanel`, `ItemsTable`, `ShortcutBar`,
  `handleBipeKeyDown (3x + remoto)` e guard `linhasNaoResolvidas` reusáveis em
  `components/dashboard/vendas/*`; F6/F8/F11 do Black desabilitados com
  "Em breve" ou implementados; F7 sem copy de NF-e; `valorRecebido→cashTendered`
  ligado; turno/cupom escopados por loja+terminal; desconto + `customerStoreCredit`
  wirados; copy "nota fiscal" do HUB corrigida para "registro completo".
- Arquivos/domínios: `components/pdv-next/*`, `components/dashboard/vendas/*`,
  `VendasHub.tsx:42`.
- Revisão independente: não obrigatória (UI aditiva); pedir se mexer em caixa.
- Obrigatório: **SIM** (elimina botões mortos e troco fiscal divergente).

### N3 — PDV-SETTINGS-SERVER-FIRST-003

- Objetivo: banco como fonte da verdade de configuração; fim do split-brain.
- Funde: 013 + 015 + 016 + 017 (+ destinos do 014).
- Risco: médio-alto (migração multi-dispositivo; rollback por flag).
- Dependências: nenhuma técnica (G2 cumprido); telemetria de fallback ≈ 0 por
  N dias antes do cutover (N fixado no gate, sugestão 14).
- Resultado visível: `printerConfig.capabilities` versionado com PUT validado
  (só keys conhecidas; `available/entitled` nunca do cliente); precedência
  banco→migrado→legado→default; backfill único com marca; cutover com rollback;
  chaves globais (`pdv-black-turno/cupom`, `mesas-v1`) escopadas por loja
  (+terminal onde couber); `localStorage` rebaixado a cache.
- Arquivos/domínios: `app/api/stores/[id]/settings/route.ts`,
  `StoreSettingsProvider`, `lib/store-scoped-storage.ts`,
  `lib/pdv-*.ts`, `PdvSection.tsx` (dual-write), auditoria
  `recordConfigAuditChanges`.
- Revisão independente: **sim** (migração + segurança multi-loja).
- Obrigatório: **SIM** (consistência multi-dispositivo).

### N4 — PDV-CAPABILITY-RUNTIME-004

- Objetivo: contrato + runtime de capabilities, piloto no Classic e rollout às
  4 bordas — sem UI comercial.
- Funde: 006 + 007 + 008 + 009 + 012 + 022 + 024 + 025 + 026.
- Risco: médio (contrato puro + integração; comportamento default idêntico).
- Dependências: N1 (motor honesto), N3 (persistência).
- Resultado visível: ADRs P-01/03/04/05/06/07/08/10 aceitas ou rejeitadas por
  Rafael; `surface-ids`, `capabilities/types`, `resolveCapability` puro com
  tabela-verdade, `PdvRegistry` dirigindo o switcher, snapshot congelado em
  hold/fila com `capabilitiesVersion`, Classic pilotando (`pdv.tables`,
  `sales.paymentMethods`), rollout Assistência/Supermercado/Completa; Next
  participa como consumidor futuro.
- Arquivos/domínios: `lib/capabilities/*`, `lib/pdv/*`, `vendas-pdv.tsx`,
  `lib/pdv-hold.ts`, 4 bordas PDV.
- Revisão independente: **sim** no contrato (Opus/arquiteto); execução pode
  ser Sonnet/Codex por slice.
- Obrigatório: **SIM** (sem ele, capabilities viram ifs espalhados de novo).

### N5 — PDV-PARITY-SUITE-005

- Objetivo: suíte automatizada que impede regressão de paridade entre as 4
  bordas (+ componentes absorvidos do Next), com capability on/off e snapshot.
- Funde: 028 (KEEP, reescopado: Black≡SHELL absorvida, Rápido≡MODE).
- Risco: baixo (testes).
- Dependências: N1, N2 (comportamento honesto primeiro).
- Resultado visível: suíte verde em CI; relatório de paridade por recurso ×
  borda; Black/Rápido confirmados em runtime como shell/modo.
- Arquivos/domínios: `test/pdv/*` ou `e2e/pdv/*`, matriz §5 doc 002-003 como
  checklist.
- Revisão independente: não.
- Obrigatório: **SIM**.

### N6 — PDV-SETTINGS-UI-006 (FUTURE)

- Objetivo: Central de settings agregadora + painel PDV por loja/superfície.
- Funde: 011 + 018 + 019 + 020. Risco baixo-médio (UI sobre N3/N4).
- Dependências: N3, N4. Revisão: não. Obrigatório: **NÃO** (comercial/UX).

### N7 — PDV-ENTITLEMENT-BILLING-007 (FUTURE)

- Objetivo: mapa feature→plano por conta/tenant + gates de navegação/servidor.
- Funde: 010 + 021 (+ ADRs P-21/P-22). Risco alto-comercial (billing).
- Dependências: **decisão comercial explícita de Rafael** (G5) + N4.
- Revisão: **sim** + aprovação comercial. Obrigatório: **NÃO**.

## 3. Listas finais

### MUST HAVE BEFORE PDV FINAL

- N1 motor-integrity (pending honesto + fail-closed + revalidação server).
- N2 next-absorb (sem botão morto, sem troco divergente, sem copy desonesta).
- N3 settings-server-first (sem split-brain, chaves escopadas).
- N4 capability-runtime (contrato + resolver + registry + snapshot + rollout).
- N5 parity-suite verde em CI.
- Fixes P2 embutidos: `accessorySelection` na Completa (N1), turno/cupom e
  mesas escopados (N3), copy fiscal do HUB (N2).

### FUTURE / OPTIONAL

- N6 settings-UI comercial · N7 entitlement/billing (aguarda Rafael).
- Películas lookup modal (029) · accessory gating (030-gating) ·
  quickServices fora da Assistência + OS lookup (031) · trilha fracionada
  Int→decimal + balança (032/G13) · presets por segmento (ADR-P-13) ·
  remoção dos órfãos (`pdv-venda-completa-enterprise.tsx`, `PdvNeonShell`,
  `pdv-github-original`) — exige aprovação de Rafael, sem GOAL próprio.

## 4. Definition of Done — frente de PDV encerrada

1. **Integridade de venda**: nenhuma superfície promete sucesso com venda
   `pending`; nenhuma cobra linha não persistida (N1+N5 provam).
2. **Caixa/financeiro/estoque**: sessão por terminal exigida em todas as
   bordas; AR só nasce de venda confirmada; baixa de estoque 1:1 com linhas
   persistidas; troco exibido = troco fiscal.
3. **Paridade necessária**: matriz §5 sem PLACEHOLDER com botão ativo e sem
   AUSENTE crítico nas bordas de produção; componentes absorvidos cobertos
   pela suíte (N2+N5).
4. **Erros honestos**: todo bloqueio operacional diz o motivo + ação
   ("Reenviar sync", "Remova X", "Sem cadastro"); zero `catch` silencioso no
   caminho de venda.
5. **Multi-loja**: nenhuma chave operacional global sem `storeId`
   (+`terminalId` onde couber); teste loja A×B verde p/ settings (004) e
   holds/turno/cupom/mesas.
6. **Impressão**: cupom térmico + reimpressão/2ª via nas 4 bordas de produção;
   rodapé por loja; sem copy de documento fiscal inexistente.
7. **Offline/sync**: `pending` visível (badge + cupom PENDENTE); retry manual +
   automático; quarentena com recovery; snapshot congelado por venda.
8. **Next**: decisão C executada — ou absorvido e removido como rota, ou
   mantido gated como lab sem botão morto; nunca default sem paridade+G10.
9. **Capabilities**: contrato + resolver + registry + snapshot em runtime nas
   4 bordas (N4); UI comercial (N6) e billing (N7) fora do DoD.
10. **Testes**: N5 verde em CI + suíte 005 (fracionado) + matriz acesso 004
    sem regressão; nenhum novo `Math.round`/`filter` silencioso no caminho
    de venda sem teste fail-closed correspondente.
