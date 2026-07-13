# MASTER FISCAL EXECUTION PLAN

> **Documento de governança** da frente Fiscal do OmniGestão Pro.
> **Data:** 2026-06-24 · **Versão:** 1.1 · **Estado:** Fase 1 (Arquitetura oficial) consolidada
> **Citado por:** `prisma/schema.prisma:2077` (este é o doc que governa o schema fiscal).
> **Base factual:** `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md` +
> `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`.
> **Arquitetura oficial (Fase 1):** `docs/decisions/ADR-0008-fiscal-architecture.md` (princípios) +
> `docs/architecture/FISCAL_SCHEMA_DESIGN.md` + `NFCE_ARCHITECTURE.md` + `FISCAL_EVENTS.md` +
> `FISCAL_SECURITY.md` + `FISCAL_DRY_RUN.md`.

---

## 1. Propósito e princípios

Este plano governa a evolução da frente fiscal **do scaffold dormente atual até a emissão
de NFC-e em produção**, sem quebrar uma única venda real no caminho.

**Princípios inegociáveis (herdados do `CORE_RULES.md` + natureza fiscal):**

1. **Satélite, nunca no caminho crítico.** Fiscal é pós-commit da venda. O balcão nunca
   espera a SEFAZ. Emissão é **assíncrona** via `FiscalEmissaoJob`.
2. **Default-off por loja.** `ConfiguracaoFiscalLoja.fiscalEnabled = false`. Nada emite até
   uma loja ser explicitamente habilitada.
3. **Aditivo e dormente até o gate de ativação.** Cada fase entra desligada; só "liga" no
   final, loja a loja, em homologação primeiro.
4. **Provider-agnóstico.** Toda integração externa passa pelo contrato `FiscalProvider`.
   Trocar SEFAZ-direto por gateway (ou vice-versa) não toca o pipeline.
5. **Segredo só por referência.** Certificado/CSC/token nunca em coluna em claro nem no
   bundle do cliente. Cofre definido por ADR **antes** de qualquer `.pfx`.
6. **Multi-loja estrito.** Todo dado fiscal escopado por `storeId`. Sem fallback `loja-1`.
7. **XML é registro legal.** Uma vez autorizado, é imutável; alterações só por evento fiscal.

---

## 2. Estado atual (reconciliação de 2026-07-13)

> **Nota de reconciliação:** esta seção foi atualizada por extensão pelo
> `FISCAL-STATUS-RECONCILE-001`. Arquitetura, decisões, sequência, gates, princípios e histórico das
> demais seções permanecem vigentes. Fonte detalhada:
> `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md`.

| Fase | Estado factual | Evidência / bloqueio |
|---|---|---|
| F0 | governança vigente e reconciliada | plano, roadmap, ADR-0008 e relatório |
| F1 | decisão aceita; implementação interna parcial N3 | ADR-0009 + EnvVault; KMS ausente |
| F2 | código/testes N3, sem caller | `ba0cc12`; sem ST/CSOSN 500 |
| F3 | código/testes N3, sem caller | `ba0cc12`; validação XSD é placeholder |
| F4 | código/testes N3, sem caller | `ba0cc12`; C14N com desvios documentados |
| F5 | contrato/stub N1 | provider real ausente; G-F5 aberto |
| F6 | N0 | QR-Code/CSC operacional ausente |
| F7 | contrato de fila N1; guards em seis rotas | 0 jobs; sem produtor/worker; G-F7 aberto |
| F8 | N0 | DANFCE ausente |
| F9 | schema/stub N1 | 0 eventos; serviço real ausente |
| F10 | N0 | contingência ausente |
| F11 | N0 | zero prova SEFAZ em homologação |
| F12 | N0 | zero produção; G-F12 aberto |

Banco read-only: oito tabelas fiscais presentes, todas vazias; 721 vendas e zero com estado fiscal;
diff schema versus banco vazio. O dry-run existente permanece N3, não N4, porque XSD e C14N ainda
não produzem prova independente. **Não reimplementar F2–F4 do zero:** fechar as lacunas internas,
reconstruir o gate auferível e somente então avançar para F5.

---

## 3. Fases de execução (ordem exata)

Cada fase é uma sprint pequena, com Gate humano antes de começar e antes de mergear
(modelo `docs/execution/HUMAN_GATES.md`). Tamanho-alvo: ≤ 500 linhas de diff por skill.

### FASE 0 — Plano Mestre (este documento) ✅
- **Entregáveis:** readiness, gaps, plano mestre, roadmap. **Só documentação.**
- **DoD:** 4 docs criados; `tsc` limpo; nenhum código tocado.

### FASE 0.1 — Arquitetura oficial (Fiscal Fase 1) ✅
- **Entregáveis:** `ADR-0008-fiscal-architecture.md` (7 princípios) + 5 docs de arquitetura
  (`FISCAL_SCHEMA_DESIGN.md`, `NFCE_ARCHITECTURE.md`, `FISCAL_EVENTS.md`, `FISCAL_SECURITY.md`,
  `FISCAL_DRY_RUN.md`). **Só documentação** — nenhum código produtivo tocado.
- **DoD:** ADR + 5 docs criados; índices (`architecture`, `decisions`) atualizados; diagramas
  Mermaid; nada do `prisma/schema.prisma` nem de `lib/fiscal/**` alterado.
- **Nota:** a numeração de fases do plano (F1–F12) **não muda** — a arquitetura é fundação
  transversal a todas elas.

### FASE F1 — ADR do cofre de segredo `[GATE HUMANO OBRIGATÓRIO]` ✅
- **Objetivo:** decidir onde mora o `.pfx` A1, a senha e o token CSC (Supabase Vault × KMS × env por loja).
- **Entregue:** `docs/decisions/ADR-0009-fiscal-secret-vault.md` (aceita). **Decisão:** port único
  `FiscalSecretVault` com backend **EnvVault** (env por loja) no piloto/homologação e
  **KmsStorageVault** (envelope encryption + storage privado) na produção — mesmo contrato, sem
  mudança de schema. `blobRef`/`senhaRef`/`cscTokenRef` = referências opacas resolvidas server-side.
- **Não fazer:** subir qualquer certificado real antes da implementação do vault (F4).
- **DoD:** ADR aprovado pelo humano; sem código. **Gate G-F1 resolvido** → F4 destravada.

### FASE F2 — Motor de tributos NFC-e (Simples Nacional primeiro)
- **Objetivo:** calcular CSOSN/CST, base, alíquota, total de tributos por item.
- **Arquivos prováveis:** `lib/fiscal/tributos/*` (puro, testável), consumido pelo snapshot.
- **Escopo fechado:** **só** NFC-e B2C Simples Nacional (menor matriz). Regime Normal = fase posterior.
- **Não fazer:** generalizar para todos os regimes "de brinde".
- **DoD:** função pura + testes cobrindo CSOSN 102/500, origem 0–8; `tsc` limpo.

### FASE F3 — Geração de XML NFC-e + chave de acesso
- **Objetivo:** serializar `infNFe` 4.00 a partir do snapshot + tributos; calcular chave (44 díg + DV).
- **Arquivos prováveis:** `lib/fiscal/xml/*` (builder puro), novo método no provider real.
- **Não fazer:** assinar/transmitir ainda. Só gerar e validar contra XSD.
- **DoD:** XML válido contra schema XSD oficial (homologação); testes de chave/DV.

### FASE F4 — Assinatura digital A1 (XMLDSig) `[GATE: depende de F1]`
- **Objetivo:** carregar A1 do cofre (F1) e assinar `infNFe`.
- **Arquivos prováveis:** `lib/fiscal/assinatura/*`, adapter de cofre.
- **Não fazer:** logar segredo; expor `.pfx`/senha; rodar no client.
- **DoD:** XML assinado verificável; segredo nunca em log/trace; `tsc` limpo.

### GATE TÉCNICO — Dry-Run (entre F4 e F5) `[critério de entrada da F5]`
- **Objetivo:** rodar a esteira inteira (snapshot→tributos→XML→assinatura simulada→validação XSD)
  **sem transmitir** e **descartar o XML**, produzindo relatório de prontidão.
- **Arquitetura:** `docs/architecture/FISCAL_DRY_RUN.md`. Útil também em CI (golden cases).
- **Não fazer:** transmitir à SEFAZ; persistir documento legal; consumir numeração de produção;
  usar A1 real (certificado de teste).
- **DoD / critério de bloqueio:** **não se inicia a F5 sem Dry-Run verde** para os casos-alvo.
  Não recebe número próprio (evita renumerar F5–F12).

### FASE F5 — Provider real + transmissão SEFAZ `[GATE HUMANO: decisão provider]`
- **Objetivo:** implementar `FiscalProvider` real (SEFAZ direto **ou** gateway) e transmitir.
- **Arquivos prováveis:** `lib/fiscal/provider/<impl>.ts` registrado no `resolver.ts`.
- **Decisão de Gate:** SEFAZ direto vs gateway (Focus/PlugNotas/eNotas/NFE.io) — custo × esforço.
- **Não fazer:** apontar para produção. **Só HOMOLOGAÇÃO** nesta fase.
- **DoD:** documento autorizado em homologação SEFAZ (cStat 100) com chave/protocolo reais.

### FASE F6 — QR-Code NFC-e + URL de consulta (CSC)
- **Objetivo:** gerar QR-Code conforme CSC e URL por UF/ambiente.
- **Arquivos prováveis:** `lib/fiscal/qrcode/*`.
- **DoD:** QR-Code validado no portal da SEFAZ de homologação.

### FASE F7 — Ativação gated por fila `[GATE HUMANO: a manobra crítica]`
- **Objetivo:** ligar a emissão **assíncrona** para 1 loja-piloto em homologação.
- **Arquivos prováveis:** produtor pós-commit (enfileira em `FiscalEmissaoJob`), worker
  (drena fila → `emitirNotaFiscalVenda`), reflexo de status no PDV/recibo.
- **Não fazer (CRÍTICO):** emitir **inline** na transação de venda. Venda **commita primeiro**,
  fila emite depois. Falha fiscal **nunca** desfaz a venda.
- **DoD:** venda real (homologação) gera job → autoriza → status reflete; PDV não trava;
  rollback testado (desabilitar loja = parar de enfileirar, sem perder vendas).

### FASE F8 — DANFCE unificado (Roadmap #9)
- DANFCE com QR-Code sobre o **XML autorizado** (não sobre o carrinho).

### FASE F9 — Eventos fiscais (Roadmap #10)
- Cancelamento (janela legal), inutilização, CC-e → grava `EventoFiscal`, transmite,
  atualiza `NotaFiscal.status` + `Venda.fiscalStatus`.

### FASE F10 — Contingência (Roadmap #11 parte 1)
- Entrada/saída de contingência offline + reprocessamento da fila.

### FASE F11 — Homologação ampla (Roadmap #11)
- Bateria de casos contra SEFAZ homologação (todas as UFs-alvo, rejeições, denegação).

### FASE F12 — Produção `[GATE HUMANO FINAL]` (Roadmap #12)
- Virada de `ambiente` para `PRODUCAO` **por loja**, com checklist e rollback imediato.

---

## 3.1 Matriz consolidada de fases (gate · pronto · bloqueio · rollback)

> Visão única e oficial das fases F0–F12. **Gate** = exige aprovação humana antes de iniciar/
> mergear. **Critério de pronto (DoD)** = condição objetiva para encerrar. **Critério de bloqueio**
> = condição que **impede** iniciar/avançar. **Rollback** = como reverter com segurança.

| Fase | Gate | Critério de pronto (DoD) | Critério de bloqueio | Rollback |
|---|---|---|---|---|
| **F0** Plano Mestre | — | 4 docs Fase 0 + `tsc` limpo; código intocado | — | `git revert` (só docs) |
| **F0.1** Arquitetura oficial | — | ADR-0008 + 5 docs arquitetura + índices; sem código | — | `git revert` (só docs) |
| **F1** ADR cofre ✅ | 🔒 G-F1 ✅ | **ADR-0009 aceito** (EnvVault piloto / KmsStorageVault produção) | — (resolvido) | `git revert` (só doc) |
| **F2** Tributos | — | Função pura + testes (CSOSN 102/500, origem 0–8); `tsc` | Regime fora do escopo (só SN B2C) | `git revert` (aditivo) |
| **F3** XML | — | XML válido no XSD homologação; testes de chave/DV | Sem tributos (F2) | `git revert` (aditivo) |
| **F4** Assinatura | 🔒 depende G-F1 | XML assinado verificável; **segredo nunca logado** | Cofre indefinido (F1); segredo em log/bundle | `git revert` (aditivo) |
| **Dry-Run** | técnico | Relatório de prontidão **verde** p/ casos-alvo | XSD inválido / pendência tributária | n/a (não transmite/persiste) |
| **F5** SEFAZ | 🔒 G-F5 | Documento autorizado em homologação (cStat 100) | Dry-Run não-verde; provider não decidido | resolver→STUB / contingência |
| **F6** QR-Code | — | QR validado no portal SEFAZ homologação | Sem autorizado (F5) | `git revert` (aditivo) |
| **F7** Ativação por fila | 🔒 G-F7 | Venda real (homolog.) → job → autoriza; **PDV não trava**; rollback testado | **Emissão inline** (proibido); F2–F6 incompletos | `fiscalEnabled=false` (para de enfileirar) |
| **F8** DANFCE | — | DANFCE com QR sobre **XML autorizado** | Sem autorizado (F5) | `git revert` (aditivo) |
| **F9** Eventos | — | Evento autorizado + status refletido | Sem nota AUTORIZADA (F5) | `git revert` + evento não-emitido |
| **F10** Contingência | — | Entra/sai de contingência; fila reprocessa | Sem F5 + política de retry | `git revert`; jobs reprocessam |
| **F11** Homologação ampla | — | Casos felizes + rejeição/denegação verdes (por UF) | Qualquer caso-alvo falhando | manter em homologação |
| **F12** Produção | 🔒 G-F12 | NFC-e autorizada em produção na loja-piloto | F11 incompleta; sem checklist/rollback | `ambiente=HOMOLOGACAO` + kill-switch |

> **Invariante transversal:** falha fiscal **nunca** desfaz a venda; XML autorizado **nunca** é
> apagado (correção é por evento). Detalhe por princípio em `ADR-0008 §2` (P1–P7).

---

## 4. Gates humanos obrigatórios

| Gate | Antes de | Decisão do humano |
|---|---|---|
| G-F1 ✅ | Qualquer manuseio de certificado | Aprovar ADR do cofre de segredo → **resolvido: ADR-0009** |
| G-F5 | Integração externa | SEFAZ direto vs gateway (custo/esforço) |
| G-F7 | Ligar emissão | Aprovar ativação na loja-piloto (homologação) |
| G-F12 | Produção | Aprovar virada `HOMOLOGACAO → PRODUCAO` por loja |

Nenhuma fase com `[GATE]` inicia sem aprovação explícita registrada.

---

## 5. Critérios de pronto (DoD transversal)

Toda fase fiscal só encerra com:

- [ ] `npx tsc --noEmit` limpo.
- [ ] Testes da camada (puro primeiro) verdes; `npm run build` quando tocar rota/Server Action/Prisma.
- [ ] Nenhuma área protegida tocada sem autorização (`CORE_RULES §5`).
- [ ] Segredo nunca em log/bundle/coluna em claro.
- [ ] `fiscalEnabled` permanece `false` exceto na loja-piloto explicitamente habilitada.
- [ ] Relatório final (`DELIVERY_CHECKLIST §4`) + ADR quando houver decisão arquitetural.

---

## 6. O que NÃO fazer (proibições permanentes)

- ❌ **Reimplementar** GOALs 001B–008 (já entregues).
- ❌ Emitir **inline** na transação de venda (sempre fila pós-commit).
- ❌ Deixar falha fiscal **desfazer/bloquear** a venda.
- ❌ Subir `.pfx`/senha antes do ADR do cofre (F1).
- ❌ Apontar para **produção** sem passar por homologação ampla (F11) e Gate G-F12.
- ❌ Ligar emissão para **todas** as lojas de uma vez (sempre loja-a-loja).
- ❌ Hardcode de UF/CSC/credencial no código (sempre por `ConfiguracaoFiscalLoja` + cofre).
- ❌ Tocar `auth`/`proxy`/`lib/prisma.ts`/`next.config` a pretexto fiscal.

---

## 7. Estratégia de homologação

1. **Provider STUB → Provider real (homologação)**: o `resolver.ts` troca a implementação
   por `storeId.provider`; o STUB continua disponível para CI/testes.
2. **Ambiente HOMOLOGACAO** fixo em `ConfiguracaoFiscalLoja.ambiente` até F12.
3. **Loja-piloto única** habilitada (`fiscalEnabled = true`, ambiente homologação).
4. Bateria de casos: autorização feliz, rejeição (cStat ≠ 100), denegação, timeout →
   contingência, cancelamento dentro/fora da janela, inutilização.
5. Só após F11 verde, abre-se o Gate de produção.

---

## 8. Estratégia para não quebrar vendas reais

- **Pós-commit, sempre.** Venda persiste e fecha o caixa **antes** de qualquer ato fiscal.
- **Fila desacoplada** (`FiscalEmissaoJob`) com lock/retry/dedupe; o PDV só **enfileira**.
- **Default-off**: lojas não habilitadas não enfileiram nada → comportamento idêntico ao atual.
- **State machine no-op**: enquanto `NAO_FISCAL`, as rotas `corrigir*`/`cancelar` operam como hoje.
- **Kill-switch por loja**: `fiscalEnabled = false` para de enfileirar imediatamente, sem
  afetar vendas em andamento nem histórico.

---

## 9. Estratégia multi-loja

- Toda tabela fiscal já é escopada por `storeId` (sem `@default("loja-1")`, ADR-0003).
- Identidade, certificado, série, CSC e provider são **por loja** (`ConfiguracaoFiscalLoja`).
- Habilitação é **por loja**: piloto → ondas. Uma loja em produção não afeta as demais.
- Numeração é por `(storeId, modelo, serie, ambiente)` — sem colisão entre lojas.

---

## 10. Estratégia de rollback

| Situação | Rollback |
|---|---|
| Fase em código quebra algo | `git revert` da fase (aditiva/dormente — baixo risco). |
| Emissão piloto com problema | `fiscalEnabled = false` na loja → para de enfileirar. Jobs pendentes ficam para reprocessar/cancelar. |
| Provider real instável | `resolver` volta para STUB ou entra em contingência. |
| Produção com incidente | `ambiente = HOMOLOGACAO` na loja + kill-switch; documentos já autorizados são imutáveis (tratar por evento, não por delete). |
| Schema (só se inevitável) | Migração **aditiva** reversível; ver checklist §11. |

> XML autorizado **nunca** é apagado para "desfazer" — correção fiscal é por evento.

---

## 11. Checklist ANTES de tocar no Prisma

A fundação fiscal já existe; novas fases devem **evitar** mexer no schema. Se for inevitável:

- [ ] A mudança é **aditiva** (nova coluna nullable / nova tabela)? Alteração destrutiva exige ADR.
- [ ] Autorização **explícita** do usuário (CORE_RULES §5 — schema é área protegida).
- [ ] Não quebra os `@@unique` fiscais existentes (`localKey`, série, chave de acesso).
- [ ] Mantém segredo por referência (sem coluna de `.pfx`/senha/token em claro).
- [ ] Mantém multi-loja estrito (sem `@default("loja-1")`).
- [ ] Plano de migração com `DIRECT_URL` (porta 5432) e janela; `db push` só em dev.
- [ ] Rollback da migração descrito.
- [ ] `prisma generate` + `npm run build` validados.
- [ ] ADR registrado se muda contrato entre módulos.

---

## 12. Referências

- Auditorias: `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md`,
  `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`.
- Roadmap: `docs/roadmaps/ROADMAP_FISCAL.md`.
- Governança: `docs/skills/rules/CORE_RULES.md`, `docs/execution/HUMAN_GATES.md`,
  `docs/decisions/INDEX.md` (ADRs).
- Código vivo: `lib/fiscal/**`, `prisma/schema.prisma` (bloco fiscal ~L2075+),
  `app/api/fiscal/**`, `components/configuracoes-v3/.../FiscalSection.tsx`.
- Arquitetura oficial (Fase 1, criada): `docs/decisions/ADR-0008-fiscal-architecture.md`,
  `docs/architecture/FISCAL_SCHEMA_DESIGN.md`, `docs/architecture/NFCE_ARCHITECTURE.md`,
  `docs/architecture/FISCAL_EVENTS.md`, `docs/architecture/FISCAL_SECURITY.md`,
  `docs/architecture/FISCAL_DRY_RUN.md`.
- Cofre de segredos (F1, decidido): `docs/decisions/ADR-0009-fiscal-secret-vault.md`.
  - **Nota de nomenclatura:** o comentário `schema.prisma:2077` cita `FISCAL_SCHEMA_DESIGN_v01.md`
    e `venda-fiscal-state-machine.ts:13` cita `NFCE_ARCHITECTURE §17/§18`. Os docs oficiais foram
    criados **sem sufixo `_v01`** (versionamento via git/ADR, padrão do projeto). Os comentários
    de código apontam à versão histórica; **não foram alterados** (schema/código são área protegida).
    `NFCE_ARCHITECTURE.md` mapeia §17/§18 → §6/§7.

---

*Documento vivo de governança. Mudanças estruturais de plano exigem ADR.*
